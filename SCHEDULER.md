# CYAN Scheduler

The dashboard is a remote control; the scheduler runs independently in a cloud worker/cron environment.

## Flow
1. A draft is created or scheduled in the dashboard.
2. PostgreSQL stores the job durably.
3. The cloud worker calls **POST /api/worker/tick**.
4. The worker finds due jobs and calls the official platform adapter.
5. Successful jobs become `published`; blocked jobs remain scheduled for a later retry.
6. Worker heartbeats and run results are recorded for observability.

## Remote control
- **GET /api/control** reads mode and pause state.
- **PATCH /api/control** changes `conservative`, `smart`, or `autonomous` mode and can pause/resume scheduling.
- `CYAN_WORKER_SECRET` protects worker calls in production.

## Production requirements
- PostgreSQL via `DATABASE_URL`.
- A deployment that supports the cron configuration.
- Official platform OAuth/API credentials and user authorization.
- Rate limits, retries/backoff, idempotency and per-account quotas in each real platform connector.

CYAN never uses browser automation or tactics intended to bypass platform anti-spam controls.
