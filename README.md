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
- `/markets` market list
- `/trade/:symbol` trading screen
- `/risk` risk board
- `/submit` token submission
- `/dashboard` wallet dashboard

## Notes
- API server and web app run through Replit workflows
- Shared environment vars are required for wallet and AI features
- Backend services must read `PORT`
