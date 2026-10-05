import {NextResponse} from "next/server";
import {dbReady,pool} from "@/lib/db";
import {getControl} from "@/lib/store";

export const dynamic="force-dynamic";

export async function GET(){
 let db=false;
 let control={mode:"smart",paused:false,heartbeatAt:null as string|null};
 if(process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL_NON_POOLING){
  try{
   await dbReady();
   await pool.query("SELECT 1");
   control=await getControl();
   db=true;
  }catch{}
 }
 return NextResponse.json({
  name:"CYAN Social Agent",
  status:db?"ok":"degraded",
  mode:control.mode,
  paused:control.paused,
  publishing:"official-api-only",
  agent:db,
  scheduler:db,
  workerMode:"github-oidc",
  trendWatch:db,
  lastHeartbeat:control.heartbeatAt||"not configured",
  infrastructure:db?"database connected":"database not configured/unreachable",
 },{status:db?200:503});
}
