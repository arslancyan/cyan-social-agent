import {NextResponse} from "next/server";
import {analyticsSummary} from "@/lib/store";
import {dbReady,pool} from "@/lib/db";
import {requireUser,runAsUser,rateLimit} from "@/lib/auth";
import {contentIntelligenceSummary} from "@/lib/store";
import {featurePerformanceScores} from "@/lib/adaptive";
import {growthStatus} from "@/lib/growth-optimizer";
import {explorationBudget} from "@/lib/experiment-engine";
import {patternHealth,topPatterns} from "@/lib/pattern-memory";
import {performanceSources} from "@/lib/performance";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("analytics-feedback:"+user.id,60,60)))return NextResponse.json({error:"Feedback rate limit reached."},{status:429});
  const body=await req.json().catch(()=>({}));
  const type=typeof body.type==="string"?body.type:"";
  if(!["content_feedback","publish_feedback"].includes(type))return NextResponse.json({error:"Invalid feedback type"},{status:400});
  const draftId=typeof body.draftId==="string"&&body.draftId.length<=200?body.draftId:undefined;
  const platform=typeof body.platform==="string"&&body.platform.length<=40?body.platform:undefined;
  const metadata=body.metadata&&typeof body.metadata==="object"?body.metadata:{};
  const metricKeys=["views","impressions","likes","comments","shares","saves","clicks"];
  const safeMetadata={...metadata};
  for(const k of metricKeys){if(k in safeMetadata){const n=Number((safeMetadata as any)[k]);if(!Number.isFinite(n)||n<0||n>10000000000)delete (safeMetadata as any)[k];else (safeMetadata as any)[k]=Math.floor(n);}}
  if(JSON.stringify(metadata).length>4000)return NextResponse.json({error:"Feedback metadata is too large."},{status:400});
  return NextResponse.json(await runAsUser(user,async()=>{await dbReady();await pool.query("INSERT INTO cyan_events(workspace_id,type,platform,draft_id,metadata) VALUES($1,$2,$3,$4,$5)",[user.id,type,platform||null,draftId||null,JSON.stringify(safeMetadata)]);return {ok:true};}));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Analytics feedback failed",e);return NextResponse.json({error:"Analytics unavailable"},{status:503});}
}

export async function GET(){
 try{
  const user=await requireUser();
  return NextResponse.json(await runAsUser(user,async()=>{
   const [events,trendStats,usage,content,features,growth,budget,memory,patterns,sources]=await Promise.all([
    analyticsSummary(),
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE score>=85)::int AS high, COALESCE(ROUND(AVG(score)),0)::int AS avg FROM cyan_trends WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",[user.id]),
    pool.query("SELECT COALESCE(SUM(generations),0)::int AS generations,COALESCE(SUM(publishes),0)::int AS publishes FROM cyan_usage WHERE user_id=$1 AND day>=CURRENT_DATE-INTERVAL '29 days'",[user.id]),
    contentIntelligenceSummary(),featurePerformanceScores(),growthStatus(),explorationBudget(),patternHealth(),topPatterns(15),performanceSources()
   ]);
   const published=events.filter((x:any)=>x.type==="publish").reduce((n:number,x:any)=>n+Number(x.count||0),0);
   const [platforms,feedback]=await Promise.all([
    pool.query("SELECT COALESCE(platform,'unknown') AS platform,type,COUNT(*)::int AS count FROM cyan_events WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days' GROUP BY platform,type ORDER BY count DESC",[user.id]),
    pool.query("SELECT COUNT(*) FILTER (WHERE type='generation')::int AS generations,COUNT(*) FILTER (WHERE type='publish')::int AS publishes,COUNT(*) FILTER (WHERE type='publish_failed')::int AS failed,COUNT(*) FILTER (WHERE type='publish_blocked')::int AS blocked FROM cyan_events WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",[user.id])
   ]);
   return {published,events,platforms:platforms.rows,feedback:feedback.rows[0]||{generations:0,publishes:0,failed:0,blocked:0},trend:{total:Number(trendStats.rows[0]?.total||0),high:Number(trendStats.rows[0]?.high||0),average:Number(trendStats.rows[0]?.avg||0)},usage:{generations:Number(usage.rows[0]?.generations||0),publishes:Number(usage.rows[0]?.publishes||0)},contentIntelligence:content,featureScores:features.slice(0,20),growth,explorationBudget:budget,creativeMemory:memory,topPatterns:patterns,performanceSources:sources};
  }));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Analytics API failed",e);return NextResponse.json({error:"Analytics unavailable"},{status:503});}
}