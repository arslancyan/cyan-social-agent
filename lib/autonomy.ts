import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {Platform,Trend} from "./types";
import {generationStrategy,platformPerformanceScores} from "./adaptive";
import {latestTrends,contentFatigue} from "./store";
import {explorationBudget} from "./experiment-engine";
import {topPatterns} from "./pattern-memory";

export type StrategyDecision={trend:Trend;priority:number;reason:string;platform:Platform;angle:string;features:any;topic:string;exploration:boolean;recommendedAt:string;confidence:number;decision:"exploit"|"explore"|"refresh"|"avoid";memoryScore:number;novelty:number;};

const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));

export async function chooseNextIdea():Promise<StrategyDecision|null>{
 await dbReady();
 const [trends,platforms,strategy,budget,patterns]=await Promise.all([latestTrends(30),platformPerformanceScores(),generationStrategy(),explorationBudget(),topPatterns(80)]);
 if(!trends.length)return null;
 const recent=await pool.query("SELECT id,content,platform,angle,created_at FROM cyan_drafts WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '7 days' ORDER BY created_at DESC LIMIT 150",[workspaceId()]);
 const recentRows=recent.rows;
 const fatigue=await contentFatigue(recentRows.map((r:any)=>({id:r.id,platform:r.platform,angle:r.angle,content:r.content,status:"draft"} as any)));
 const fatigueIds=new Set(fatigue.map(x=>x.id));
 const recentAngles=new Map<string,number>();
 for(const r of recentRows)recentAngles.set(String(r.platform)+"|"+String(r.angle),(recentAngles.get(String(r.platform)+"|"+String(r.angle))||0)+1);

 const cross=(strategy.crossPlatform||[]).filter((x:any)=>x.confidence>=25);
 const candidates=trends.map((t,index)=>{
  const trendNovelty=recentRows.some((r:any)=>String(r.content).toLowerCase().includes(t.title.toLowerCase().slice(0,50)))?5:100;
  const explorationAllowed=!budget.needExploitation;
  const explore=Boolean((budget.needExploration&&index<3)||(explorationAllowed&&index===1&&strategy.explorePlatforms?.length));
  const target=cross.find((x:any)=>!explore||strategy.explorePlatforms.includes(x.platform))||cross[0];
  const platform=((explore?platforms.find(x=>strategy.explorePlatforms.includes(x.platform))?.platform:target?.platform)||platforms[0]?.platform||"X") as Platform;
  const angle=explore?"Contrarian":(target?.platform===platform?target.angle:strategy.bestAngle||"Hook");
  const pattern=patterns.find(p=>p.patternType==="platform_angle"&&p.patternKey===platform+"|"+angle);
  const memoryScore=pattern?Math.round(50+(pattern.score-50)*Math.exp(-Math.max(0,(Date.now()-new Date(pattern.lastObservedAt).getTime())/86400000)/45)):50;
  const repeatCount=recentAngles.get(platform+"|"+angle)||0;
  const fatiguePenalty=Math.min(20,repeatCount*5);
  const novelty=Math.max(0,trendNovelty-fatiguePenalty);
  const trendScore=t.score*.55+(t.velocity||0)*.15+(t.relevance||0)*.1+novelty*.1+memoryScore*.1;
  const confidence=Math.round(clamp(((target?.confidence||0)+memoryScore+(100-Math.min(100,repeatCount*20)))/3));
  const decision:StrategyDecision["decision"]=explore?"explore":memoryScore>=72&&confidence>=60?"exploit":memoryScore<42&&pattern?"refresh":"avoid";
  const priority=Math.round(clamp(trendScore-(decision==="avoid"?12:0)));
  const reason=decision==="explore"?"Explore a lower-confidence platform/angle while the exploration budget permits it.":decision==="refresh"?"Refresh a decaying pattern with a new execution instead of repeating the old creative.":decision==="avoid"?"Avoid a weak or overused pattern and preserve room for a better combination.":"Exploit a proven pattern, weighted by its decayed memory score and current trend strength.";
  return{trend:t,priority,reason,platform,angle,features:strategy.topFeatures.slice(0,3),topic:t.title,exploration:explore,recommendedAt:new Date(Date.now()+30*60000).toISOString(),confidence,memoryScore,novelty,decision};
 }).filter(x=>x.decision!=="avoid"||x.priority>=70).sort((a,b)=>b.priority-a.priority);
 const chosen=candidates[0]||null;
 if(chosen)await pool.query("INSERT INTO cyan_strategy_decisions(workspace_id,trend_id,platform,angle,decision,exploration,priority,confidence,reason,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[workspaceId(),chosen.trend.id,chosen.platform,chosen.angle,chosen.decision,chosen.exploration,chosen.priority,chosen.confidence,chosen.reason,JSON.stringify({memoryScore:chosen.memoryScore,novelty:chosen.novelty})]);
 return chosen;
}

export async function strategyStatus(){
 await dbReady();
 const [idea,strategy,budget]=await Promise.all([chooseNextIdea(),generationStrategy(),explorationBudget()]);
 const decisions=await pool.query("SELECT trend_id,platform,angle,decision,exploration,priority,confidence,reason,created_at FROM cyan_strategy_decisions WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 20",[workspaceId()]);
 return{idea,strategy,budget,decisions:decisions.rows,ready:Boolean(idea),generatedAt:new Date().toISOString()};
}

export const autonomyStatus=strategyStatus;
