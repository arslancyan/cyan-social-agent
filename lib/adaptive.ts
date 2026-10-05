import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {getControl} from "./store";
import {Draft,Platform} from "./types";

type PlatformScore={platform:Platform;score:number;confidence:number;samples:number;published:number;successRate:number;engagementRate:number;avgViews:number;reason:string};
type SlotScore={platform:Platform;hour:number;day:number;score:number;confidence:number;samples:number;reason:string};
type AngleScore={angle:string;score:number;confidence:number;samples:number;engagementRate:number;avgViews:number;reason:string};
const PLATFORMS:Platform[]=["X","TikTok","Instagram","Facebook"];
const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;

function weightedScore(rows:any[]){
 const samples=rows.length;if(!samples)return{score:50,confidence:0,samples:0,successRate:0,engagementRate:0,avgViews:0};
 let weight=0,eng=0,views=0,success=0;
 for(const r of rows){const age=Math.max(0,(Date.now()-new Date(r.created_at).getTime())/86400000),w=Math.max(.2,Math.exp(-age/21));weight+=w;const m=r.metadata||{},impressions=Math.max(0,num(m.impressions)),interactions=Math.max(0,num(m.likes)+num(m.comments)+num(m.shares)+num(m.saves)+num(m.clicks));eng+=w*(impressions?interactions/impressions:0);views+=w*Math.max(0,num(m.views||m.impressions));success+=w*(r.type==="publish"||r.type==="performance_snapshot"?1:0)*(r.type==="performance_snapshot"?(m.window==="72h"?1.5:m.window==="24h"?1.25:m.window==="6h"?1:m.window==="1h"?.6:1):1);}
 const engagementRate=weight?eng/weight:0,avgViews=weight?views/weight:0,successRate=weight?success/weight:0,score=clamp(engagementRate*100*.55+Math.min(100,Math.log10(avgViews+1)*20)*.25+successRate*100*.20);
 return{score,confidence:clamp(samples/20*100),samples,successRate,engagementRate,avgViews};
}
export async function platformPerformanceScores():Promise<PlatformScore[]>{
 await dbReady();const r=await pool.query("SELECT platform,type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '90 days' AND platform IS NOT NULL ORDER BY created_at DESC LIMIT 2000",[workspaceId()]);
 return PLATFORMS.map(platform=>{const rows=r.rows.filter((x:any)=>x.platform===platform),s=weightedScore(rows),prior=platform==="X"?62:platform==="TikTok"?60:platform==="Instagram"?58:52,score=s.samples<5?prior*.75+s.score*.25:prior*.25+s.score*.75;return{platform,score:Math.round(score),confidence:Math.round(s.confidence),samples:s.samples,published:rows.filter((x:any)=>x.type==="publish").length,successRate:Number(s.successRate.toFixed(3)),engagementRate:Number(s.engagementRate.toFixed(4)),avgViews:Math.round(s.avgViews),reason:s.samples<5?"Low-data prior; CYAN will learn as performance events arrive.":"Recent engagement, reach and publishing reliability are weighted with recency."};});
}
export async function anglePerformanceScores(platform?:Platform):Promise<AngleScore[]>{
 await dbReady();const sql=`SELECT d.angle,e.metadata,e.created_at FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days' ${platform?"AND e.platform=$2":""} ORDER BY e.created_at DESC LIMIT 3000`;
 const r=await pool.query(sql,platform?[workspaceId(),platform]:[workspaceId()]);const groups=new Map<string,any[]>();
 for(const row of r.rows){const key=String(row.angle||"unknown");if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(row);}
 return[...groups.entries()].map(([angle,rows])=>{const s=weightedScore(rows);return{angle,score:Math.round(s.score),confidence:Math.round(s.confidence),samples:s.samples,engagementRate:Number(s.engagementRate.toFixed(4)),avgViews:Math.round(s.avgViews),reason:s.samples<5?"Early signal; keep testing this angle.":"Learned from recent performance snapshots."};}).sort((a,b)=>b.score-a.score);
}
export async function timeSlotScores(platform:Platform){
 await dbReady();const r=await pool.query("SELECT type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND platform=$2 AND created_at>=NOW()-INTERVAL '90 days' ORDER BY created_at DESC LIMIT 2000",[workspaceId(),platform]);
 const control=await getControl(),map=new Map<string,any[]>();for(const row of r.rows){const d=new Date(row.created_at),parts=new Intl.DateTimeFormat("en-US",{timeZone:control.timezone,weekday:"short",hour:"2-digit",hour12:false}).formatToParts(d),wd=parts.find(x=>x.type==="weekday")?.value||"Sun",hour=Number(parts.find(x=>x.type==="hour")?.value||0),days:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6},key=String(days[wd])+"-"+String(hour);if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);}
 const out:SlotScore[]=[];for(let day=0;day<7;day++)for(let hour=0;hour<24;hour++){const rows=map.get(String(day)+"-"+String(hour))||[],s=weightedScore(rows),score=Math.round(rows.length?55*.35+s.score*.65:55);out.push({platform,hour,day,score,confidence:Math.round(s.confidence),samples:s.samples,reason:rows.length?"Learned from historical performance in this time slot.":"Exploration slot; no historical evidence yet."});}return out.sort((a,b)=>b.score-a.score);
}
function nextOccurrence(day:number,hour:number,from:Date,timezone:string){const days:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};for(let i=0;i<24*15;i++){const d=new Date(from.getTime()+i*3600000),parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short",hour:"2-digit",hour12:false}).formatToParts(d),wd=parts.find(x=>x.type==="weekday")?.value||"Sun",h=Number(parts.find(x=>x.type==="hour")?.value||0);if(days[wd]===day&&h===hour&&d.getTime()>from.getTime()+30*60000)return d;}return new Date(from.getTime()+24*3600000);}
export async function adaptivePlan(drafts:Draft[],now=new Date()){
 const control=await getControl(),platforms=await platformPerformanceScores(),angles=await anglePerformanceScores(),angleBy=new Map(angles.map(x=>[x.angle,x]));
 const candidates=await Promise.all(drafts.map(async d=>{const p=platforms.find(x=>x.platform===d.platform)!;const best=(await timeSlotScores(d.platform))[0],a=angleBy.get(d.angle),angleScore=a?.score??55,score=Math.round(p.score*.45+angleScore*.25+best.score*.30),confidence=Math.round((p.confidence+(a?.confidence||0)+best.confidence)/3);return{draftId:d.id,experimentId:d.experimentId||null,variant:d.variant||null,platform:d.platform,angle:d.angle,score,confidence,recommendedAt:nextOccurrence(best.day,best.hour,now,control.timezone).toISOString(),platformScore:p.score,angleScore,timeScore:best.score,reason:[p.reason,a?.reason||"No angle history; exploration recommended.",best.reason].join(" ")};}));
 return candidates.sort((a,b)=>b.score-a.score);
}
export async function chooseBestDecision(drafts:Draft[],now=new Date()){
 const plans=await adaptivePlan(drafts,now);if(!plans.length)return null;
 const explore=plans.filter(x=>x.confidence<55).sort((a,b)=>a.confidence-b.confidence)[0];
 const exploit=plans[0];
 if(!explore)return exploit;
 return explore.score>=exploit.score-8?explore:exploit;
}
export async function generationStrategy(now=new Date()){
 const platforms=await platformPerformanceScores(),angles=await anglePerformanceScores();
 const bestPlatform=platforms[0],bestAngle=angles[0];
 const lowConfidence=platforms.filter(x=>x.confidence<55).map(x=>x.platform);
 return {bestPlatform:bestPlatform?.platform||null,bestPlatformScore:bestPlatform?.score||50,bestAngle:bestAngle?.angle||null,bestAngleScore:bestAngle?.score||50,explorePlatforms:lowConfidence,explorationRatio:lowConfidence.length?0.35:0.15,generatedAt:now.toISOString()};
}
export async function autoScheduleAdaptive(draftIds:string[],mode:"smart"|"autonomous"){
 if(mode!=="autonomous")return{scheduled:[],skipped:"Autonomous mode required for automatic scheduling."};
 await dbReady();const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 AND id=ANY($2::text[]) AND status IN ('draft','review') AND protected=false",[workspaceId(),draftIds]);
 const drafts:Draft[]=r.rows.map((x:any)=>({id:x.id,platform:x.platform,angle:x.angle,content:x.content,status:x.status,protected:false})),plans=await adaptivePlan(drafts),scheduled:any[]=[];
 for(const p of plans){if(p.score<65||p.confidence<25)continue;const u=await pool.query("UPDATE cyan_drafts SET status='scheduled',scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND status IN ('draft','review') AND protected=false RETURNING id,platform,scheduled_at",[p.recommendedAt,workspaceId(),p.draftId]);if(u.rows[0])scheduled.push({draftId:p.draftId,platform:p.platform,angle:p.angle,scheduledAt:u.rows[0].scheduled_at,score:p.score,confidence:p.confidence});}
 return{scheduled,plans};
}
