# CYAN zero-cost policy ($0 budget)

**Hard rule: do not activate, subscribe to, or deploy any service that requires payment, a paid plan, a billing account, or a paid API key.** If a provider asks for a card or billing setup to proceed, stop and choose a no-cost path instead. Never assume a free trial is permanently free.

## What may be used at $0

- Public GitHub repository and GitHub Actions on the public repository's included standard runners, within GitHub's current usage and fair-use limits.
- Local development with Node.js and the dependencies in `package.json`.
- Official social-platform APIs/OAuth only when available without a fee, within the account's current quota and approved permissions.
- Optional free hosting/database tiers only if signup and continued operation do not require payment details or a paid upgrade. A free tier can change; check its current terms before relying on it.
- Organic posts and manual publishing. Do not require paid AI generation for the baseline workflow.

## Do not enable by default

- OpenAI API or other metered AI APIs; a ChatGPT subscription does not mean API calls are free.
- Paid video generation, storage/CDN, queue, scheduler, analytics, email, monitoring, domain, or hosting plans.
- Cloud products that ask to enable billing just to continue.
- Paid add-ons or upgrades to get around a platform quota.

## Honest operating limits

- A static GitHub Pages site cannot run this Next.js API/backend. GitHub Actions can run bounded worker jobs, but it is not a continuously running server and scheduled workflows may be delayed.
- OAuth apps and API access may be free to create, but platform reviews, scopes, quotas, account eligibility and publishing restrictions still apply.
- TikTok may restrict unaudited Content Posting API clients; do not promise public auto-posting before approval.
- YouTube Data API uploads consume quota. Start with private test videos and respect quota limits.
- Instagram/Facebook publishing requires eligible accounts, Meta app permissions, and sometimes app review.
- A working ChatGPT integration requires a reachable HTTPS MCP service. Do not buy a domain or hosting to get one; use a genuinely free HTTPS deployment only if it does not require billing. Otherwise keep development local/manual until a free route is available.

## Secret handling

Never paste credentials or tokens into ChatGPT, GitHub issues, source files, or commits. Store credentials only in a deployment secret manager. If the only available secret store requires a paid plan, do not deploy secrets there.

## Before any deployment

1. Confirm the chosen plan says $0 now and has no mandatory payment method.
2. Check usage limits, sleep/cold-start behavior, storage retention and quotas.
3. Disable paid upgrades and usage-based billing wherever the provider offers that control.
4. Keep AI API keys unset unless a genuinely free, user-approved alternative is verified.
5. Re-check costs before adding any new service.

This policy reduces avoidable costs; it cannot guarantee that third-party providers will keep their free tiers forever. No service should be described as deployed or connected until a real test passes.
