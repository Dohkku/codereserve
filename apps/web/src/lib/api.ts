const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies automatically
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Repositories
export async function getRepositories() {
  return fetchWithAuth('/api/repos');
}

export async function getRepository(id: string) {
  return fetchWithAuth(`/api/repos/${id}`);
}

export async function updateRepository(id: string, data: {
  treasuryAddress?: string;
  riskThreshold?: number;
  depositAmount?: string;
  isActive?: boolean;
}) {
  return fetchWithAuth(`/api/repos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function addToWhitelist(repoId: string, userId: string, reason?: string) {
  return fetchWithAuth(`/api/repos/${repoId}/whitelist`, {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  });
}

export async function addToBlacklist(repoId: string, userId: string, reason?: string) {
  return fetchWithAuth(`/api/repos/${repoId}/blacklist`, {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  });
}

// Pull Requests
export async function getPullRequests(repoId?: string, state?: string) {
  const params = new URLSearchParams();
  if (repoId) params.set('repoId', repoId);
  if (state) params.set('state', state);
  return fetchWithAuth(`/api/prs?${params}`);
}

export async function getPullRequest(id: string) {
  return fetchWithAuth(`/api/prs/${id}`);
}

export async function getUserPullRequests() {
  return fetchWithAuth('/api/prs/user/me');
}

export async function markPRAsSpam(id: string) {
  return fetchWithAuth(`/api/prs/${id}/mark-spam`, { method: 'POST' });
}

export async function approvePR(id: string) {
  return fetchWithAuth(`/api/prs/${id}/approve`, { method: 'POST' });
}

// Deposits
export async function getDepositInfo(repo: string, prNumber: number) {
  const params = new URLSearchParams({ repo, pr: prNumber.toString() });
  return fetchWithAuth(`/api/deposits/info?${params}`);
}

export async function recordDeposit(prId: string, txHash: string, onchainId: string) {
  return fetchWithAuth('/api/deposits', {
    method: 'POST',
    body: JSON.stringify({ prId, txHash, onchainId }),
  });
}

export async function getUserDeposits() {
  return fetchWithAuth('/api/deposits/user/me');
}

export async function requestRefund(depositId: string) {
  return fetchWithAuth(`/api/deposits/${depositId}/refund`, { method: 'POST' });
}

export async function requestSlash(depositId: string) {
  return fetchWithAuth(`/api/deposits/${depositId}/slash`, { method: 'POST' });
}

export async function confirmRefund(depositId: string, txHash: string) {
  return fetchWithAuth(`/api/deposits/${depositId}/confirm-refund`, {
    method: 'POST',
    body: JSON.stringify({ txHash }),
  });
}

// Auth
export async function linkWallet(walletAddress: string) {
  return fetchWithAuth('/api/auth/wallet', {
    method: 'PUT',
    body: JSON.stringify({ walletAddress }),
  });
}
