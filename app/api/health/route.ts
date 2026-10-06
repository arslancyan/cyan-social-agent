import {NextResponse} from "next/server";
import {dbReady,pool} from "@/lib/db";
import {getControl} from "@/lib/store";

export const dynamic="force-dynamic";

export async function GET(){
 let db=false;
 let databaseError:string|null=null;
 let databaseSource:string|null=null;
 let control={mode:"smart",paused:false,heartbeatAt:null as string|null};
 const candidates=["DATABASE_URL","POSTGRES_URL","POSTGRES_PRISMA_URL","POSTGRES_URL_NON_POOLING"];
 databaseSource=candidates.find(k=>Boolean(process.env[k]))||null;
 if(databaseSource){
  try{
   await dbReady();
   await pool.query("SELECT 1");
   control=await getControl();
   db=true;
  }catch(e){databaseError=e instanceof Error?e.name:"database connection failed";}
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
  infrastructure:db?"database connected":databaseSource?"database configured but unreachable":"database not configured",
  databaseConfigured:Boolean(databaseSource),
  databaseSource,
  databaseError,
 },{status:db?200:503});
}
