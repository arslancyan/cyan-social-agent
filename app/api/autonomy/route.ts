import {NextResponse} from "next/server";
import {requireUser,runAsUser,rateLimit} from "@/lib/auth";
import {autonomyStatus} from "@/lib/autonomy";
export const dynamic="force-dynamic";
export async function GET(){
 try{const user=await requireUser();if(!(await rateLimit("autonomy:"+user.id,30,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});return NextResponse.json(await runAsUser(user,autonomyStatus));}
 catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Autonomy API failed",e);return NextResponse.json({error:"Autonomy unavailable"},{status:503});}
}
