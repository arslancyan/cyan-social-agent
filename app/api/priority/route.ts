import {NextRequest,NextResponse} from "next/server";import {requireUser,runAsUser} from "@/lib/auth";
import {priorityDecision,scoreTrend} from "@/lib/scoring";
import {reprioritizeSchedule} from "@/lib/store";

export async function POST(req:NextRequest){
 try{
  const user=await requireUser();const body=await req.json();
  const score=Number(body.score??scoreTrend({velocity:Number(body.velocity??0),engagement:Number(body.engagement??0),freshness:Number(body.freshness??0),relevance:Number(body.relevance??0),views:Number(body.views??0)}));
  const decision=priorityDecision(score,Number(body.views??0),body.mode??"smart");
  const result=decision.interrupt?await runAsUser(user,()=>reprioritizeSchedule(body.trendId??"viral",score)):{changed:[],message:"Calendar preserved."};
  return NextResponse.json({decision,result});
 }catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Priority API failed",e);return NextResponse.json({error:"Priority service unavailable"},{status:503});}
}