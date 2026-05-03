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
- `/admin` hidden admin panel (password-protected, not linked from nav)
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
- `GET /api/admin/*` — admin endpoints (requires X-Admin-Key header)

## Admin Panel (`/admin`)
Hidden route, not linked from navbar. Password-gated via `ADMIN_PASSWORD` env var.

### Sections
- **Stats**: unique wallets, total volume, open positions, PnL, verdict breakdown, most traded
- **Markets**: all listed tokens with live verdict override and remove controls
- **Listings**: community listing queue — approve (auto-creates market) or reject
- **Add Token**: whitelist a new token by CA + chain, bypassing community queue
- **Live Memecoins**: top boosted and highest-volume meme pairs from DexScreener

### Setup
Set `ADMIN_PASSWORD` as an environment variable on the server. The frontend stores the key in `localStorage` after first login.

## Verdict Rules
| Verdict | Listing | Max Leverage | Notes |
|---------|---------|--------------|-------|
| WATCH | Normal | 5x | Standard listing |
| RESTRICT | Warning banner | 2x | Elevated risk |
| AVOID | Hidden, blocked | — | No trading |

## Notes
- API server and web app run through Replit workflows
- Set `ADMIN_PASSWORD`, `GROQ_API_KEY`, `SESSION_SECRET` as environment secrets
- Backend services must read `PORT`
