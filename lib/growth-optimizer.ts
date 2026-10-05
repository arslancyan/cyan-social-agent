import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {recordEvent} from "./store";

type GrowthAction="protect"|"promote"|"delay"|"retire"|"explore"|"hold";
type GrowthDecision={draftId:string;platform:string;action:GrowthAction;score:number;confidence:number;reason:string;scheduledAt?:string};

function metricScore(m:any){
 const views=Number(m?.views||m?.impressions||0); if(views<=0)return 0;
 const likes=Number(m?.likes||0),comments=Number(m?.comments||0),shares=Number(m?.shares||0),clicks=Number(m?.clicks||0);
 return Math.min(100,Math.round((likes+comments*3+shares*4+clicks*2)/views*1000));
}

export async function optimizeGrowth(limit=20){
 await dbReady();
 const ws=workspaceId();
 const r=await pool.query(`
 SELECT d.id,d.platform,d.status,d.protected,d.scheduled_at,
   (SELECT metadata FROM cyan_events e WHERE e.workspace_id=d.workspace_id AND e.draft_id=d.id AND e.type='performance_snapshot' AND e.metadata->>'window'='1h' ORDER BY e.created_at DESC LIMIT 1) m1,
   (SELECT metadata FROM cyan_events e WHERE e.workspace_id=d.workspace_id AND e.draft_id=d.id AND e.type='performance_snapshot' AND e.metadata->>'window'='6h' ORDER BY e.created_at DESC LIMIT 1) m6,
   (SELECT metadata FROM cyan_events e WHERE e.workspace_id=d.workspace_id AND e.draft_id=d.id AND e.type='performance_snapshot' AND e.metadata->>'window'='24h' ORDER BY e.created_at DESC LIMIT 1) m24,
   (SELECT metadata FROM cyan_events e WHERE e.workspace_id=d.workspace_id AND e.draft_id=d.id AND e.type='performance_snapshot' AND e.metadata->>'window'='72h' ORDER BY e.created_at DESC LIMIT 1) m72
 FROM cyan_drafts d
 WHERE d.workspace_id=$1 AND d.status IN ('scheduled','review','draft')
 ORDER BY COALESCE(d.scheduled_at,NOW()) ASC,d.created_at DESC LIMIT $2`,[ws,limit]);

 const decisions:GrowthDecision[]=[];
 for(const row of r.rows){
  if(row.status==="published"||row.protected)continue;
  const windows=[row.m1,row.m6,row.m24,row.m72].filter((x:any)=>x&&Object.keys(x).length);
  if(!windows.length)continue;
  const mature=Object.keys(row.m72).length?metricScore(row.m72):Object.keys(row.m24).length?metricScore(row.m24):0;
  const early=Object.keys(row.m6).length?metricScore(row.m6):metricScore(row.m1);
  const confidence=Math.min(100,windows.length*25);
  const score=Math.round(mature*0.65+early*0.35);

  const recent=await pool.query(`SELECT 1 FROM cyan_events WHERE workspace_id=$1 AND draft_id=$2 AND type='growth_decision' AND created_at>=NOW()-INTERVAL '6 hours' LIMIT 1`,[ws,row.id]);
  if(recent.rowCount)continue;

  let action:GrowthAction="hold";
  let reason="Insufficient signal to change the current lifecycle.";
  if(windows.length>=3 && score<=15){action="retire";reason="Repeated mature underperformance; automatic publishing is stopped and the draft returns to review.";
  }else if(windows.length>=2 && score>=70){
   action="promote"; reason="Strong early and mature performance; move this flexible post closer to the next available priority slot.";
  }else if(windows.length>=2 && score<=25){
   action="delay"; reason="Repeated weak performance; reduce priority and give stronger patterns more room.";
  }else if(windows.length>=3 && score<=15){
   action="retire"; reason="Repeated mature underperformance; stop automatic publishing and return the draft to review.";
  }else if(windows.length===1){
   action="hold"; reason="Early signal only; wait for a mature attribution window before changing lifecycle.";
  }

  if(action==="retire" && row.status==="scheduled"){
   await pool.query("UPDATE cyan_drafts SET status='review',scheduled_at=NULL WHERE workspace_id=$1 AND id=$2 AND protected=false AND status='scheduled'",[ws,row.id]);
  }else if(action==="delay" && row.status==="scheduled" && row.scheduled_at){
   const next=new Date(Math.max(Date.now()+2*60*60*1000,new Date(row.scheduled_at).getTime()+90*60*1000));
   await pool.query("UPDATE cyan_drafts SET scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND protected=false AND status='scheduled'",[next.toISOString(),ws,row.id]);
  }else if(action==="promote" && row.status==="scheduled" && row.scheduled_at){
   const collision=await pool.query("SELECT 1 FROM cyan_drafts WHERE workspace_id=$1 AND status='scheduled' AND id<>$2 AND scheduled_at BETWEEN NOW()+INTERVAL '10 minutes' AND NOW()+INTERVAL '70 minutes' LIMIT 1",[ws,row.id]);
   if(collision.rowCount===0){
    const next=new Date(Date.now()+15*60*1000);
    await pool.query("UPDATE cyan_drafts SET scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND protected=false AND status='scheduled'",[next.toISOString(),ws,row.id]);
   }
  }

  decisions.push({draftId:row.id,platform:row.platform,action,score,confidence,reason,scheduledAt:row.scheduled_at||undefined});
  await recordEvent("growth_decision",{platform:row.platform,draftId:row.id,metadata:{action,score,confidence,reason}});
 }
 return decisions;
}

export async function growthStatus(){
 await dbReady();
 const r=await pool.query(`SELECT type,platform,draft_id,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND type='growth_decision' ORDER BY created_at DESC LIMIT 20`,[workspaceId()]);
 return r.rows.map((x:any)=>({draftId:x.draft_id||undefined,platform:x.platform||undefined,createdAt:new Date(x.created_at).toISOString(),...(x.metadata||{})}));
}
