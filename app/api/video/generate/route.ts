import {NextResponse} from "next/server";
import {requireUser,runAsUser,requireWorkspaceRole,consumeUsage,releaseUsage,rateLimit} from "@/lib/auth";
import {generateHiggsfieldVideo,higgsfieldConfigured} from "@/lib/higgsfield";
import {recordEvent,saveDrafts} from "@/lib/store";

export const dynamic="force-dynamic";
export const maxDuration=150;

export async function POST(req:Request){
 try{
  const user=await requireUser();
  await runAsUser(user,()=>requireWorkspaceRole(user.id,["owner","admin","editor"]));
  if(!(await rateLimit("video:"+user.id,10,60)))return NextResponse.json({error:"Video generation rate limit reached."},{status:429});
  if(!higgsfieldConfigured())return NextResponse.json({error:"Higgsfield is not configured. Add HF_API_KEY to the server environment."},{status:503});
  const b=await req.json().catch(()=>({}));
  const prompt=typeof b.prompt==="string"?b.prompt.trim():"";
  const platform=typeof b.platform==="string"&&["X","TikTok","Instagram","Facebook"].includes(b.platform)?b.platform:"TikTok";
  const draftId=typeof b.draftId==="string"?b.draftId:"";
  if(!prompt||prompt.length>5000)return NextResponse.json({error:"A video prompt is required."},{status:400});
  if(!(await consumeUsage(user,"generations")))return NextResponse.json({error:"Daily generation limit reached."},{status:429});
  try{
   const result=await generateHiggsfieldVideo({prompt,model:typeof b.model==="string"?b.model:undefined,duration:Number.isFinite(Number(b.duration))?Number(b.duration):5,aspectRatio:platform==="TikTok"||platform==="Instagram"?"9:16":"16:9",resolution:b.resolution==="1080p"?"1080p":"720p",generateAudio:b.generateAudio!==false});
   if(draftId)await runAsUser(user,()=>saveDrafts([{id:draftId,platform,angle:"AI video",content:typeof b.content==="string"?b.content:prompt,status:"review",mediaType:"video",mediaUrl:result.url}]));
   await runAsUser(user,()=>recordEvent("video_generation",{platform,draftId:draftId||undefined,metadata:{provider:"higgsfield",model:typeof b.model==="string"?b.model:process.env.HF_VIDEO_MODEL||"bytedance/seedance-2.0/text-to-video",duration:Number(b.duration)||5}}));
   return NextResponse.json({ok:true,url:result.url,status:result.status,provider:"higgsfield"});
  }catch(e){
   await releaseUsage(user,"generations");
   throw e;
  }
 }catch(e){
  const m=e instanceof Error?e.message:"Video generation failed";
  if(m==="UNAUTHENTICATED")return NextResponse.json({error:"Please sign in again."},{status:401});
  if(m==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  console.error("Higgsfield video generation failed",e);
  return NextResponse.json({error:m},{status:503});
 }
}
