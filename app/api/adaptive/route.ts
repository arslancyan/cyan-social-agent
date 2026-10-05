import {NextResponse} from "next/server";
import {requireUser,runAsUser,rateLimit} from "@/lib/auth";
import {listDrafts} from "@/lib/store";
import {adaptivePlan,autoScheduleAdaptive,platformPerformanceScores,timeSlotScores,anglePerformanceScores,chooseBestDecision,generationStrategy} from "@/lib/adaptive";
import {performanceSources} from "@/lib/performance";
import {optimizationStatus,portfolioPlan} from "@/lib/self-optimization";
export const dynamic="force-dynamic";
export async function GET(){
 try{const user=await requireUser();return NextResponse.json(await runAsUser(user,async()=>{const drafts=(await listDrafts()).filter(d=>d.status==="draft"||d.status==="review");return {platforms:await platformPerformanceScores(),angles:await anglePerformanceScores(),drafts:await adaptivePlan(drafts),bestDecision:await chooseBestDecision(drafts),generationStrategy:await generationStrategy(),performanceSources:await performanceSources(),optimization:await optimizationStatus(),portfolio:await portfolioPlan()};}));}
 catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Adaptive scoring unavailable"},{status:503});}
}
export async function POST(req:Request){
 try{const user=await requireUser();if(!(await rateLimit("adaptive:"+user.id,30,60)))return NextResponse.json({error:"Adaptive rate limit reached."},{status:429});const body=await req.json().catch(()=>({}));const action=body.action;
 return NextResponse.json(await runAsUser(user,async()=>{if(action==="platforms")return {platforms:await platformPerformanceScores()};if(action==="slots"){const p=body.platform;if(!["X","TikTok","Instagram","Facebook"].includes(p))throw new Error("Invalid platform");return {platform:p,slots:await timeSlotScores(p)};}if(action==="schedule"){const ids=Array.isArray(body.draftIds)?body.draftIds.filter((x:any)=>typeof x==="string").slice(0,20):[];const mode=body.mode==="autonomous"?"autonomous":"smart";return autoScheduleAdaptive(ids,mode);}return {error:"Use action=platforms, slots, or schedule"};}));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:e instanceof Error?e.message:"Adaptive request failed"},{status:400});}
}