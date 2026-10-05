import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";

export async function evaluateExperiments(){
 await dbReady();
 const r=await pool.query(`SELECT e.id,e.topic,d.id AS draft_id,d.variant,d.features,d.angle,
 MAX(CASE WHEN ev.metadata->>'window' IN ('24h','72h') THEN
 ((COALESCE((ev.metadata->>'likes')::numeric,0)+COALESCE((ev.metadata->>'comments')::numeric,0)+COALESCE((ev.metadata->>'shares')::numeric,0)+COALESCE((ev.metadata->>'clicks')::numeric,0))/GREATEST(COALESCE((ev.metadata->>'impressions')::numeric,1),1))*100 END) AS score
 FROM cyan_experiments e JOIN cyan_drafts d ON d.experiment_id=e.id
 LEFT JOIN cyan_events ev ON ev.draft_id=d.id AND ev.type='performance_snapshot'
 WHERE e.workspace_id=$1 AND e.status='active'
 GROUP BY e.id,e.topic,d.id,d.variant`,[workspaceId()]);
 const groups=new Map<string,any[]>();
 for(const row of r.rows){if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id)!.push(row);}
 const completed:any[]=[];
 for(const [id,rows] of groups){
  const mature=rows.filter(x=>x.score!==null);
  if(mature.length<2)continue;
  const winner=mature.sort((a,b)=>Number(b.score)-Number(a.score))[0];
  const u=await pool.query("UPDATE cyan_experiments SET status='completed',winner_draft_id=$1,winner_score=$2 WHERE workspace_id=$3 AND id=$4 AND status='active' RETURNING id",[winner.draft_id,Number(winner.score),workspaceId(),id]);
  if(u.rows[0]){
 const draft=rows.find(x=>x.draft_id===winner.draft_id);
 completed.push({id,topic:rows[0].topic,winnerDraftId:winner.draft_id,winnerScore:Number(winner.score),variant:winner.variant});
 await pool.query("INSERT INTO cyan_events(workspace_id,type,platform,draft_id,metadata) SELECT $1,'experiment_winner',d.platform,d.id,$2::jsonb FROM cyan_drafts d WHERE d.workspace_id=$1 AND d.id=$3",[workspaceId(),JSON.stringify({experimentId:id,topic:rows[0].topic,score:Number(winner.score),variant:winner.variant,features:draft?.features||{},angle:draft?.angle||null}),winner.draft_id]);
}
 }
 return completed;
}
