import {NextResponse} from "next/server";
import {publishDraft} from "@/lib/platforms";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";
import {getDraft} from "@/lib/store";

export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("publish:"+user.id,30,60)))return NextResponse.json({error:"Publishing rate limit reached. Try again shortly."},{status:429});
  const b=await req.json().catch(()=>({}));
  if(!b.draft||typeof b.draft!=="object"||typeof b.draft.id!=="string"||b.draft.id.length>200)return NextResponse.json({error:"A valid draft id is required"},{status:400});
  const draft=await runAsUser(user,()=>getDraft(b.draft.id));
  if(!draft)return NextResponse.json({error:"Draft not found"},{status:404});
  if(!["draft","review","scheduled"].includes(draft.status))return NextResponse.json({error:"Only draft, review, or scheduled posts can be published manually."},{status:409});
  const allowed=await consumeUsage(user,"publishes");
  if(!allowed)return NextResponse.json({error:"Daily publishing limit reached for your plan."},{status:429});
  const result=await runAsUser(user,()=>publishDraft(draft));
  if(!result.ok)await releaseUsage(user,"publishes");
  return NextResponse.json(result);
 }catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Publish API failed",e);return NextResponse.json({error:"Publishing service unavailable"},{status:503})}
}
