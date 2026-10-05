import {Pool} from "pg";

declare global { var __cyanPool: Pool | undefined; var __cyanSchemaPromise: Promise<void> | undefined; }

const pool = globalThis.__cyanPool ?? new Pool({
 connectionString: process.env.DATABASE_URL,
 max: Number(process.env.DB_POOL_MAX || 5),
 idleTimeoutMillis: 30_000,
 connectionTimeoutMillis: 5_000
});
globalThis.__cyanPool = pool;

export async function dbReady(){
 if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
 if(globalThis.__cyanSchemaPromise) return globalThis.__cyanSchemaPromise;
 globalThis.__cyanSchemaPromise = (async()=>{
  await pool.query(`
   CREATE TABLE IF NOT EXISTS cyan_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE IF NOT EXISTS cyan_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS cyan_sessions_exp_idx ON cyan_sessions(expires_at);
   CREATE TABLE IF NOT EXISTS cyan_usage (
    user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,
    day DATE NOT NULL, generations INTEGER NOT NULL DEFAULT 0, publishes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,day)
   );
   CREATE TABLE IF NOT EXISTS cyan_events (
    id BIGSERIAL PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL,
    platform TEXT NULL, draft_id TEXT NULL, external_id TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS cyan_events_workspace_idx ON cyan_events(workspace_id,created_at DESC);
   CREATE TABLE IF NOT EXISTS cyan_subscriptions (
    user_id TEXT PRIMARY KEY REFERENCES cyan_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'none', customer_id TEXT NULL, subscription_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'inactive', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE IF NOT EXISTS cyan_drafts (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL DEFAULT 'local',
    platform TEXT NOT NULL, angle TEXT NOT NULL, content TEXT NOT NULL,
    status TEXT NOT NULL, scheduled_at TIMESTAMPTZ NULL, trend_id TEXT NULL,
    protected BOOLEAN NOT NULL DEFAULT FALSE, media_url TEXT NULL, media_type TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS media_url TEXT NULL;
   ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS media_type TEXT NULL;
   CREATE INDEX IF NOT EXISTS cyan_drafts_due_idx ON cyan_drafts(status, scheduled_at);
   CREATE TABLE IF NOT EXISTS cyan_control (
    workspace_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'smart',
    paused BOOLEAN NOT NULL DEFAULT FALSE, heartbeat_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE IF NOT EXISTS cyan_worker_runs (
    id BIGSERIAL PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ok BOOLEAN NOT NULL, detail TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS cyan_trends (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL DEFAULT 'local',
    title TEXT NOT NULL, summary TEXT NOT NULL, source_url TEXT NULL,
    score INTEGER NOT NULL DEFAULT 0, views BIGINT NULL, velocity NUMERIC NULL,
    relevance NUMERIC NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE TABLE IF NOT EXISTS cyan_connections (
    workspace_id TEXT NOT NULL DEFAULT 'local', platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_connected',
    account_label TEXT NULL, access_token_enc TEXT NULL, refresh_token_enc TEXT NULL, connected_at TIMESTAMPTZ NULL,
    PRIMARY KEY(workspace_id, platform)
   );
   ALTER TABLE cyan_connections ADD COLUMN IF NOT EXISTS access_token_enc TEXT NULL;
   ALTER TABLE cyan_connections ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT NULL;
  `);
 })().catch(err=>{ globalThis.__cyanSchemaPromise=undefined; throw err; });
 return globalThis.__cyanSchemaPromise;
}

export {pool};