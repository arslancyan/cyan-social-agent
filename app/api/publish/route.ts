import {NextResponse} from "next/server";
import {publishDraft} from "@/lib/platforms";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";
import {claimManualPublish,recordEvent,updateStatus} from "@/lib/store";

export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("publish:"+user.id,30,60)))return NextResponse.json({error:"Publishing rate limit reached. Try again shortly."},{status:429});
  const b=await req.json().catch(()=>({}));
  if(!b.draft||typeof b.draft!=="object"||typeof b.draft.id!=="string"||b.draft.id.length>200)return NextResponse.json({error:"A valid draft id is required"},{status:400});
  const allowed=await consumeUsage(user,"publishes");
  if(!allowed)return NextResponse.json({error:"Daily publishing limit reached for your plan."},{status:429});
  const draft=await runAsUser(user,()=>claimManualPublish(b.draft.id));
  if(!draft){await releaseUsage(user,"publishes");return NextResponse.json({error:"Draft is no longer available for publishing."},{status:409});}
  const result=await runAsUser(user,()=>publishDraft(draft));
  if(result.ok){
   await runAsUser(user,()=>updateStatus(draft.id,"published",undefined,result.externalId));
  }else if(result.pending&&result.externalId){
   await runAsUser(user,()=>updateStatus(draft.id,"scheduled",new Date(Date.now()+5*60*1000).toISOString(),result.externalId));
  }else{
   await releaseUsage(user,"publishes");
   if(result.retryable===false){
    await runAsUser(user,()=>updateStatus(draft.id,"review",undefined,null));
    await runAsUser(user,()=>recordEvent("publish_blocked",{draftId:draft.id,platform:draft.platform,metadata:{reason:result.message||"Non-retryable publish failure",retryable:false,source:"manual_publish"}}));
   }else{
    await runAsUser(user,()=>updateStatus(draft.id,"scheduled",new Date(Date.now()+15*60*1000).toISOString(),null));
   }
  }
  return NextResponse.json(result);
 }catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Publish API failed",e);return NextResponse.json({error:"Publishing service unavailable"},{status:503})}
}
