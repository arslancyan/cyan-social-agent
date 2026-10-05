import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {Platform} from "./types";
import {platformPerformanceScores,anglePerformanceScores,featurePerformanceScores,timeSlotScores,platformAdaptationPlans} from "./adaptive";
import {topPatterns} from "./pattern-memory";
import {learnedWeights,LearnedWeights} from "./online-learning";

const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;

export type OptimizationCandidate={
  platform:Platform; angle:string; feature?:string; hour:number; day:number;
  expectedScore:number; confidence:number; novelty:number; evidence:string[];
};

export async function expectedOutcomeScore(input:{
  trendScore:number; velocity?:number; relevance?:number;
  platformScore:number; platformConfidence:number;
  angleScore:number; angleConfidence:number;
  featureScore:number; featureConfidence:number;
  timeScore:number; timeConfidence:number;
  adaptationScore:number; adaptationConfidence:number;
  memoryScore?:number; exploration?:boolean; weights?:LearnedWeights;
}){
  const trend=clamp(input.trendScore*.65+num(input.velocity)*.2+num(input.relevance)*.15);
  const platform=input.platformScore*.7+input.platformConfidence*.3;
  const angle=input.angleScore*.65+input.angleConfidence*.35;
  const feature=input.featureScore*.65+input.featureConfidence*.35;
  const time=input.timeScore*.65+input.timeConfidence*.35;
  const adaptation=input.adaptationScore*.6+input.adaptationConfidence*.4;
  const memory=clamp(num(input.memoryScore)||50);
  const weights=input.weights||await learnedWeights();
  let score=trend*weights.trend+platform*weights.platform+angle*weights.angle+feature*weights.feature+time*weights.time+adaptation*weights.adaptation+memory*weights.memory;
  if(input.exploration)score+=Math.max(0,35-Math.min(35,input.platformConfidence*.25));
  const confidence=clamp(input.platformConfidence*.25+input.angleConfidence*.18+input.featureConfidence*.15+input.timeConfidence*.15+input.adaptationConfidence*.17+(input.memoryScore?10:0));
  return {score:Math.round(clamp(score)),confidence:Math.round(confidence)};
}

export async function rankDecisionCandidates(trend:any, limit=12):Promise<OptimizationCandidate[]>{
  const [platforms,adaptations,patterns,weights]=await Promise.all([platformPerformanceScores(),platformAdaptationPlans(),topPatterns(120),learnedWeights()]);
  const out:OptimizationCandidate[]=[];
  for(const p of platforms){
    const [angles,features,slots]=await Promise.all([anglePerformanceScores(p.platform),featurePerformanceScores(p.platform),timeSlotScores(p.platform)]);
    const candidatesAngles:any[]=angles.length?angles.slice(0,4):[{angle:"Hook",score:55,confidence:0,samples:0}];
    const candidatesFeatures:any[]=features.length?features.slice(0,4):[{feature:"hook",value:"hook",score:55,confidence:0,samples:0}];
    const candidatesSlots=slots.slice(0,4);
    const adaptation=adaptations.find(x=>x.platform===p.platform);
    for(const a of candidatesAngles)for(const f of candidatesFeatures.slice(0,2))for(const slot of candidatesSlots.slice(0,2)){
      const memory=patterns.find(x=>x.patternType==="platform_angle"&&x.patternKey===p.platform+"|"+a.angle);
      const result=await expectedOutcomeScore({
        trendScore:num(trend.score),velocity:num(trend.velocity),relevance:num(trend.relevance),
        platformScore:p.score,platformConfidence:p.confidence,
        angleScore:num(a.score),angleConfidence:num(a.confidence),
        featureScore:num(f.score),featureConfidence:num(f.confidence),
        timeScore:num(slot.score),timeConfidence:num(slot.confidence),
        adaptationScore:num(adaptation?.score)||50,adaptationConfidence:num(adaptation?.confidence),
        memoryScore:num(memory?.score)||50,exploration:p.confidence<55,weights
      });
      out.push({platform:p.platform,angle:a.angle,feature:f.feature+":"+f.value,hour:slot.hour,day:slot.day,expectedScore:result.score,confidence:result.confidence,novelty:clamp(100-(memory?.samples||0)*8),evidence:[
        p.samples?p.samples+" official platform snapshots":"no platform snapshot evidence",
        a.samples?a.samples+" angle snapshots":"no angle evidence",
        adaptation?.evidence?.[0]||"cold-start adaptation"
      ]});
    }
  }
  return out.sort((a,b)=>(b.expectedScore+b.confidence*.15)-(a.expectedScore+a.confidence*.15)).slice(0,limit);
}

export async function calibrateLearning():Promise<{updates:number;averageError:number;bias:number}>{
  await dbReady();
  const r=await pool.query(`SELECT DISTINCT ON (e.draft_id,e.metadata->>'window') d.id,d.platform,d.angle,d.features,e.metadata,e.created_at
    FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id
    WHERE e.workspace_id=$1 AND e.type='performance_snapshot'
      AND e.created_at>=NOW()-INTERVAL '14 days'
      AND e.metadata->>'window' IN ('24h','72h')
    ORDER BY e.draft_id,e.metadata->>'window',e.created_at DESC
    LIMIT 500`,[workspaceId()]);
  if(!r.rows.length)return {updates:0,averageError:0,bias:0};
  let total=0,bias=0,count=0;
  for(const row of r.rows){
    const m=row.metadata||{};
    const impressions=Math.max(1,num(m.impressions||m.views));
    const interactions=num(m.likes)+num(m.comments)*3+num(m.shares)*4+num(m.clicks)*2;
    const actual=clamp(interactions/impressions*1000);
    const expected=Number.isFinite(Number(m.expectedOutcome))?clamp(Number(m.expectedOutcome)):clamp(50+Math.min(35,Math.log10(impressions+1)*8));
    const error=actual-expected;
    total+=Math.abs(error);bias+=error;count++;
  }
  const averageError=Number((total/count).toFixed(2)),meanBias=Number((bias/count).toFixed(2));
  const recent=await pool.query("SELECT 1 FROM cyan_events WHERE workspace_id=$1 AND type='learning_update' AND created_at>=NOW()-INTERVAL '6 hours' LIMIT 1",[workspaceId()]);
  if(!recent.rowCount)await pool.query(`INSERT INTO cyan_events(workspace_id,type,metadata) VALUES($1,'learning_update',$2)`,[workspaceId(),JSON.stringify({source:"official_api",schemaVersion:2,windows:["24h","72h"],samples:count,averageAbsoluteError:averageError,bias:meanBias,predictionSource:"event_metadata_or_baseline",updatedAt:new Date().toISOString()})]);
  return {updates:count,averageError,bias:meanBias};
}

export async function combinationMemory(){
  await dbReady();
  const r=await pool.query(`SELECT d.platform,d.angle,d.features,e.metadata,e.created_at
    FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id
    WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days' LIMIT 4000`,[workspaceId()]);
  const groups=new Map<string,any[]>();
  for(const row of r.rows){const f=row.features||{};const key=String(row.platform)+"|"+String(row.angle)+"|"+String(f.format||"unknown");if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(row);}
  return [...groups.entries()].map(([key,rows])=>{let weighted=0,weight=0;for(const row of rows){const m=row.metadata||{};const impressions=Math.max(1,num(m.impressions||m.views));const interactions=num(m.likes)+num(m.comments)*3+num(m.shares)*4+num(m.clicks)*2;const score=clamp(interactions/impressions*1000);const age=Math.max(0,(Date.now()-new Date(row.created_at).getTime())/86400000);const w=Math.max(.2,Math.exp(-age/45));weighted+=score*w;weight+=w;}const [platform,angle,format]=key.split("|");const effective=rows.reduce((s,row)=>s+Math.max(.25,Math.exp(-Math.max(0,(Date.now()-new Date(row.created_at).getTime())/86400000)/45)),0);const confidence=Math.round(100*(1-Math.exp(-effective/12)));return{platform,angle,format,score:Math.round(weight?weighted/weight:50),samples:rows.length,confidence};}).sort((a,b)=>b.score-a.score);
}

export async function optimizationStatus(){
  await dbReady();
  const [patterns,adaptations,learning]=await Promise.all([topPatterns(20),platformAdaptationPlans(),calibrateLearning()]);
  return {learning,adaptations:adaptations.map(x=>({platform:x.platform,score:x.score,confidence:x.confidence,evidence:x.evidence})),patterns:patterns.slice(0,12),generatedAt:new Date().toISOString()};
}

export async function portfolioPlan(){
  const adaptations=await platformAdaptationPlans();
  const ranked=[...adaptations].sort((a,b)=>(b.score*b.confidence)-(a.score*a.confidence));
  const total=ranked.reduce((n,x)=>n+Math.max(1,x.score*(x.confidence/100)),0)||1;
  return ranked.map(x=>({platform:x.platform,allocation:Math.round(Math.min(60,Math.max(10,x.score*(x.confidence/100)/total*100))),exploration:x.confidence<55}));
}
