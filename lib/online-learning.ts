import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";

const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));

export type LearnedWeights={trend:number;platform:number;angle:number;feature:number;time:number;adaptation:number;memory:number;version:number;samples:number;confidence:number;};

const DEFAULT:LearnedWeights={trend:.25,platform:.18,angle:.14,feature:.12,time:.11,adaptation:.10,memory:.10,version:1,samples:0,confidence:0};

export async function learnedWeights():Promise<LearnedWeights>{
 await dbReady();
 const r=await pool.query("SELECT metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND type='learning_update' ORDER BY created_at DESC LIMIT 20",[workspaceId()]);
 if(!r.rows.length)return DEFAULT;
 let w={...DEFAULT},samples=0;
 for(const row of r.rows){
  const m=row.metadata||{};const n=Math.min(1,Number(m.samples||0)/100);
  const bias=Number(m.bias||0),quality=clamp(50-Math.abs(bias));
  const delta=(quality-50)/1000;
  w.trend=clamp(w.trend+delta,.12,.40);w.platform=clamp(w.platform-delta*.3,.10,.30);
  samples+=Number(m.samples||0);
 }
 const total=w.trend+w.platform+w.angle+w.feature+w.time+w.adaptation+w.memory;
 for(const k of ["trend","platform","angle","feature","time","adaptation","memory"] as const)(w as any)[k]=Number(((w as any)[k]/total).toFixed(4));
 return {...w,version:2,samples,confidence:Math.min(100,samples/5)};
}

export async function recordWeightSnapshot(){
 const weights=await learnedWeights();
 await dbReady();
 const recent=await pool.query("SELECT 1 FROM cyan_events WHERE workspace_id=$1 AND type=$2 AND created_at>=NOW()-INTERVAL '6 hours' LIMIT 1",[workspaceId(),"weight_update"]);
 if(!recent.rowCount)await pool.query("INSERT INTO cyan_events(workspace_id,type,metadata) VALUES($1,'weight_update',$2)",[workspaceId(),JSON.stringify({source:"official_api",weights,updatedAt:new Date().toISOString()})]);
 return weights;
}

export async function learningHealth(){
 await dbReady();
 const r=await pool.query("SELECT type,COUNT(*)::int count,MAX(created_at) last FROM cyan_events WHERE workspace_id=$1 AND type IN ('learning_update','weight_update','policy_decision') GROUP BY type",[workspaceId()]);
 return {events:r.rows.map((x:any)=>({type:x.type,count:Number(x.count),last:x.last?new Date(x.last).toISOString():null}))};
}
