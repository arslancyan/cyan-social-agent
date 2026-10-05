import {NextResponse} from "next/server";
import {publishDraft} from "@/lib/platforms";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";

export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("publish:"+user.id,30,60)))return NextResponse.json({error:"Publishing rate limit reached. Try again shortly."},{status:429});
  const b=await req.json().catch(()=>({}));
  if(!b.draft||typeof b.draft!=="object")return NextResponse.json({error:"draft required"},{status:400});
  const allowed=await consumeUsage(user,"publishes");
  if(!allowed)return NextResponse.json({error:"Daily publishing limit reached for your plan."},{status:429});
  const result=await runAsUser(user,()=>publishDraft(b.draft));
  if(!result.ok)await releaseUsage(user,"publishes");
  return NextResponse.json(result);
 }catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Publish API failed",e);return NextResponse.json({error:"Publishing service unavailable"},{status:503})}
}