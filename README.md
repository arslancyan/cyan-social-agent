# CYAN Social Agent — free GitHub worker

This simplified edition runs its crypto worker on GitHub Actions. It does not require Vercel, a paid host, a custom domain, or an external database. Review drafts are stored as GitHub Issues; cadence state is stored in `data/worker-state.json`.

## What it does

- Checks English-language crypto news (Bitcoin, Ethereum, Solana, DeFi, memecoins and NFTs).
- Publishes at most one crypto post every 3 hours when a suitable news item is found.
- Searches up to 10 recent X posts every 3 hours for English crypto posts with at least 500,000 reported impressions, reducing read usage by default.
- Creates a GitHub Issue for each viral-post reply draft so you can review it.
- Sends a reply only after you add BOTH `cyan-approved` and `cyan-opt-in-confirmed` labels to the issue.
- Uses a simple fallback draft if `OPENAI_API_KEY` is not configured.

## One-time setup

### 1. Enable GitHub Actions

Open the repository's **Settings → Actions → General** and make sure Actions are allowed. The workflow runs every 15 minutes; you can also start it manually from **Actions → CYAN Free GitHub Worker → Run workflow**.

### 2. Add X API secrets

In **Settings → Secrets and variables → Actions → New repository secret**, add these four secrets from your X Developer Portal app. Configure the app for **Read and Write** access and generate its user access token and secret.

| Secret | Value |
|---|---|
| `X_API_KEY` | X app API key / consumer key |
| `X_API_SECRET` | X app API secret / consumer secret |
| `X_ACCESS_TOKEN` | X user access token |
| `X_ACCESS_TOKEN_SECRET` | X user access token secret |

Never paste these keys into an issue, source file, or chat.

## Strict $0 budget

CYAN is being developed under a **$0 budget**. Do not enable paid plans, billing, trials that require payment, metered AI APIs, or paid hosting. Review [the zero-cost policy](docs/zero-cost-policy.md) before enabling any integration. GitHub Actions can run bounded jobs but does not host the interactive Next.js API; a full ChatGPT MCP connection must wait until a genuinely free HTTPS backend is available and verified. Never enter secrets in chat or commit them.

### YouTube OAuth and publishing

The `feature/youtube-social-publisher` branch adds a YouTube connection flow and official YouTube Data API upload support. Before testing, configure a Google Cloud project, enable **YouTube Data API v3**, create an OAuth web client, and add this exact authorized redirect URI:

```
https://YOUR_CYAN_HOST/api/connect/youtube/callback
```

Add these variables to the deployment secret manager (not to Git):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (must exactly match the OAuth client setting)
- `YOUTUBE_DEFAULT_PRIVACY_STATUS` (`private`, `unlisted`, or `public`; defaults to `private`)

The upload path currently accepts a public HTTPS video URL and buffers videos up to 512 MB in the app server before uploading through the official resumable upload API. Use private visibility for initial tests. YouTube decides Shorts classification based on the uploaded video's format and current Shorts rules.

See [ChatGPT Social Publisher integration notes](docs/social-publisher-chatgpt.md) for platform permissions and the remaining MCP/plugin deployment work.

### 3. Optional AI writing

Add `OPENAI_API_KEY` as a repository secret for more context-aware writing. Set the repository variable `OPENAI_MODEL` if you want a model other than the default. Without an API key, CYAN uses a basic fallback template; ChatGPT subscriptions do not include API credits.

### 4. Review viral reply drafts

Open the repository's **Issues** tab. Drafts have the `cyan-review` label and link to the original X post. Read the original post, edit the suggested reply if needed, and only if the author has explicitly opted in, add both labels:

- `cyan-approved`
- `cyan-opt-in-confirmed`

The next workflow run sends the reply and closes the issue. Do not add these labels unless you have actually verified opt-in.

## Important limitations

- GitHub Actions runs the worker, but it does not host this repository's interactive Next.js dashboard. GitHub Pages serves static files and cannot run these API routes.
- X search and posting require valid X API credentials and an X API plan that permits the requested endpoints and metrics. X uses consumption-based API billing for many endpoints; GitHub hosting is free, but X API usage is not guaranteed to be free. Check the [X Developer pricing page](https://developer.x.com/) and set a spending limit before enabling this worker. If X returns 401, 403 or 429, open the failed workflow run to see the error.
- To reduce potential API charges, the worker checks at most 10 recent posts once per 3 hours. The 500,000 threshold uses the impression count returned by X. If your access tier does not expose impression metrics, viral detection cannot reliably classify posts.
- GitHub's scheduled workflows may start late. The worker checks the 3-hour cadence when it runs; this is not a guaranteed real-time scheduler.
- The worker uses OAuth 1.0a credentials stored as GitHub Actions secrets. If the X app keys are revoked or permissions change, update the secrets.
- The rest of the original multi-user web app remains in the repository, but this workflow no longer depends on its database or Vercel deployment.

## Troubleshooting

1. Open **Actions → CYAN Free GitHub Worker**.
2. Open the latest run and read the failed step logs.
3. `Missing repository secret` means a secret name is missing or empty.
4. X API `401/403` usually means invalid credentials, insufficient access or permissions.
5. X API `429` means rate limits or usage limits were reached.
6. A viral post without an available impression count will not be queued.

## Local checks

```bash
npm ci
npm run typecheck
npm test
npm run build
```
