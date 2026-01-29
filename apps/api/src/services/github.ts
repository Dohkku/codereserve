import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

interface GitHubUserInfo {
  id: number;
  login: string;
  email: string | null;
  avatarUrl: string;
  createdAt: string;
  followers: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOctokit = any;

export function createGitHubService() {
  const appId = process.env.GITHUB_APP_ID || 'dev';
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || 'dev').replace(/\\n/g, '\n');

  // Create GitHub App instance (will fail on actual API calls if credentials are invalid)
  let app: App | null = null;
  try {
    app = new App({
      appId,
      privateKey,
      oauth: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      },
    });
  } catch (error) {
    console.warn('GitHub App initialization failed - GitHub features will be unavailable:', error);
  }

  /**
   * Get Octokit instance for an installation
   */
  async function getInstallationOctokit(installationId: number): Promise<AnyOctokit> {
    if (!app) {
      throw new Error('GitHub App not configured - please set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
    }
    return await app.getInstallationOctokit(installationId);
  }

  /**
   * Get user info from GitHub
   */
  async function getUserInfo(
    octokit: AnyOctokit,
    username: string
  ): Promise<GitHubUserInfo> {
    const { data } = await octokit.users.getByUsername({ username });
    return {
      id: data.id,
      login: data.login,
      email: data.email,
      avatarUrl: data.avatar_url,
      createdAt: data.created_at,
      followers: data.followers,
    };
  }

  /**
   * Get count of merged PRs by a user in a repo
   */
  async function getMergedPRCount(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    author: string
  ): Promise<number> {
    try {
      const { data } = await octokit.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} type:pr author:${author} is:merged`,
        per_page: 1,
      });
      return data.total_count;
    } catch (error) {
      console.error('Error getting merged PR count:', error);
      return 0;
    }
  }

  /**
   * Close a PR with a comment
   */
  async function closePRWithComment(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    prNumber: number,
    comment: string
  ): Promise<void> {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
    });

    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  /**
   * Reopen a PR
   */
  async function reopenPR(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    prNumber: number,
    comment?: string
  ): Promise<void> {
    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'open',
    });

    if (comment) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      });
    }
  }

  /**
   * Add label to PR
   */
  async function addLabel(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    prNumber: number,
    label: string
  ): Promise<void> {
    try {
      await octokit.issues.getLabel({ owner, repo, name: label });
    } catch {
      const labelColors: Record<string, string> = {
        'CR-Trusted': '0e8a16',
        'CR-Pending-Deposit': 'fbca04',
        'CR-Spam': 'd93f0b',
        'CR-Deposit-Active': '0366d6',
      };

      await octokit.issues.createLabel({
        owner,
        repo,
        name: label,
        color: labelColors[label] || '666666',
        description: `CodeReserve: ${label}`,
      });
    }

    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: [label],
    });
  }

  /**
   * Remove label from PR
   */
  async function removeLabel(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    prNumber: number,
    label: string
  ): Promise<void> {
    try {
      await octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: label,
      });
    } catch {
      // Label might not exist
    }
  }

  /**
   * Check if user has write access to repo
   */
  async function hasWriteAccess(
    octokit: AnyOctokit,
    owner: string,
    repo: string,
    username: string
  ): Promise<boolean> {
    try {
      const { data } = await octokit.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });
      return ['admin', 'write'].includes(data.permission);
    } catch {
      return false;
    }
  }

  /**
   * Exchange OAuth code for access token
   */
  async function exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    if (!app) {
      throw new Error('GitHub App not configured - please set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY');
    }
    const result = await app.oauth.createToken({ code });
    return {
      accessToken: result.authentication.token,
      refreshToken: (result.authentication as Record<string, unknown>).refreshToken as string | undefined,
      expiresAt: (result.authentication as Record<string, unknown>).expiresAt
        ? new Date((result.authentication as Record<string, unknown>).expiresAt as string)
        : undefined,
    };
  }

  /**
   * Get authenticated user from access token
   */
  async function getAuthenticatedUser(accessToken: string): Promise<GitHubUserInfo> {
    const octokit = new Octokit({ auth: accessToken });
    const { data } = await octokit.users.getAuthenticated();
    return {
      id: data.id,
      login: data.login,
      email: data.email,
      avatarUrl: data.avatar_url,
      createdAt: data.created_at,
      followers: data.followers,
    };
  }

  /**
   * Generate deposit instructions comment
   */
  function generateDepositComment(
    repoFullName: string,
    prNumber: number,
    depositAmount: string,
    dashboardUrl: string
  ): string {
    return `## CodeReserve: Deposit Required

Your account doesn't meet the trust threshold for this repository. To open this PR, you need to deposit **$${depositAmount} USDC** as a security deposit.

### Why is this required?

This repository uses CodeReserve to protect against spam PRs. New or unknown contributors are asked to make a small deposit that is **fully refunded** when the PR is merged or closed by a maintainer.

### How to proceed:

1. Go to the [CodeReserve Dashboard](${dashboardUrl}/deposit?repo=${encodeURIComponent(repoFullName)}&pr=${prNumber})
2. Connect your wallet (MetaMask, Coinbase Wallet, etc.)
3. Approve and deposit $${depositAmount} USDC on Base
4. Your PR will be automatically reopened

### What happens to my deposit?

- **PR Merged/Closed normally**: Your deposit is refunded
- **PR marked as spam**: Deposit goes to the repository treasury
- **No action for 30 days**: You can reclaim your deposit

---

*This is an automated message from [CodeReserve](https://codereserve.io)*`;
  }

  /**
   * Generate trusted contributor comment
   */
  function generateTrustedComment(): string {
    return `## CodeReserve: Trusted Contributor

Your account meets the trust threshold for this repository. Your PR will be processed normally.

---

*This is an automated message from [CodeReserve](https://codereserve.io)*`;
  }

  return {
    app,
    getInstallationOctokit,
    getUserInfo,
    getMergedPRCount,
    closePRWithComment,
    reopenPR,
    addLabel,
    removeLabel,
    hasWriteAccess,
    exchangeCodeForToken,
    getAuthenticatedUser,
    generateDepositComment,
    generateTrustedComment,
  };
}

export type GitHubService = ReturnType<typeof createGitHubService>;
