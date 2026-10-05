import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {Draft,Platform} from "./types";
type PlatformScore={platform:Platform;score:number;confidence:number;samples:number;published:number;successRate:number;engagementRate:number;avgViews:number;reason:string};
type SlotScore={platform:Platform;hour:number;day:number;score:number;confidence:number;samples:number;reason:string};
const PLATFORMS:Platform[]=["X","TikTok","Instagram","Facebook"];
const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
function weightedScore(rows:any[]){
 const samples=rows.length;if(!samples)return {score:50,confidence:0,samples:0,successRate:1,engagementRate:0,avgViews:0};
 let weight=0,eng=0,views=0,success=0;
 for(const r of rows){const age=Math.max(0,(Date.now()-new Date(r.created_at).getTime())/86400000);const w=Math.max(.2,Math.exp(-age/21));weight+=w;const m=r.metadata||{};const impressions=Math.max(0,num(m.impressions));const interactions=Math.max(0,num(m.likes)+num(m.comments)+num(m.shares)+num(m.saves)+num(m.clicks));eng+=w*(impressions?interactions/impressions:0);views+=w*Math.max(0,num(m.views||m.impressions));success+=w*(r.type==="publish"?1:0);}
 const engagementRate=weight?eng/weight:0,avgViews=weight?views/weight:0,successRate=weight?success/weight:0;
 const performance=clamp(engagementRate*100*.55+Math.min(100,Math.log10(avgViews+1)*20)*.25+successRate*100*.20);
 return {score:performance,confidence:clamp(samples/20*100),samples,successRate,engagementRate,avgViews};
}
export async function platformPerformanceScores():Promise<PlatformScore[]>{
 await dbReady();const r=await pool.query("SELECT platform,type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '90 days' AND platform IS NOT NULL ORDER BY created_at DESC LIMIT 2000",[workspaceId()]);
 return PLATFORMS.map(platform=>{const rows=r.rows.filter((x:any)=>x.platform===platform);const s=weightedScore(rows);const prior=platform==="X"?62:platform==="TikTok"?60:platform==="Instagram"?58:52;const score=s.samples<5?prior*.75+s.score*.25:prior*.25+s.score*.75;return {platform,score:Math.round(score),confidence:Math.round(s.confidence),samples:s.samples,published:rows.filter((x:any)=>x.type==="publish").length,successRate:Number(s.successRate.toFixed(3)),engagementRate:Number(s.engagementRate.toFixed(4)),avgViews:Math.round(s.avgViews),reason:s.samples<5?"Low-data prior; CYAN will learn as performance events arrive.":"Recent engagement, reach and publishing reliability are weighted with recency."};});
}
export async function timeSlotScores(platform:Platform){
 await dbReady();const r=await pool.query("SELECT type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND platform=$2 AND created_at>=NOW()-INTERVAL '90 days' ORDER BY created_at DESC LIMIT 2000",[workspaceId(),platform]);
 const map=new Map<string,any[]>();for(const row of r.rows){const d=new Date(row.created_at);const key=String(d.getUTCDay())+"-"+String(d.getUTCHours());if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);}
 const out:SlotScore[]=[];for(let day=0;day<7;day++)for(let hour=0;hour<24;hour++){const rows=map.get(String(day)+"-"+String(hour))||[];const s=weightedScore(rows);const score=Math.round(rows.length?55*.35+s.score*.65:55);out.push({platform,hour,day,score,confidence:Math.round(s.confidence),samples:s.samples,reason:rows.length?"Learned from historical performance in this time slot.":"Exploration slot; no historical evidence yet."});}return out.sort((a,b)=>b.score-a.score);
}
function nextOccurrence(day:number,hour:number,from:Date){const d=new Date(from);d.setUTCMinutes(0,0,0);let delta=(day-d.getUTCDay()+7)%7;if(delta===0&&hour<=d.getUTCHours())delta=7;d.setUTCDate(d.getUTCDate()+delta);d.setUTCHours(hour);return d;}
export async function adaptivePlan(drafts:Draft[],now=new Date()){
 const platforms=await platformPerformanceScores();const by=new Map(platforms.map(x=>[x.platform,x]));const candidates=await Promise.all(drafts.map(async d=>{const p=by.get(d.platform)!;const slots=await timeSlotScores(d.platform);const best=slots[0];const score=Math.round(p.score*.65+best.score*.35);return {draftId:d.id,platform:d.platform,score,confidence:Math.round((p.confidence+best.confidence)/2),recommendedAt:nextOccurrence(best.day,best.hour,now).toISOString(),platformScore:p.score,timeScore:best.score,reason:p.reason+" "+best.reason};}));return candidates.sort((a,b)=>b.score-a.score);
}
export async function autoScheduleAdaptive(draftIds:string[],mode:"smart"|"autonomous"){
 if(mode!=="autonomous")return {scheduled:[],skipped:"Autonomous mode required for automatic scheduling."};
 await dbReady();const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 AND id=ANY($2::text[]) AND status IN ('draft','review') AND protected=false",[workspaceId(),draftIds]);
 const drafts:Draft[]=r.rows.map((x:any)=>({id:x.id,platform:x.platform,angle:x.angle,content:x.content,status:x.status,protected:false}));const plans=await adaptivePlan(drafts);const scheduled:any[]=[];
 for(const p of plans){if(p.score<65||p.confidence<35)continue;const u=await pool.query("UPDATE cyan_drafts SET status='scheduled',scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND status IN ('draft','review') AND protected=false RETURNING id,platform,scheduled_at",[p.recommendedAt,workspaceId(),p.draftId]);if(u.rows[0])scheduled.push({draftId:p.draftId,platform:p.platform,scheduledAt:u.rows[0].scheduled_at,score:p.score,confidence:p.confidence});}
 return {scheduled,plans};
}