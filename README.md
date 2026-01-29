# CodeReserve

Reputation-based PR filtering for open source projects. New contributors deposit a small amount that is fully refunded when their PR is merged.

## Architecture

```
GitHub (Webhooks)
       │
       ▼
┌──────────────────────────────┐
│     Backend (Hono API)       │
│  - Webhook handler           │
│  - Risk calculator           │
│  - GitHub actions            │
│  - Sign refund/slash txs     │
└──────────────┬───────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌─────────────────┐
│  SQLite    │  │ Smart Contract  │
│  (state)   │  │ (Base L2)       │
└────────────┘  └─────────────────┘
                       ▲
                       │
               ┌───────┴───────┐
               │   Dashboard    │
               │   (Next.js)    │
               └───────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm 10+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)

### Installation

```bash
# Clone and install
cd codereserve
npm install

# Install Foundry dependencies
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
cd ../..

# Copy environment variables
cp .env.example .env
# Edit .env with your values
```

### Development

```bash
# Run all services
npm run dev

# Or run individually
npm run dev --filter=@codereserve/api
npm run dev --filter=@codereserve/web
```

### Smart Contract

```bash
# Build
npm run forge:build

# Test
npm run forge:test

# Deploy to Base Sepolia
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
```

## Project Structure

```
codereserve/
├── apps/
│   ├── api/                    # Backend Hono API
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   ├── webhooks/       # GitHub webhook handler
│   │   │   ├── services/       # Business logic
│   │   │   └── routes/         # API routes
│   │   └── package.json
│   │
│   └── web/                    # Dashboard Next.js
│       ├── src/app/
│       │   ├── page.tsx        # Landing page
│       │   ├── dashboard/      # Dashboard pages
│       │   └── deposit/        # Deposit flow
│       └── package.json
│
├── packages/
│   ├── contracts/              # Smart contracts (Foundry)
│   │   ├── src/
│   │   │   └── CodeReserveEscrow.sol
│   │   ├── test/
│   │   └── foundry.toml
│   │
│   ├── db/                     # Database schema (Drizzle)
│   │   ├── src/schema.ts
│   │   └── drizzle.config.ts
│   │
│   └── shared/                 # Shared types
│       └── src/index.ts
│
├── turbo.json
└── package.json
```

## How It Works

### Risk Score Calculation

| Factor | Modifier |
|--------|----------|
| Account < 1 month | +20 |
| Account > 2 years | -30 |
| Each merged PR | -8 (max -40) |
| Verified email | -5 |
| 50+ followers | -10 |
| Whitelisted | = 0 |
| Blacklisted | = 100 |

Base score: 50. If score > threshold → deposit required.

### Flows

**Trusted Contributor (low score):**
```
PR opened → Score = 25 → Label "CR-Trusted" → Normal review
```

**New Contributor (deposit required):**
```
PR opened → Score = 75 → PR closed with instructions
         → User deposits $5 USDC
         → PR reopened → Merged → Refund
```

**Spam PR:**
```
Maintainer clicks "Mark Spam" → Backend signs slash
                              → $5 goes to treasury
```

## Smart Contract

The escrow contract is trustless with no admin functions:

- `deposit(repoId, prNumber, treasury, amount)` - Contributor deposits USDC
- `refund(depositId, deadline, signature)` - Backend authorizes refund
- `slash(depositId, deadline, signature)` - Backend authorizes slash for spam
- `claimTimeout(depositId)` - Anyone can reclaim after 30 days

**Security**: If the backend disappears, funds auto-refund after 30 days.

## Configuration

### GitHub App

1. Create a GitHub App at https://github.com/settings/apps
2. Set webhook URL to `https://your-api.com/webhooks/github`
3. Enable events: `Pull request`, `Installation`
4. Generate a private key
5. Add environment variables to `.env`

### Environment Variables

See `.env.example` for all required variables.

## License

MIT
