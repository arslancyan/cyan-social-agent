import {NextResponse} from "next/server";
import {analyticsSummary} from "@/lib/store";
import {dbReady,pool} from "@/lib/db";
import {requireUser,runAsUser} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const user=await requireUser();
  return NextResponse.json(await runAsUser(user,async()=>{
   const [events,trendStats,usage]=await Promise.all([
    analyticsSummary(),
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE score>=85)::int AS high, COALESCE(ROUND(AVG(score)),0)::int AS avg FROM cyan_trends WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '30 days'",[user.id]),
    pool.query("SELECT COALESCE(SUM(generations),0)::int AS generations,COALESCE(SUM(publishes),0)::int AS publishes FROM cyan_usage WHERE user_id=$1 AND day>=CURRENT_DATE-INTERVAL '29 days'",[user.id])
   ]);
   const published=events.filter((x:any)=>x.type==="publish").reduce((n:number,x:any)=>n+Number(x.count||0),0);
   return {published,events,trend:{total:Number(trendStats.rows[0]?.total||0),high:Number(trendStats.rows[0]?.high||0),average:Number(trendStats.rows[0]?.avg||0)},usage:{generations:Number(usage.rows[0]?.generations||0),publishes:Number(usage.rows[0]?.publishes||0)}};
  }));
 }catch{return NextResponse.json({error:"Analytics unavailable"},{status:503});}
}