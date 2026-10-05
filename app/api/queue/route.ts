import {NextResponse} from "next/server";
import {buildDrafts} from "@/lib/agent";
import {requireUser} from "@/lib/auth";

export async function POST(req:Request){
 try{
  await requireUser();
  const {topic}=await req.json().catch(()=>({}));
  if(typeof topic!=="string"||!topic.trim())return NextResponse.json({error:"Topic required"},{status:400});
  return NextResponse.json({drafts:buildDrafts(topic.trim())});
 }catch{return NextResponse.json({error:"Unauthorized"},{status:401})}
}