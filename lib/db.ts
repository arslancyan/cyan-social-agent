import {Pool} from "pg";

declare global { var __cyanPool: Pool | undefined; var __cyanSchemaPromise: Promise<void> | undefined; }

const databaseUrl=process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL_NON_POOLING;
const pool = globalThis.__cyanPool ?? new Pool({connectionString:databaseUrl,max:Number(process.env.DB_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:5000});
globalThis.__cyanPool=pool;

export async function dbReady(){
 if(!databaseUrl) throw new Error("Database connection is not configured. Set DATABASE_URL (or a supported Vercel Postgres/Neon connection variable).");
 if(globalThis.__cyanSchemaPromise)return globalThis.__cyanSchemaPromise;
 globalThis.__cyanSchemaPromise=(async()=>{await pool.query(`
CREATE TABLE IF NOT EXISTS cyan_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,plan TEXT NOT NULL DEFAULT 'free',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS cyan_sessions_exp_idx ON cyan_sessions(expires_at);
CREATE TABLE IF NOT EXISTS cyan_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,reset_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS cyan_rate_limits_reset_idx ON cyan_rate_limits(reset_at);
CREATE TABLE IF NOT EXISTS cyan_usage(user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,day DATE NOT NULL,generations INTEGER NOT NULL DEFAULT 0,publishes INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS cyan_events(id BIGSERIAL PRIMARY KEY,workspace_id TEXT NOT NULL,type TEXT NOT NULL,platform TEXT NULL,draft_id TEXT NULL,external_id TEXT NULL,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS cyan_events_workspace_idx ON cyan_events(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cyan_events_platform_time_idx ON cyan_events(workspace_id,platform,created_at DESC);
CREATE TABLE IF NOT EXISTS cyan_subscriptions(user_id TEXT PRIMARY KEY REFERENCES cyan_users(id) ON DELETE CASCADE,provider TEXT NOT NULL DEFAULT 'none',customer_id TEXT NULL,subscription_id TEXT NULL,status TEXT NOT NULL DEFAULT 'inactive',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_stripe_events(event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_drafts(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL DEFAULT 'local',platform TEXT NOT NULL,angle TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,scheduled_at TIMESTAMPTZ NULL,trend_id TEXT NULL,protected BOOLEAN NOT NULL DEFAULT FALSE,media_url TEXT NULL,media_type TEXT NULL,external_id TEXT NULL,publish_attempts INTEGER NOT NULL DEFAULT 0,publish_started_at TIMESTAMPTZ NULL,features JSONB NOT NULL DEFAULT '{}'::jsonb,experiment_id TEXT NULL,variant TEXT NULL,exploration BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS media_url TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS media_type TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS external_id TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS publish_started_at TIMESTAMPTZ NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS experiment_id TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS variant TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS exploration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS approval_by TEXT NULL;
ALTER TABLE cyan_drafts ADD COLUMN IF NOT EXISTS approval_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS cyan_drafts_due_idx ON cyan_drafts(workspace_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS cyan_drafts_approval_idx ON cyan_drafts(workspace_id,approval_status,status);
CREATE TABLE IF NOT EXISTS cyan_experiments(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,topic TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),winner_draft_id TEXT NULL,winner_score NUMERIC NULL);
CREATE INDEX IF NOT EXISTS cyan_experiments_workspace_idx ON cyan_experiments(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS cyan_control(workspace_id TEXT PRIMARY KEY,mode TEXT NOT NULL DEFAULT 'smart',paused BOOLEAN NOT NULL DEFAULT FALSE,timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',heartbeat_at TIMESTAMPTZ NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_worker_runs(id BIGSERIAL PRIMARY KEY,workspace_id TEXT NOT NULL DEFAULT 'local',ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),ok BOOLEAN NOT NULL,detail TEXT NOT NULL);
ALTER TABLE cyan_worker_runs ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'local';
CREATE INDEX IF NOT EXISTS cyan_worker_runs_workspace_idx ON cyan_worker_runs(workspace_id,ran_at DESC);
CREATE TABLE IF NOT EXISTS cyan_trends(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL DEFAULT 'local',title TEXT NOT NULL,summary TEXT NOT NULL,source_url TEXT NULL,score INTEGER NOT NULL DEFAULT 0,views BIGINT NULL,velocity NUMERIC NULL,relevance NUMERIC NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_connections(workspace_id TEXT NOT NULL DEFAULT 'local',platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'not_connected',account_label TEXT NULL,access_token_enc TEXT NULL,refresh_token_enc TEXT NULL,connected_at TIMESTAMPTZ NULL,PRIMARY KEY(workspace_id,platform));
CREATE TABLE IF NOT EXISTS cyan_patterns(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,pattern_type TEXT NOT NULL,pattern_key TEXT NOT NULL,score NUMERIC NOT NULL DEFAULT 50,confidence NUMERIC NOT NULL DEFAULT 0,samples INTEGER NOT NULL DEFAULT 0,successes INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),metadata JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS cyan_patterns_workspace_type_key_idx ON cyan_patterns(workspace_id,pattern_type,pattern_key);
CREATE INDEX IF NOT EXISTS cyan_patterns_workspace_score_idx ON cyan_patterns(workspace_id,score DESC,updated_at DESC);
CREATE TABLE IF NOT EXISTS cyan_workspaces(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cyan_workspace_members(workspace_id TEXT NOT NULL REFERENCES cyan_workspaces(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES cyan_users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(workspace_id,user_id));
CREATE INDEX IF NOT EXISTS cyan_workspace_members_user_idx ON cyan_workspace_members(user_id);
CREATE TABLE IF NOT EXISTS cyan_inbox_threads(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,platform TEXT NOT NULL,external_thread_id TEXT NOT NULL,account_label TEXT NULL,participant_label TEXT NULL,status TEXT NOT NULL DEFAULT 'open',priority TEXT NOT NULL DEFAULT 'normal',assigned_to TEXT NULL,last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),metadata JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE UNIQUE INDEX IF NOT EXISTS cyan_inbox_threads_workspace_platform_ext_idx ON cyan_inbox_threads(workspace_id,platform,external_thread_id);
CREATE INDEX IF NOT EXISTS cyan_inbox_threads_workspace_status_idx ON cyan_inbox_threads(workspace_id,status,last_message_at DESC);
CREATE TABLE IF NOT EXISTS cyan_inbox_messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES cyan_inbox_threads(id) ON DELETE CASCADE,workspace_id TEXT NOT NULL,platform TEXT NOT NULL,external_message_id TEXT NOT NULL,sender_type TEXT NOT NULL DEFAULT 'external',sender_label TEXT NULL,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),metadata JSONB NOT NULL DEFAULT '{}'::jsonb);
CREATE UNIQUE INDEX IF NOT EXISTS cyan_inbox_messages_thread_ext_idx ON cyan_inbox_messages(thread_id,external_message_id);
CREATE INDEX IF NOT EXISTS cyan_inbox_messages_workspace_time_idx ON cyan_inbox_messages(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS cyan_strategy_decisions(id BIGSERIAL PRIMARY KEY,workspace_id TEXT NOT NULL,trend_id TEXT NULL,platform TEXT NOT NULL,angle TEXT NOT NULL,decision TEXT NOT NULL,exploration BOOLEAN NOT NULL DEFAULT FALSE,priority INTEGER NOT NULL DEFAULT 0,confidence INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS cyan_strategy_decisions_workspace_idx ON cyan_strategy_decisions(workspace_id,created_at DESC);

ALTER TABLE cyan_connections ADD COLUMN IF NOT EXISTS access_token_enc TEXT NULL;
ALTER TABLE cyan_connections ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT NULL;
ALTER TABLE cyan_control ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta';
`);})().catch(err=>{globalThis.__cyanSchemaPromise=undefined;throw err;}); return globalThis.__cyanSchemaPromise;
}
export {pool};
