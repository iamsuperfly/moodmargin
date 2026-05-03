# Running MOODMARGIN locally

## Install
pnpm install

## Frontend
pnpm --filter @workspace/moodmargin run dev

## Backend
pnpm --filter @workspace/api-server run dev

## Database
Set `DATABASE_URL` before starting the backend.

## Required env vars
Backend:
- PORT
- DATABASE_URL
- ADMIN_PASSWORD
- SESSION_SECRET
- GROQ_API_KEY
- GENLAYER_CONTRACT_ADDRESS

Frontend:
- VITE_API_BASE_URL

## Notes
- The workspace uses pnpm workspaces.
- Shared packages live under `lib/`.
- The API server reads `PORT` directly.
