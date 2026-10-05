import {NextResponse} from "next/server";
import {listDrafts,saveDrafts,updateStatus} from "@/lib/store";
import {buildDrafts} from "@/lib/agent";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";

export async function GET(){
 try{const u=await requireUser();return NextResponse.json(await runAsUser(u,async()=>({drafts:await listDrafts()})))}
 catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Draft GET failed",e);return NextResponse.json({error:"Draft service unavailable"},{status:503})}
}

export async function POST(req:Request){
 try{
  const u=await requireUser();
  if(!(await rateLimit("drafts:"+u.id,30,60)))return NextResponse.json({error:"Draft rate limit reached. Try again shortly."},{status:429});
  const b=await req.json().catch(()=>({}));
  if(!b.topic||typeof b.topic!=="string"||b.topic.trim().length===0||b.topic.length>4000)return NextResponse.json({error:"Topic is required and must be 1–4000 characters."},{status:400});
  if(!(await consumeUsage(u,"generations")))return NextResponse.json({error:"Daily generation limit reached for your plan."},{status:429});
  const drafts=buildDrafts(b.topic.trim());
  try{
   const saved=await runAsUser(u,()=>saveDrafts(drafts));
   return NextResponse.json({drafts:saved});
  }catch(e){
   const msg=e instanceof Error?e.message:"";
   await releaseUsage(u,"generations");
   console.error("Draft generation persistence failed",e);
   return NextResponse.json({error:"Could not save generated drafts."},{status:503});
  }
 }catch(e){
  if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});
  console.error("Draft POST failed",e);
  return NextResponse.json({error:"Draft service unavailable"},{status:503});
 }
}

export async function PATCH(req:Request){
 try{
  const u=await requireUser();
  const b=await req.json().catch(()=>({}));
  if(typeof b.id!=="string"||b.id.length>200||typeof b.status!=="string"||!["draft","review","scheduled"].includes(b.status))return NextResponse.json({error:"Invalid draft update"},{status:400});
  if(b.status==="scheduled"&&(typeof b.scheduledAt!=="string"||Number.isNaN(Date.parse(b.scheduledAt))))return NextResponse.json({error:"Scheduled posts require a valid scheduledAt"},{status:400});
  if(b.status==="scheduled"&&new Date(b.scheduledAt).getTime()<=Date.now())return NextResponse.json({error:"scheduledAt must be in the future"},{status:400});
  if(b.status!=="scheduled"&&b.scheduledAt!==undefined&&b.scheduledAt!==null&&Number.isNaN(Date.parse(b.scheduledAt)))return NextResponse.json({error:"Invalid scheduledAt"},{status:400});
  return NextResponse.json(await runAsUser(u,async()=>{const draft=await updateStatus(b.id,b.status,b.scheduledAt);return draft?{draft}:{error:"Draft not found"}}))
 }catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Draft PATCH failed",e);return NextResponse.json({error:"Draft service unavailable"},{status:503})}
}
