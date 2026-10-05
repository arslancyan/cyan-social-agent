import {NextResponse} from "next/server";

export async function GET(){
 const configured=Boolean(process.env.DATABASE_URL);
 return NextResponse.json({
  name:"CYAN Social Agent",
  status:"ok",
  mode:"remote-control",
  publishing:"official-api-only",
  agent:configured,
  scheduler:configured,
  trendWatch:configured,
  lastHeartbeat:configured?new Date().toISOString():"not configured",
  infrastructure:configured?"database configured":"database not configured"
 });
}