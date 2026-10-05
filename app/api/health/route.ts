import {NextResponse} from "next/server";
import {getControl} from "@/lib/store";

export const dynamic="force-dynamic";

export async function GET(){
 let db=false;
 let control={mode:"smart",paused:false,heartbeatAt:null as string|null};
 if(process.env.DATABASE_URL){
  try{control=await getControl();db=true}catch{}
 }
 return NextResponse.json({
  name:"CYAN Social Agent",
  status:"ok",
  mode:control.mode,
  paused:control.paused,
  publishing:"official-api-only",
  agent:db,
  scheduler:db,
  trendWatch:db&&Boolean(process.env.TREND_SOURCE_URL),
  lastHeartbeat:control.heartbeatAt||"not configured",
  infrastructure:db?"database connected":"database not configured/unreachable"
 });
}