import {Draft,QueueStatus,PriorityMode,Trend} from "./types";
import {dbReady,pool} from "./db";

const workspaceId=()=>process.env.CYAN_WORKSPACE_ID||"local";

function rowToDraft(r:any):Draft{
 return {id:r.id,platform:r.platform,angle:r.angle,content:r.content,status:r.status,scheduledAt:r.scheduled_at?new Date(r.scheduled_at).toISOString():undefined,trendId:r.trend_id||undefined,protected:Boolean(r.protected)};
}

export async function listDrafts():Promise<Draft[]>{
 await dbReady();
 const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 ORDER BY COALESCE(scheduled_at, created_at) ASC, created_at DESC",[workspaceId()]);
 return r.rows.map(rowToDraft);
}

export async function saveDrafts(drafts:Draft[]){
 await dbReady();
 for(const d of drafts){
  await pool.query(`INSERT INTO cyan_drafts(id,workspace_id,platform,angle,content,status,scheduled_at,trend_id,protected)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content, status=EXCLUDED.status, scheduled_at=EXCLUDED.scheduled_at,
   trend_id=EXCLUDED.trend_id, protected=EXCLUDED.protected`,
   [d.id,workspaceId(),d.platform,d.angle,d.content,d.status,d.scheduledAt||null,d.trendId||null,Boolean(d.protected)]);
 }
 return drafts;
}

export async function addManualDraft(draft:Draft){ await saveDrafts([draft]); return draft; }

export async function updateStatus(id:string,status:QueueStatus,scheduledAt?:string){
 await dbReady();
 const r=await pool.query("UPDATE cyan_drafts SET status=$1, scheduled_at=$2 WHERE id=$3 AND workspace_id=$4 RETURNING *",[status,scheduledAt||null,id,workspaceId()]);
 return r.rows[0]?rowToDraft(r.rows[0]):undefined;
}

export async function saveTrends(trends:Trend[]){
 await dbReady();
 for(const t of trends){
  await pool.query(`INSERT INTO cyan_trends(id,workspace_id,title,summary,source_url,score,views,velocity,relevance)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,source_url=EXCLUDED.source_url,
   score=EXCLUDED.score,views=EXCLUDED.views,velocity=EXCLUDED.velocity,relevance=EXCLUDED.relevance`,
   [t.id,workspaceId(),t.title,t.summary,t.sourceUrl||null,t.score,t.views||null,t.velocity||null,t.relevance||null]);
 }
 return trends;
}

export async function latestTrends(limit=20):Promise<Trend[]>{
 await dbReady();
 const r=await pool.query("SELECT id,title,summary,source_url,score,views,velocity,relevance,created_at FROM cyan_trends WHERE workspace_id=$1 ORDER BY score DESC, created_at DESC LIMIT $2",[workspaceId(),limit]);
 return r.rows.map((x:any)=>({id:x.id,title:x.title,summary:x.summary,sourceUrl:x.source_url||undefined,score:Number(x.score),views:x.views?Number(x.views):undefined,velocity:x.velocity?Number(x.velocity):undefined,relevance:x.relevance?Number(x.relevance):undefined,createdAt:new Date(x.created_at).toISOString()}));
}

export async function dueDrafts(now=new Date()){
 await dbReady();
 const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 AND status='scheduled' AND scheduled_at <= $2 ORDER BY scheduled_at ASC LIMIT 20",[workspaceId(),now.toISOString()]);
 return r.rows.map(rowToDraft);
}

export async function setControl(patch:{mode?:PriorityMode;paused?:boolean}){
 await dbReady();
 const current=await getControl();
 const mode=patch.mode||current.mode;
 const paused=patch.paused===undefined?current.paused:patch.paused;
 await pool.query(`INSERT INTO cyan_control(workspace_id,mode,paused,updated_at)
 VALUES($1,$2,$3,NOW()) ON CONFLICT(workspace_id) DO UPDATE SET mode=EXCLUDED.mode,paused=EXCLUDED.paused,updated_at=NOW()`,[workspaceId(),mode,paused]);
 return {...current,mode,paused};
}

export async function getControl(){
 await dbReady();
 const r=await pool.query("SELECT mode,paused,heartbeat_at FROM cyan_control WHERE workspace_id=$1",[workspaceId()]);
 if(!r.rows[0]) return {mode:"smart" as PriorityMode,paused:false,heartbeatAt:null as string|null};
 return {mode:r.rows[0].mode as PriorityMode,paused:Boolean(r.rows[0].paused),heartbeatAt:r.rows[0].heartbeat_at?new Date(r.rows[0].heartbeat_at).toISOString():null};
}

export async function heartbeat(){
 await dbReady();
 await pool.query(`INSERT INTO cyan_control(workspace_id,mode,paused,heartbeat_at,updated_at)
 VALUES($1,'smart',false,NOW(),NOW())
 ON CONFLICT(workspace_id) DO UPDATE SET heartbeat_at=NOW(),updated_at=NOW()`,[workspaceId()]);
}

export async function recordWorker(ok:boolean,detail:string){
 await dbReady(); await pool.query("INSERT INTO cyan_worker_runs(ok,detail) VALUES($1,$2)",[ok,detail]);
}

export async function reprioritizeSchedule(trendId:string,viralScore:number,now=new Date()){
 await dbReady();
 const movable=await pool.query(`SELECT * FROM cyan_drafts
 WHERE workspace_id=$1 AND status='scheduled' AND protected=false AND scheduled_at IS NOT NULL AND scheduled_at >= $2
 ORDER BY scheduled_at ASC LIMIT 4`,[workspaceId(),now.toISOString()]);
 if(viralScore<85||movable.rows.length===0)return {changed:[],message:"No interruption required.",trendId};
 const changed:Draft[]=[]; let cursor=new Date(now.getTime()+15*60*1000);
 for(const r of movable.rows){
  const next=cursor.toISOString();
  const u=await pool.query("UPDATE cyan_drafts SET scheduled_at=$1 WHERE id=$2 AND workspace_id=$3 RETURNING *",[next,r.id,workspaceId()]);
  if(u.rows[0]) changed.push(rowToDraft(u.rows[0]));
  cursor=new Date(cursor.getTime()+90*60*1000);
 }
 return {changed,message:"Flexible scheduled posts moved to make room for the viral priority slot.",trendId};
}