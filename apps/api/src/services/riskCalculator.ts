import {
  RiskScoreInput,
  RiskScoreResult,
  RiskFactor,
  RISK_SCORE_BASE,
  RISK_SCORE_MODIFIERS,
} from '@codereserve/shared';

/**
 * Calculate risk score for a GitHub user
 *
 * Base score: 50
 *
 * Modifiers:
 * - Account < 1 month:        +20 (more risk)
 * - Account > 2 years:        -30 (less risk)
 * - Each PR merged:           -8  (max -40)
 * - Email verified:           -5
 * - 50+ followers:            -10
 * - Whitelisted:              = 0 (always trusted)
 * - Blacklisted:              = 100 (always blocked)
 */
export function calculateRiskScore(input: RiskScoreInput, threshold: number): RiskScoreResult {
  const factors: RiskFactor[] = [];

  // Whitelisted users always get score 0
  if (input.isWhitelisted) {
    return {
      score: 0,
      requiresDeposit: false,
      factors: [
        {
          name: 'Whitelisted',
          modifier: RISK_SCORE_MODIFIERS.WHITELISTED,
          reason: 'User is whitelisted by maintainer',
        },
      ],
    };
  }

  // Blacklisted users always get score 100
  if (input.isBlacklisted) {
    return {
      score: 100,
      requiresDeposit: true, // Or reject entirely
      factors: [
        {
          name: 'Blacklisted',
          modifier: RISK_SCORE_MODIFIERS.BLACKLISTED,
          reason: 'User is blacklisted by maintainer',
        },
      ],
    };
  }

  let score = RISK_SCORE_BASE;

  // Account age
  const oneMonth = 30;
  const twoYears = 365 * 2;

  if (input.accountAgeDays < oneMonth) {
    score += RISK_SCORE_MODIFIERS.ACCOUNT_NEW;
    factors.push({
      name: 'New Account',
      modifier: RISK_SCORE_MODIFIERS.ACCOUNT_NEW,
      reason: `Account is less than 1 month old (${input.accountAgeDays} days)`,
    });
  } else if (input.accountAgeDays > twoYears) {
    score += RISK_SCORE_MODIFIERS.ACCOUNT_OLD;
    factors.push({
      name: 'Established Account',
      modifier: RISK_SCORE_MODIFIERS.ACCOUNT_OLD,
      reason: `Account is over 2 years old (${Math.floor(input.accountAgeDays / 365)} years)`,
    });
  }

  // Merged PRs (capped at -40)
  if (input.mergedPRCount > 0) {
    const prModifier = Math.max(
      input.mergedPRCount * RISK_SCORE_MODIFIERS.PR_MERGED,
      RISK_SCORE_MODIFIERS.PR_MERGED_MAX
    );
    score += prModifier;
    factors.push({
      name: 'Merged PRs',
      modifier: prModifier,
      reason: `${input.mergedPRCount} previously merged PR(s)`,
    });
  }

  // Email verified
  if (input.emailVerified) {
    score += RISK_SCORE_MODIFIERS.EMAIL_VERIFIED;
    factors.push({
      name: 'Verified Email',
      modifier: RISK_SCORE_MODIFIERS.EMAIL_VERIFIED,
      reason: 'User has verified email address',
    });
  }

  // Followers
  if (input.followerCount >= 50) {
    score += RISK_SCORE_MODIFIERS.MANY_FOLLOWERS;
    factors.push({
      name: 'Many Followers',
      modifier: RISK_SCORE_MODIFIERS.MANY_FOLLOWERS,
      reason: `${input.followerCount} followers (50+ threshold)`,
    });
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    requiresDeposit: score > threshold,
    factors,
  };
}

/**
 * Get account age in days from created_at timestamp
 */
export function getAccountAgeDays(createdAt: string | Date): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
