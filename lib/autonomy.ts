import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {Draft,Trend,Platform} from "./types";
import {platformPerformanceScores,generationStrategy,featurePerformanceScores} from "./adaptive";
import {latestTrends,contentFatigue} from "./store";

export type AutonomyDecision={trend:Trend;priority:number;reason:string;platform:Platform;angle:string;features:any;topic:string;exploration:boolean;recommendedAt:string;};

export async function chooseNextIdea(){
 await dbReady();
 const trends=await latestTrends(30);
 const platforms=await platformPerformanceScores();
 const strategy=await generationStrategy();
 const features=await featurePerformanceScores();
 if(!trends.length)return null;
 const recent=await pool.query("SELECT content,platform,angle FROM cyan_drafts WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '7 days' ORDER BY created_at DESC LIMIT 100",[workspaceId()]);
 const used=new Set(recent.rows.map((r:any)=>String(r.content).slice(0,160).toLowerCase()));
 const candidates=trends.map(t=>{
  const p=platforms[0]?.platform||"X" as Platform;
  const novelty=used.has(t.title.toLowerCase())?0:15;
  const trendScore=t.score*.6+(t.velocity||0)*.15+(t.relevance||0)*.15+novelty*.1;
  const exploration=Boolean(strategy.explorePlatforms.length)&&Math.random()<strategy.explorationRatio;
  const targetPlatform=exploration?(platforms.find(x=>strategy.explorePlatforms.includes(x.platform))?.platform||p):p;
  const angle=exploration?"Contrarian":(strategy.bestAngle||"Hook");
  return{trend:t,priority:Math.round(trendScore),reason:exploration?"Explore an under-tested platform/angle while using a verified trend.":"Exploit the strongest learned platform/angle against a fresh verified trend.",platform:targetPlatform,angle,features:strategy.topFeatures.slice(0,3),topic:t.title,exploration,recommendedAt:new Date(Date.now()+30*60000).toISOString()};
 }).sort((a,b)=>b.priority-a.priority);
 return candidates[0]||null;
}
export async function autonomyStatus(){
 const [idea,strategy]=await Promise.all([chooseNextIdea(),generationStrategy()]);
 return{idea,strategy,ready:Boolean(idea),generatedAt:new Date().toISOString()};
}
