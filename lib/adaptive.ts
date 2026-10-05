import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {getControl} from "./store";
import {Draft,Platform} from "./types";
import {classifyContent} from "./content-intelligence";
import {topPatterns,patternHealth} from "./pattern-memory";

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
 await dbReady();
 const r=await pool.query(`SELECT platform,type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '90 days' AND platform IS NOT NULL AND type IN ('performance_snapshot','publish','publish_failed') ORDER BY created_at DESC LIMIT 3000`,[workspaceId()]);
 return PLATFORMS.map(platform=>{
  const rows=r.rows.filter((x:any)=>x.platform===platform);
  const snapshots=rows.filter((x:any)=>x.type==="performance_snapshot");
  const s=weightedScore(snapshots);
  const published=rows.filter((x:any)=>x.type==="publish").length;
  const failed=rows.filter((x:any)=>x.type==="publish_failed").length;
  const reliability=(published+failed)?published/(published+failed):0.5;
  const evidence=s.samples;
  const prior=platform==="X"?62:platform==="TikTok"?60:platform==="Instagram"?58:52;
  const evidenceWeight=Math.min(.8,evidence/12);
  const score=prior*(1-evidenceWeight)+(s.score*.85+reliability*100*.15)*evidenceWeight;
  const confidence=Math.round(Math.min(100,evidence*7+Math.min(20,published+failed)*1.5));
  return{platform,score:Math.round(score),confidence,samples:evidence,published,successRate:Number(reliability.toFixed(3)),engagementRate:Number(s.engagementRate.toFixed(4)),avgViews:Math.round(s.avgViews),
   reason:evidence===0?"No official performance evidence yet; prior is retained without pretending the platform has learned.":`${evidence} official performance snapshots with recency weighting; publishing reliability is used as a secondary signal.`};
 });
}export async function anglePerformanceScores(platform?:Platform):Promise<AngleScore[]>{
 await dbReady();const sql=`SELECT d.angle,e.metadata,e.created_at FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days' ${platform?"AND e.platform=$2":""} ORDER BY e.created_at DESC LIMIT 3000`;
 const r=await pool.query(sql,platform?[workspaceId(),platform]:[workspaceId()]);const groups=new Map<string,any[]>();
 for(const row of r.rows){const key=String(row.angle||"unknown");if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(row);}
 return[...groups.entries()].map(([angle,rows])=>{const s=weightedScore(rows);return{angle,score:Math.round(s.score),confidence:Math.round(s.confidence),samples:s.samples,engagementRate:Number(s.engagementRate.toFixed(4)),avgViews:Math.round(s.avgViews),reason:s.samples<5?"Early signal; keep testing this angle.":"Learned from recent performance snapshots."};}).sort((a,b)=>b.score-a.score);
}

export async function featurePerformanceScores(platform?:Platform){await dbReady();const sql=`SELECT d.features,e.metadata,e.created_at FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days' ${platform?"AND e.platform=$2":""} LIMIT 4000`;const r=await pool.query(sql,platform?[workspaceId(),platform]:[workspaceId()]);const groups=new Map<string,any[]>();for(const row of r.rows){for(const [k,v] of Object.entries(row.features||{})){if(v===undefined||v===null||v==="")continue;const key=k+":"+String(v);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(row);}}return[...groups.entries()].map(([key,rows])=>{const [feature,value]=key.split(":");const s=weightedScore(rows);return{feature,value,score:Math.round(s.score),confidence:Math.round(s.confidence),samples:s.samples,engagementRate:Number(s.engagementRate.toFixed(4))};}).sort((a,b)=>b.score-a.score);}
export async function timeSlotScores(platform:Platform){
 await dbReady();const r=await pool.query("SELECT type,metadata,created_at FROM cyan_events WHERE workspace_id=$1 AND platform=$2 AND created_at>=NOW()-INTERVAL '90 days' ORDER BY created_at DESC LIMIT 2000",[workspaceId(),platform]);
 const control=await getControl(),map=new Map<string,any[]>();for(const row of r.rows){const d=new Date(row.created_at),parts=new Intl.DateTimeFormat("en-US",{timeZone:control.timezone,weekday:"short",hour:"2-digit",hour12:false}).formatToParts(d),wd=parts.find(x=>x.type==="weekday")?.value||"Sun",hour=Number(parts.find(x=>x.type==="hour")?.value||0),days:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6},key=String(days[wd])+"-"+String(hour);if(!map.has(key))map.set(key,[]);map.get(key)!.push(row);}
 const out:SlotScore[]=[];for(let day=0;day<7;day++)for(let hour=0;hour<24;hour++){const rows=map.get(String(day)+"-"+String(hour))||[],s=weightedScore(rows),score=Math.round(rows.length?55*.35+s.score*.65:55);out.push({platform,hour,day,score,confidence:Math.round(s.confidence),samples:s.samples,reason:rows.length?"Learned from historical performance in this time slot.":"Exploration slot; no historical evidence yet."});}return out.sort((a,b)=>b.score-a.score);
}
function nextOccurrence(day:number,hour:number,from:Date,timezone:string){const days:any={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};for(let i=0;i<24*15;i++){const d=new Date(from.getTime()+i*3600000),parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short",hour:"2-digit",hour12:false}).formatToParts(d),wd=parts.find(x=>x.type==="weekday")?.value||"Sun",h=Number(parts.find(x=>x.type==="hour")?.value||0);if(days[wd]===day&&h===hour&&d.getTime()>from.getTime()+30*60000)return d;}return new Date(from.getTime()+24*3600000);}
export async function adaptivePlan(drafts:Draft[],now=new Date()){
 const control=await getControl(),platforms=await platformPerformanceScores(),angles=await anglePerformanceScores(),features=await featurePerformanceScores(),angleBy=new Map(angles.map(x=>[x.angle,x])),featureBy=new Map(features.map(x=>[x.feature+":"+x.value,x]));
 const candidates=await Promise.all(drafts.map(async d=>{const p=platforms.find(x=>x.platform===d.platform)!;const best=(await timeSlotScores(d.platform))[0],a=angleBy.get(d.angle),f=d.features||classifyContent(d.content,d.platform,d.mediaType),fs=Object.entries(f).map(([k,v])=>featureBy.get(k+":"+String(v))).filter(Boolean) as any[],featureScore=fs.length?fs.reduce((n,x)=>n+x.score,0)/fs.length:55,angleScore=a?.score??55,score=Math.round(p.score*.35+angleScore*.20+featureScore*.20+best.score*.25),confidence=Math.round((p.confidence+(a?.confidence||0)+best.confidence)/3);return{draftId:d.id,experimentId:d.experimentId||null,variant:d.variant||null,platform:d.platform,angle:d.angle,score,confidence,recommendedAt:nextOccurrence(best.day,best.hour,now,control.timezone).toISOString(),platformScore:p.score,angleScore,featureScore:Math.round(featureScore),timeScore:best.score,features:f,reason:[p.reason,a?.reason||"No angle history; exploration recommended.",best.reason].join(" ")};}));
 return candidates.sort((a,b)=>b.score-a.score);
}
export async function chooseBestDecision(drafts:Draft[],now=new Date()){
 const plans=await adaptivePlan(drafts,now);if(!plans.length)return null;
 const explore=plans.filter(x=>x.confidence<55).sort((a,b)=>a.confidence-b.confidence)[0];
 const exploit=plans[0];
 if(!explore)return exploit;
 return explore.score>=exploit.score-8?explore:exploit;
}

export async function crossPlatformIntelligence(){
 await dbReady();
 const r=await pool.query(`SELECT e.platform,d.angle,e.metadata,e.created_at
 FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id
 WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days'
 ORDER BY e.created_at DESC LIMIT 4000`,[workspaceId()]);
 const groups=new Map<string,any[]>();
 for(const row of r.rows){const key=String(row.platform||"unknown")+"|"+String(row.angle||"unknown");if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(row);}
 return [...groups.entries()].map(([key,rows])=>{const [platform,angle]=key.split("|");const s=weightedScore(rows);return{platform:platform as Platform,angle,score:Math.round(s.score),confidence:Math.round(s.confidence),samples:s.samples,avgViews:Math.round(s.avgViews),engagementRate:Number(s.engagementRate.toFixed(4))};}).sort((a,b)=>b.score-a.score);
}

export async function generationStrategy(now=new Date()){
 const platforms=await platformPerformanceScores(),angles=await anglePerformanceScores(),features=await featurePerformanceScores(),crossPlatform=await crossPlatformIntelligence(),patterns=await topPatterns(40),memory=await patternHealth();
 const patternByKey=new Map(patterns.map(x=>[x.patternType+"|"+x.patternKey,x]));
 const enrichedCrossPlatform=crossPlatform.map(x=>{const p=patternByKey.get("platform_angle|"+x.platform+"|"+x.angle);const bonus=p?Math.min(8,Math.max(0,(p.score-50)*0.12)):0;return {...x,score:Math.round(Math.min(100,x.score+bonus)),memoryBonus:Math.round(bonus)};}).sort((a,b)=>b.score-a.score);
 const bestPlatform=[...platforms].sort((a,b)=>(b.score*b.confidence)-(a.score*a.confidence))[0],bestAngle=angles[0];
 const lowConfidence=platforms.filter(x=>x.confidence<55).map(x=>x.platform);
 const evidenceRichPlatforms=platforms.filter(x=>x.confidence>=55).sort((a,b)=>b.score-a.score).map(x=>x.platform);
 await dbReady();
 const winners=await pool.query("SELECT d.platform,d.angle,d.features,e.metadata,e.created_at FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id WHERE e.workspace_id=$1 AND e.type='experiment_winner' ORDER BY e.created_at DESC LIMIT 20",[workspaceId()]);
 const winnerPatterns=winners.rows.map((x:any)=>({platform:x.platform,angle:x.angle,features:x.features||{},score:Number(x.metadata?.score||0),createdAt:new Date(x.created_at).toISOString()}));
 return {crossPlatform:enrichedCrossPlatform.slice(0,12),creativeMemory:memory,topPatterns:patterns.slice(0,15),bestPlatform:bestPlatform?.platform||null,bestPlatformScore:bestPlatform?.score||50,bestAngle:bestAngle?.angle||null,bestAngleScore:bestAngle?.score||50,topFeatures:features.slice(0,8),winnerPatterns,explorePlatforms:lowConfidence,explorationRatio:lowConfidence.length?0.35:0.15,evidenceRichPlatforms,platformEvidence:platforms.map(x=>({platform:x.platform,score:x.score,confidence:x.confidence,samples:x.samples,avgViews:x.avgViews,engagementRate:x.engagementRate,reason:x.reason})),generatedAt:now.toISOString()};
}
export async function autoScheduleAdaptive(draftIds:string[],mode:"smart"|"autonomous"){
 if(mode!=="autonomous")return{scheduled:[],skipped:"Autonomous mode required for automatic scheduling."};
 await dbReady();const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 AND id=ANY($2::text[]) AND status IN ('draft','review') AND protected=false",[workspaceId(),draftIds]);
 const connections=await pool.query("SELECT platform FROM cyan_connections WHERE workspace_id=$1 AND status='connected'",[workspaceId()]);
 const connected=new Set<string>(connections.rows.map((x:any)=>String(x.platform)));
 const drafts:Draft[]=r.rows.map((x:any)=>({id:x.id,platform:x.platform,angle:x.angle,content:x.content,status:x.status,protected:false,mediaUrl:x.media_url||undefined,mediaType:x.media_type||undefined,features:x.features||undefined,experimentId:x.experiment_id||undefined,variant:x.variant||undefined}));
 const publishable=(d:Draft)=>connected.has(d.platform)&&(["X","TikTok"] as string[]).includes(d.platform)&&(d.platform!=="TikTok"||Boolean(d.mediaUrl&&d.mediaType==="video"));
 const publishableIds=new Set(drafts.filter(publishable).map(d=>d.id));
 const plans=await adaptivePlan(drafts.filter(d=>publishableIds.has(d.id))),scheduled:any[]=[],experimentOffsets=new Map<string,number>();
 for(const p of plans){if(p.score<65||p.confidence<25||!publishableIds.has(p.draftId))continue;const offset=p.experimentId?(experimentOffsets.get(p.experimentId)||0):0;if(p.experimentId)experimentOffsets.set(p.experimentId,offset+1);const scheduledAt=offset?new Date(new Date(p.recommendedAt).getTime()+offset*6*3600000).toISOString():p.recommendedAt;const u=await pool.query("UPDATE cyan_drafts SET status='scheduled',scheduled_at=$1 WHERE workspace_id=$2 AND id=$3 AND status IN ('draft','review') AND protected=false RETURNING id,platform,scheduled_at",[scheduledAt,workspaceId(),p.draftId]);if(u.rows[0])scheduled.push({draftId:p.draftId,platform:p.platform,angle:p.angle,scheduledAt:u.rows[0].scheduled_at,score:p.score,confidence:p.confidence});}
 return{scheduled,plans};
}

export type PlatformAdaptation={
 platform:Platform; hook:string; length:"short"|"medium"|"long"; cta:string;
 format:string; media:"text"|"image"|"video"; tone:string; angle:string;
 confidence:number; score:number; evidence:string[];
};
const ADAPTATION_PROFILES:Record<Platform,Omit<PlatformAdaptation,"platform"|"angle"|"confidence"|"score"|"evidence">>={
 X:{hook:"sharp concise hook",length:"short",cta:"specific question or useful opinion",format:"post/thread",media:"image",tone:"direct conversational insight-first"},
 TikTok:{hook:"front-load curiosity or payoff",length:"medium",cta:"simple comment or retention prompt",format:"short-video",media:"video",tone:"fast visual energetic retention-first"},
 Instagram:{hook:"clear first visual or caption line",length:"medium",cta:"invite saves shares or focused comment",format:"reel/carousel/caption",media:"image",tone:"visual-first polished concise"},
 Facebook:{hook:"give context and why it matters",length:"long",cta:"invite substantive discussion",format:"post/video",media:"image",tone:"context-rich approachable discussion-first"}
};
const adaptationClamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
export async function platformAdaptationPlans():Promise<PlatformAdaptation[]>{
 const platforms=await platformPerformanceScores();
 const plans=await Promise.all((PLATFORMS as Platform[]).map(async platform=>{
  const [angles,features,patterns]=await Promise.all([anglePerformanceScores(platform),featurePerformanceScores(platform),topPatterns(80)]);
  const profile=ADAPTATION_PROFILES[platform],ps=platforms.find(x=>x.platform===platform),angle=angles[0],feature=features.find(x=>x.feature==="hook"),memory=patterns.find(x=>x.patternType==="platform_angle"&&x.patternKey.startsWith(platform+"|"));
  const confidence=adaptationClamp((ps?.confidence||0)*.55+(angle?.confidence||0)*.25+(feature?.confidence||0)*.10+(memory?.confidence||0)*.10);
  const score=adaptationClamp((ps?.score||50)*.45+(angle?.score||55)*.20+(feature?.score||55)*.15+(memory?.score||50)*.20);
  const evidence:string[]=[];
  if(ps?.samples)evidence.push(ps.samples+" official performance snapshots");
  if(angle)evidence.push("platform angle "+angle.angle+" score "+angle.score);
  if(feature)evidence.push("platform hook feature "+feature.value+" score "+feature.score);
  if(memory)evidence.push("creative memory supports this platform");
  if(!evidence.length)evidence.push("cold-start profile; no fabricated performance evidence");
  return {...profile,platform,angle:angle?.angle||"Hook",confidence,score,evidence};
 }));
 return plans.sort((a,b)=>b.score*b.confidence-a.score*a.confidence);
}
export function adaptationPrompt(plan:PlatformAdaptation,coreIdea:string){
 return ["Platform: "+plan.platform,"Core idea: "+coreIdea,"Preferred angle: "+plan.angle,"Hook: "+plan.hook,"Length: "+plan.length,"Format: "+plan.format,"Media: "+plan.media,"CTA: "+plan.cta,"Tone: "+plan.tone,"Treat these as optimization constraints, not facts. Preserve verified facts and never invent claims.","Evidence: "+plan.evidence.join("; ")].join("\n");
}
export async function createExperiment(topic:string,drafts:Draft[]){await dbReady();if(drafts.length<2)return null;const id=crypto.randomUUID();await pool.query("INSERT INTO cyan_experiments(id,workspace_id,topic) VALUES($1,$2,$3)",[id,workspaceId(),topic.slice(0,500)]);const variants=["A","B","C","D"];for(let i=0;i<drafts.length;i++){const variant=variants[i]||String.fromCharCode(65+i);drafts[i].experimentId=id;drafts[i].variant=variant;await pool.query("UPDATE cyan_drafts SET experiment_id=$1,variant=$2 WHERE workspace_id=$3 AND id=$4",[id,variant,workspaceId(),drafts[i].id]);}return{id,variants:drafts.map((d,i)=>({draftId:d.id,variant:d.variant||String.fromCharCode(65+i)}))};}
