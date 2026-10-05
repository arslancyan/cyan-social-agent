import {NextResponse} from "next/server";
import {saveDrafts,latestTrends,learningSignals,recordEvent,contentFatigue} from "@/lib/store";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";
import {Platform} from "@/lib/types";
import {buildBrainContext,inspectDraft} from "@/lib/agent";
import {adaptivePlan,generationStrategy,createExperiment,platformAdaptationPlans} from "@/lib/adaptive";
function cleanDrafts(input:any[]):any[]{const allowed=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);return input.filter(x=>x&&allowed.has(x.platform)&&typeof x.content==="string"&&x.content.trim()).slice(0,6).map(x=>({id:x.id||crypto.randomUUID(),platform:x.platform,angle:typeof x.angle==="string"&&x.angle.trim()?x.angle.trim():"Draft",content:x.content.trim().slice(0,10000),status:"review"}));}
function parseModelOutput(raw:string){const trimmed=raw.trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();try{return JSON.parse(trimmed)}catch{}const start=trimmed.indexOf("[");const end=trimmed.lastIndexOf("]");if(start>=0&&end>start){try{return JSON.parse(trimmed.slice(start,end+1))}catch{}}return []}
export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("generate:"+user.id,30,60)))return NextResponse.json({error:"Generation rate limit reached. Try again shortly."},{status:429});
  const body=await req.json().catch(()=>({}));
  const topic=typeof body.topic==="string"?body.topic.trim():"";
  const trendId=typeof body.trendId==="string"&&body.trendId.length<=200?body.trendId:"";
  if(!topic||topic.length>4000)return NextResponse.json({error:"Topic is required and must be 1–4000 characters."},{status:400});
  const allowed=await consumeUsage(user,"generations");
  if(!allowed)return NextResponse.json({error:"Daily generation limit reached for your plan."},{status:429});
  let drafts:any[]=[];
  let trend:any=null;
  await runAsUser(user,async()=>{if(trendId){const trends=await latestTrends(20);trend=trends.find(t=>t.id===trendId)||null;}});
  const context=buildBrainContext(topic);
  const learning=await runAsUser(user,()=>learningSignals());
  const strategy=await runAsUser(user,()=>generationStrategy());
  const adaptations=await runAsUser(user,()=>platformAdaptationPlans());
  const trendContext=trend?["Verified trend signal:",trend.title,trend.summary,trend.sourceUrl?"Source: "+trend.sourceUrl:"","Score: "+trend.score].filter(Boolean).join("\n"):"No verified trend signal was supplied.";
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){
   drafts=cleanDrafts([
    {platform:"X",angle:"Hook",content:"What changed? Here’s the signal worth watching — and why it matters beyond the headline."},
    {platform:"TikTok",angle:"Explainer",content:"30-second script: lead with the surprising fact, explain the context, then end with one useful takeaway."},
    {platform:"Instagram",angle:"Carousel",content:"Slide 1: The story. Slide 2: What happened. Slide 3: Why it matters. Slide 4: What to watch next."}
   ]);
  }else{
   const prompt=["You are CYAN, a responsible social media agent.","Create original platform-native drafts from the supplied topic and verified signal.","Never invent facts, statistics, quotes, events or sources.","Separate verified facts from interpretation.","Avoid guaranteed returns, insider claims, pump language, or pressure to buy.","Return ONLY a JSON array. No markdown fences.","Each item must contain platform, angle, content, and optional mediaType. Generate 4 candidates: 3 should exploit the strongest learned patterns; 1 should deliberately explore an under-tested platform, angle, hook, format or CTA.","Platforms: X, TikTok, Instagram.","CYAN workflow:",context.workflow,"Platform guidance:",JSON.stringify(context.platforms),"Recent workspace learning signals (use only as optimization hints, never as facts):",JSON.stringify(learning),"Adaptive generation strategy:",JSON.stringify(strategy),"Exploration rule: allocate approximately 75% exploitation and 25% exploration. Use topFeatures as optimization hints, but do not copy prior posts.","Safety:",context.safety,"Topic:",topic,trendContext.trim()].join("\n");
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})});
   if(!response.ok){await releaseUsage(user,"generations");return NextResponse.json({error:"AI provider request failed"},{status:502});}
   const data=await response.json();
   drafts=cleanDrafts(parseModelOutput(String(data.output_text||"")));
   if(drafts.length===0){await releaseUsage(user,"generations");return NextResponse.json({error:"AI returned no valid drafts. Try a more specific topic."},{status:502});}
  }
  try{
   const freshDrafts=await runAsUser(user,()=>contentFatigue(drafts));
   if(freshDrafts.length>0)drafts=freshDrafts;
   await runAsUser(user,()=>saveDrafts(drafts));
  }catch(e){
   await releaseUsage(user,"generations");
   throw e;
  }
  const experiment=await runAsUser(user,()=>createExperiment(topic,drafts));
  const insights=drafts.map(d=>({id:d.id,platform:d.platform,analysis:inspectDraft(d.content,d.platform),features:d.features}));
  const adaptive=await runAsUser(user,()=>adaptivePlan(drafts));
  const chosen=adaptive[0]||null;
  if(chosen)await runAsUser(user,()=>recordEvent("adaptive_decision",{platform:chosen.platform,draftId:chosen.draftId,metadata:{angle:chosen.angle,score:chosen.score,confidence:chosen.confidence,platformScore:chosen.platformScore,angleScore:chosen.angleScore,timeScore:chosen.timeScore,recommendedAt:chosen.recommendedAt}}));
  await runAsUser(user,()=>recordEvent("generation",{metadata:{source:apiKey?"ai":"fallback",trendId:trend?.id||null,draftCount:drafts.length,quality:insights.map((x:any)=>x.analysis.quality.score),risk:insights.map((x:any)=>x.analysis.risk.risk)}}));
  return NextResponse.json({drafts,insights,experiment,adaptive,strategy,source:apiKey?"ai":"fallback",trend:trend?{id:trend.id,title:trend.title,score:trend.score}:null,learning});
 }catch(e){
  const message=e instanceof Error?e.message:"Generation failed";
  if(message==="UNAUTHENTICATED")return NextResponse.json({error:"Please sign in again."},{status:401});
  console.error("Generation failed",e);
  return NextResponse.json({error:"Generation service is temporarily unavailable."},{status:503});
 }
}