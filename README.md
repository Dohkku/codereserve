# CodeReserve

**Stop spam PRs. Protect your open source repo.**

CodeReserve filters low-quality pull requests by requiring new contributors to make a small refundable deposit. Trusted contributors skip this step entirely.

[Install GitHub App](https://github.com/apps/codereserver) · [Website](https://codereserve.org)

> **Note:** This project is in active development. Features may change and bugs may exist. If you find any issues or have suggestions, please [open an issue](https://github.com/Dohkku/codereserve/issues). Contributions welcome!

---

## The Problem

Open source maintainers waste hours reviewing spam PRs:
- AI-generated "fixes" that break code
- Hacktoberfest drive-by contributions
- Low-effort typo PRs from farming accounts

## The Solution

CodeReserve analyzes each PR author's reputation:

| Contributor Type | What Happens |
|------------------|--------------|
| **Trusted** (established account, past contributions) | PR proceeds normally |
| **New/Unknown** (new account, no history) | Deposit $5 USDC to open PR |
| **Whitelisted** | Always trusted |
| **Blacklisted** | Always blocked |

**The deposit is fully refunded when the PR is merged or closed normally.** If a maintainer marks the PR as spam, the deposit goes to the project treasury.

### Why It Works

- Spammers won't pay $5 to submit junk
- Legitimate contributors get their money back
- Funds are held in a trustless smart contract on Base
- If our servers go down, deposits auto-refund after 30 days

---

## Quick Start

### For Repository Owners

1. **[Install the GitHub App](https://github.com/apps/codereserver)** on your repositories
2. Configure settings in the dashboard (optional)
3. That's it. New PRs are automatically filtered.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Risk Threshold | 60 | Score above this requires deposit |
| Deposit Amount | $5 USDC | Required deposit for new contributors |
| Treasury Address | Your wallet | Where slashed deposits go |

---

## How Risk Scores Work

Each contributor gets a score from 0-100. Lower is better.

| Factor | Effect |
|--------|--------|
| Account age < 1 month | +20 |
| Account age > 2 years | -30 |
| Previous merged PRs | -8 each (max -40) |
| Verified email | -5 |
| 50+ followers | -10 |
| Whitelisted by you | Score = 0 |
| Blacklisted by you | Score = 100 |

Base score: 50

---

## For Developers

### Tech Stack

- **API**: Hono (Node.js) + Drizzle ORM + SQLite
- **Web**: Next.js 15 + wagmi + RainbowKit
- **Contracts**: Solidity + Foundry on Base L2
- **Auth**: GitHub OAuth

### Project Structure

```
codereserve/
├── apps/
│   ├── api/          # Backend API
│   └── web/          # Dashboard (Next.js)
├── packages/
│   ├── contracts/    # Smart contracts (Foundry)
│   ├── db/           # Database schema (Drizzle)
│   └── shared/       # Shared types
```

### Local Development

```bash
# Install dependencies
npm install

# Install Foundry deps
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
cd ../..

# Copy environment variables
cp .env.production.example .env
# Edit .env with your values

# Run all services
npm run dev
```

### Smart Contract

The escrow contract is fully trustless with no admin functions:

```solidity
deposit(repoId, prNumber, treasury, amount)  // Contributor deposits
refund(depositId, deadline, signature)        // Backend authorizes refund
slash(depositId, deadline, signature)         // Backend authorizes slash
claimTimeout(depositId)                       // Anyone can reclaim after 30 days
```

Deployed on Base Sepolia: [`0xfD5DD56a5Ee1E8DcBb31Bf1F1f61aCab3DF0A804`](https://sepolia.basescan.org/address/0xfD5DD56a5Ee1E8DcBb31Bf1F1f61aCab3DF0A804)

### Running Tests

```bash
# API tests
npm run test --filter=@codereserve/api

# Contract tests
npm run forge:test
```

---

## License

MIT
