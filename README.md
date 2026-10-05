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

## Local development
```bash
npm install
npm run dev
```

Required environment variables are documented in `.env.example`.
