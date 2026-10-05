# CYAN Social Agent

CYAN is a multi-user SaaS foundation for an AI social-media agent.

## Core workflow
Discover → Verify → Score → Generate → Adapt → Review → Schedule → Publish → Analyze.

## Product modes
- **AI posts:** generate platform-native content from a trend or source.
- **Manual posts:** write your own post, save it as a draft, or put it directly into the calendar.
- **Dynamic scheduler:** the Priority Engine can interrupt flexible scheduled posts when a breakout trend is detected.
- **Protected posts:** important/sponsored posts can be locked so automation never moves them.
- **Human / Smart / Autonomous:** control how much publishing and reprioritization CYAN may perform.

## Priority Engine
CYAN scores velocity, engagement, freshness, relevance and view thresholds. A 1M+ view event is a strong signal, but relevance and velocity also matter; the system does not treat raw views alone as proof that a trend should interrupt the calendar.

## SaaS architecture
The public product is designed for multi-user accounts, subscriptions, per-user quotas, OAuth social connections, encrypted credentials, scheduled jobs and analytics. The current repository is the application foundation; production database, billing and platform OAuth credentials must be configured before public auto-publishing.

## Safety
Social publishing is gated behind official platform APIs and user authorization. CYAN does not use browser automation or attempt to evade anti-spam/bot-detection controls.

## Cloud worker
`vercel.json` defines a daily fallback worker tick at `/api/worker/tick` for Vercel Hobby. A free GitHub Actions worker also calls the same endpoint every 5 minutes. The dashboard controls the persistent `cyan_control` state; PostgreSQL stores drafts, trends and worker runs. Set `DATABASE_URL` and either `CRON_SECRET` or `CYAN_WORKER_SECRET` before production use. For the GitHub Actions worker, configure repository variable `CYAN_APP_URL` and repository secret `CYAN_WORKER_SECRET`; the latter must match the Vercel secret.

When `TREND_SOURCE_URL` is configured, the worker expects JSON shaped like `{ "trends": [{ "id", "title", "summary", "views", "velocity", "engagement", "freshness", "relevance", "sourceUrl" }] }`, scores each signal, stores it, and may reprioritize flexible scheduled posts when the viral threshold is reached. The actual social publishing adapters still require official OAuth/API connections.

## Local development
```bash
npm install
npm run dev
```

Required environment variables are documented in `.env.example`.


## Social connections

X is the first live publishing adapter. The dashboard starts an OAuth 2.0 PKCE flow, exchanges the authorization code, encrypts the returned access/refresh tokens with AES-GCM, and stores only the encrypted values in PostgreSQL. Publishing uses the official X API endpoint; CYAN does not store or request the user's X password. X documents OAuth 2.0 PKCE as a supported user-token flow.

Required X variables:
- `X_CLIENT_ID`
- `X_CLIENT_SECRET` (when the X app is configured as a confidential client)
- `X_REDIRECT_URI`
- `CYAN_TOKEN_ENCRYPTION_KEY` — 32 random bytes, base64 encoded

For a production SaaS, the next security layer is user authentication and tenant isolation so every workspace has its own identity, connections, queue and quotas. The current repository still uses `CYAN_WORKSPACE_ID` as the workspace boundary while that layer is being built.

## Deployment

The repository includes a Vercel Cron entry for `/api/worker/tick`. Vercel supports cron-triggered Functions; current Vercel documentation notes that minute-level cron precision is available on Pro/Enterprise, while Hobby has lower scheduling precision. For frequent trend checks on a free setup, GitHub Actions provides the current 5-minute worker cadence. Scheduled GitHub Actions can be delayed, so this is not hard real-time. Upgrade the worker infrastructure later if tighter timing is required.

