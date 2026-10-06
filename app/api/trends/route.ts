import {NextResponse} from "next/server";
import {latestTrends} from "@/lib/store";
import {requireUser,runAsUser,rateLimit} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){try{const u=await requireUser();if(!(await rateLimit("trends:"+u.id,120,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});return NextResponse.json(await runAsUser(u,async()=>({trends:await latestTrends(10)})))}catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Trends GET failed",e);return NextResponse.json({error:"Trend service unavailable"},{status:503})}}
