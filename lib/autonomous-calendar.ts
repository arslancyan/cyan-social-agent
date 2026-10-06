import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {getControl} from "./store";
import {adaptivePlan} from "./adaptive";
import {Draft} from "./types";
import {recordEvent} from "./store";

type CalendarSlot={draftId:string;platform:string;score:number;confidence:number;scheduledAt:string;allocation:"exploitation"|"exploration";reason:string};

function hourKey(date:Date,timezone:string){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false}).formatToParts(date);
 const pick=(t:string)=>parts.find(x=>x.type===t)?.value||"";
 return pick("year")+"-"+pick("month")+"-"+pick("day")+"-"+pick("hour");
}

export async function allocateAutonomousCalendar(drafts:Draft[],explorationIds:Set<string>=new Set()){
 await dbReady();
 const control=await getControl();
 const plans=await adaptivePlan(drafts);
 if(!plans.length)return{scheduled:[],plans:[],allocation:{exploitation:0,exploration:0}};
 const connections=await pool.query("SELECT platform FROM cyan_connections WHERE workspace_id=$1 AND status='connected'",[workspaceId()]);
 const connected=new Set<string>(connections.rows.map((x:any)=>String(x.platform)));
 const draftById=new Map(drafts.map(d=>[d.id,d]));
 const publishable=(d?:Draft)=>Boolean(d&&connected.has(d.platform)&&(["X","TikTok"] as string[]).includes(d.platform)&&(d.platform!=="TikTok"||Boolean(d.mediaUrl&&d.mediaType==="video")));
 const existing=await pool.query("SELECT platform,scheduled_at FROM cyan_drafts WHERE workspace_id=$1 AND status='scheduled' AND scheduled_at>=NOW() ORDER BY scheduled_at ASC LIMIT 100",[workspaceId()]);
 const occupied=new Set<string>(existing.rows.map((x:any)=>hourKey(new Date(x.scheduled_at),control.timezone)+":"+String(x.platform)));
 const chosen:CalendarSlot[]=[];
 const counts=new Map<string,{exploration:number;total:number}>();
 for(const x of existing.rows){const key=String(x.platform);const v=counts.get(key)||{exploration:0,total:0};v.total++;counts.set(key,v);}
 const platformOrder=["X","TikTok","Instagram","Facebook"];
 const totalExisting=existing.rows.length;
 for(const p of plans.filter(x=>x.score>=65&&x.confidence>=25&&publishable(draftById.get(x.draftId)))){
  const current=counts.get(p.platform)||{exploration:0,total:0};
  const allocation=explorationIds.has(p.draftId)?"exploration":"exploitation";
  const totalPlanned=chosen.length+1;
  const plannedCap=Math.max(1,Math.ceil(Math.max(4,totalExisting+chosen.length+1)*0.6));
  if(current.total>=plannedCap)continue;
  let at=new Date(p.recommendedAt);
  let placed=false;
  for(let step=0;step<48;step++){
   const key=hourKey(at,control.timezone)+":"+p.platform;
   const tooClose=chosen.some(x=>Math.abs(new Date(x.scheduledAt).getTime()-at.getTime())<60*60*1000&&x.platform===p.platform);
   if(!occupied.has(key)&&!tooClose){
    placed=true;break;
   }
   at=new Date(at.getTime()+60*60*1000);
  }
  if(!placed)continue;
  chosen.push({draftId:p.draftId,platform:p.platform,score:p.score,confidence:p.confidence,scheduledAt:at.toISOString(),allocation,reason:allocation==="exploration"?"Reserved as an exploration slot to gather new evidence.":"Allocated to the strongest learned platform/angle/time combination."});
 }
 for(const s of chosen){
  const updated=await pool.query("UPDATE cyan_drafts SET status='scheduled',scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND status IN ('draft','review') AND protected=false RETURNING id",[s.scheduledAt,workspaceId(),s.draftId]);
  if(updated.rowCount)await recordEvent("adaptive_decision",{platform:s.platform,draftId:s.draftId,metadata:{score:s.score,confidence:s.confidence,expectedOutcome:s.score,scheduledAt:s.scheduledAt,allocation:s.allocation,source:"autonomous_calendar"}});
 }
 return{scheduled:chosen,plans,allocation:{exploitation:chosen.filter(x=>x.allocation==="exploitation").length,exploration:chosen.filter(x=>x.allocation==="exploration").length}};
}
