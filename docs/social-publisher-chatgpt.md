# CYAN Social Publisher — ChatGPT + official APIs

## Current integration status

The application already has OAuth/publishing foundations for TikTok and Meta (Facebook Pages and eligible Instagram professional accounts). YouTube OAuth and publishing are being added on the `feature/youtube-social-publisher` branch.

This is not yet a connected ChatGPT plugin. A ChatGPT-facing MCP endpoint still needs to be deployed at a stable HTTPS URL, secured with a supported authentication flow, and registered/connected through Plugin Creator. Do not claim posting from ChatGPT works until that endpoint is deployed and tested end to end.

## Official platform requirements

- **YouTube:** Google Cloud project, YouTube Data API v3 enabled, OAuth consent configuration, and an OAuth client. Redirect URI must exactly match `GOOGLE_REDIRECT_URI`. The API uses `youtube.upload`; uploaded video metadata defaults to private unless explicitly configured.
- **TikTok:** TikTok Developer app, Content Posting API, approved `video.publish` scope and creator authorization. TikTok restricts posts from unaudited clients to private visibility. For URL-pull uploads, the media host/domain must be verified with TikTok.
- **Instagram + Facebook:** Meta Developer app, Facebook Page admin access, Graph API permissions/review as applicable. Instagram publishing requires an eligible professional account connected to a Page. Facebook publishing in this app targets a Page, not a personal profile.
- **Media:** use a public HTTPS media URL accessible to the platform. Never pass access tokens in URLs or commit tokens/secrets to Git.

## Environment variables

Set these only in the deployment's secret manager; do not paste secret values into chat or source files:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
YOUTUBE_DEFAULT_PRIVACY_STATUS=private
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
META_GRAPH_VERSION=v23.0
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=
CYAN_TOKEN_ENCRYPTION_KEY=
CYAN_APP_URL=
DATABASE_URL=
```

Use the exact callback URL `https://YOUR_CYAN_HOST/api/connect/youtube/callback` in Google Cloud. Meta callback is `/api/connect/meta/callback`; TikTok callback is `/api/connect/tiktok/callback`.

## ChatGPT MCP tools to expose

A deployed MCP adapter should expose narrow, authenticated tools:

- `list_connections`: return connected platform names and labels only, never tokens.
- `prepare_post`: accept a media URL, caption, platform list and per-platform metadata; return a preview without publishing.
- `publish_post`: publish to explicitly selected platforms only after a confirmation step; return per-platform success/failure.
- `get_publish_status`: report known platform status and external IDs.

MCP must never accept arbitrary platform URLs, expose OAuth tokens, bypass platform consent, or treat an untrusted prompt as authorization to publish. Require a user session/workspace boundary and rate limits. Store tokens encrypted using `CYAN_TOKEN_ENCRYPTION_KEY`.

## Recommended build order

1. Configure and test YouTube OAuth + upload from the CYAN website.
2. Configure Meta and TikTok developer apps and verify each platform separately.
3. Deploy the existing app/backend with HTTPS and a persistent database.
4. Add a remote MCP endpoint using the deployed origin; test authentication, tool schemas, and platform-specific failure reporting.
5. Register the deployed MCP server as a private Plugin Creator app and connect it in ChatGPT.
6. Test with private/unlisted posts first. Confirm public-post eligibility only after the relevant platform audits and permissions are approved.

## Official references

- YouTube upload: https://developers.google.com/youtube/v3/docs/videos/insert
- Google OAuth: https://developers.google.com/identity/protocols/oauth2/web-server
- TikTok Direct Post: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- Instagram API: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/
- Facebook Reels: https://developers.facebook.com/docs/video-api/guides/reels-publishing/
