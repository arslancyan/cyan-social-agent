import {NextResponse} from "next/server";
import {latestTrends} from "@/lib/store";
import {requireUser,runAsUser} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){try{const u=await requireUser();return NextResponse.json(await runAsUser(u,async()=>({trends:await latestTrends(10)})))}catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Trends GET failed",e);return NextResponse.json({error:"Trend service unavailable"},{status:503})}}
