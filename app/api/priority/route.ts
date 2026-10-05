import {NextRequest,NextResponse} from "next/server";
import {priorityDecision,scoreTrend} from "@/lib/scoring";
import {reprioritizeSchedule} from "@/lib/store";
export async function POST(req:NextRequest){
 try{
  const body=await req.json();
  const score=body.score??scoreTrend({velocity:body.velocity??0,engagement:body.engagement??0,freshness:body.freshness??0,relevance:body.relevance??0,views:body.views??0});
  const decision=priorityDecision(score,body.views??0,body.mode??"smart");
  const result=decision.interrupt?reprioritizeSchedule(body.trendId??"viral",score):{changed:[],message:"Calendar preserved."};
  return NextResponse.json({decision,result});
 }catch{return NextResponse.json({error:"Invalid priority request"},{status:400});}
}
