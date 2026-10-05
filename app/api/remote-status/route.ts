import {NextResponse} from "next/server";
import {currentUser,runAsUser} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
import {getControl,latestWorkerRun} from "@/lib/store";

export const dynamic="force-dynamic";

export async function GET(){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 return runAsUser(user,async()=>{
  await dbReady();
  const control=await getControl();
  const [queue,trends,published]=await Promise.all([
   pool.query("SELECT COUNT(*)::int AS count FROM cyan_drafts WHERE workspace_id=$1 AND status='scheduled'",[user.id]),
   pool.query("SELECT COUNT(*)::int AS count FROM cyan_trends WHERE workspace_id=$1 AND created_at>=NOW()-INTERVAL '2 hours'",[user.id]),
   pool.query("SELECT COUNT(*)::int AS count FROM cyan_events WHERE workspace_id=$1 AND type='publish' AND created_at>=CURRENT_DATE",[user.id])
  ]);
  const worker=await latestWorkerRun();
  const heartbeat=control.heartbeatAt?new Date(control.heartbeatAt):null;
  const heartbeatAgeSeconds=heartbeat?Math.max(0,Math.floor((Date.now()-heartbeat.getTime())/1000)):null;
  const workerOnline=heartbeatAgeSeconds!==null&&heartbeatAgeSeconds<=12*60;
  return NextResponse.json({
   ok:true,
   paused:control.paused,
   mode:control.mode,
   worker:{
    status:workerOnline?(control.paused?"paused":"online"):"offline",
    lastHeartbeat:control.heartbeatAt,
    heartbeatAgeSeconds,
    lastRun:worker
   },
   queueCount:Number(queue.rows[0]?.count||0),
   trendCount:Number(trends.rows[0]?.count||0),
   publishedToday:Number(published.rows[0]?.count||0)
  });
 });
}
