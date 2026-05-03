# MOODMARGIN

MOODMARGIN is a dark fintech meme coin perpetual trading demo with GenLayer-powered token risk intelligence.

## Stack
- React + Vite frontend
- Express API backend
- PostgreSQL with Drizzle ORM
- wagmi wallet integration
- DexScreener market data
- RugCheck risk data
- Groq-powered explanations
- GenLayer read-only verdicts

## Flow
1. User enters token contract address and network
2. Backend fetches RugCheck data when available
3. GenLayer produces the verdict
4. Groq explains the result in plain language
5. Market status and leverage limits update from the verdict

## Routes
- `/` landing
- `/markets` market list with verdict-gated trade buttons
- `/trade/:symbol` trading screen with verdict banners and leverage caps
- `/risk` risk board with AI explanations
- `/submit` community token submission
- `/dashboard` wallet dashboard
- `/faucet` test MMUSD faucet
- `/leaderboard` top traders

## API Routes
- `GET /api/markets` — market list (AVOID hidden unless includeAvoid=true)
- `GET /api/markets/:symbol` — single market
- `GET /api/risk/reviews` — GenLayer risk reviews
- `POST /api/risk/submit` — submit token for review
- `GET /api/risk/listing-requests` — community listing queue
- `POST /api/trading/positions` — open position
- `POST /api/trading/positions/:id/close` — close position

## Verdict Rules
| Verdict | Listing | Max Leverage | Notes |
|---------|---------|--------------|-------|
| WATCH | Normal | 5x | Standard listing |
| RESTRICT | Warning banner | 2x | Elevated risk |
| AVOID | Hidden, blocked | — | No trading |

## Notes
- API server and web app run through Replit workflows
- Repository includes `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, and `tsconfig.json`
- Set `ADMIN_PASSWORD`, `GROQ_API_KEY`, `SESSION_SECRET` as environment secrets
- Backend services must read `PORT`
