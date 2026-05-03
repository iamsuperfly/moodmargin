# MoodMargin Workspace

## Overview

pnpm workspace monorepo using TypeScript. MOODMARGIN is a full production-ready meme coin perpetual trading demo platform with GenLayer-powered token risk intelligence.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, Tailwind CSS v4, wouter routing, TanStack Query
- **Wallet**: wagmi v3 (injected connector), no RainbowKit
- **AI**: Groq SDK (llama-3.1-8b-instant) for risk explanations
- **Price data**: DexScreener API
- **Risk intelligence**: GenLayer contract (read-only)

## Artifacts

### `artifacts/moodmargin` — Frontend (port 18375, preview at `/`)
React + Vite frontend with dark purple/electric theme. Pages:
- `/` — Landing page with hero, live stats, featured markets
- `/markets` — Market table with search, filter by verdict
- `/trade/:symbol` — Perpetual order panel (long/short/leverage), simulated chart
- `/risk` — Risk Board with GenLayer AI verdict cards + AI Explain (Groq)
- `/faucet` — Claim 1000 MMUSD every 24h
- `/leaderboard` — Top traders by PnL (all/week/today)
- `/submit` — Submit token for GenLayer review
- `/dashboard` — Wallet-gated portfolio overview

### `artifacts/api-server` — Backend API (port 8080, routed at `/api`)
Express 5 REST API with Drizzle ORM.
Routes: `/api/markets`, `/api/risk`, `/api/trading`, `/api/faucet`, `/api/wallet`, `/api/leaderboard`, `/api/ai`

### `lib/api-spec` — OpenAPI spec + codegen
OpenAPI YAML → Orval codegen → `lib/api-client-react` (React Query hooks) + Zod schemas.

### `lib/db` — Drizzle ORM schema
Tables: `wallets`, `markets`, `positions`, `faucet_claims`, `listing_requests`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Environment Variables Needed

- `GROQ_API_KEY` — Groq AI for risk explanations on Risk Board
- `GENLAYER_RPC_URL` — GenLayer node RPC for on-chain risk data
- `GENLAYER_CONTRACT_ADDRESS` — Deployed MoodMargin GenLayer contract
- `VITE_WALLETCONNECT_PROJECT_ID` — Optional, for WalletConnect support

## Trading Rules (GenLayer verdict enforcement)
- `WATCH` → max 5x leverage, normal trading
- `RESTRICT` → max 2x leverage, shows warning banner
- `AVOID` → trading disabled entirely

## GitHub
Repo: github.com/iamsuperfly/moodmargin
GenLayer contract at `contract/moodmargin.py` — DO NOT modify

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
