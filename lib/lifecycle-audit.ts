import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";

const PUBLISHED=new Set(["published"]);
const MUTABLE=new Set(["draft","review","scheduled","publishing"]);

export async function lifecycleAudit(){
  await dbReady();
  const r=await pool.query("SELECT id,status,protected FROM cyan_drafts WHERE workspace_id=$1 AND status='published' AND protected=false LIMIT 100",[workspaceId()]);
  const violations:number[]=[];
  for(const row of r.rows){
    const events=await pool.query("SELECT type FROM cyan_events WHERE workspace_id=$1 AND draft_id=$2 AND type IN ('draft_update','delete','pull','published_update') LIMIT 1",[workspaceId(),row.id]);
    if(events.rowCount)violations.push(row.id);
  }
  return {publishedChecked:r.rows.length,violations,immutable:true};
}

export async function assertMutableDraft(id:string){
  await dbReady();
  const r=await pool.query("SELECT status,protected FROM cyan_drafts WHERE workspace_id=$1 AND id=$2 LIMIT 1",[workspaceId(),id]);
  if(!r.rowCount)throw new Error("Draft not found.");
  if(PUBLISHED.has(r.rows[0].status)||r.rows[0].protected)throw new Error("Published or protected content is immutable.");
  if(!MUTABLE.has(r.rows[0].status))throw new Error("Draft lifecycle state is not mutable.");
  return true;
}
