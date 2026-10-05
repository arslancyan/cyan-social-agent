import {NextResponse} from "next/server";
import {requireUser,rateLimit,consumeUsage,releaseUsage} from "@/lib/auth";
import {buildDrafts} from "@/lib/agent";

export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("queue:"+user.id,30,60)))return NextResponse.json({error:"Generation rate limit reached. Try again shortly."},{status:429});
  const body=await req.json().catch(()=>({}));
  const topic=typeof body.topic==="string"?body.topic.trim():"";
  if(!topic)return NextResponse.json({error:"Topic required"},{status:400});
  if(topic.length>4000)return NextResponse.json({error:"Topic is too long"},{status:400});
  if(!(await consumeUsage(user,"generations")))return NextResponse.json({error:"Daily generation limit reached for your plan."},{status:429});
  try{
   return NextResponse.json({drafts:buildDrafts(topic)});
  }catch(e){
   await releaseUsage(user,"generations");
   throw e;
  }
 }catch(e){
  if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});
  console.error("Queue API failed",e);
  return NextResponse.json({error:"Queue service unavailable"},{status:503});
 }
}
