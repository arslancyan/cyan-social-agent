import {NextResponse} from "next/server";
import {saveDrafts} from "@/lib/store";
import {consumeUsage,releaseUsage,rateLimit,requireUser,runAsUser} from "@/lib/auth";
import {Platform} from "@/lib/types";
function cleanDrafts(input:any[]):any[]{const allowed=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);return input.filter(x=>x&&allowed.has(x.platform)&&typeof x.content==="string"&&x.content.trim()).slice(0,6).map(x=>({id:x.id||crypto.randomUUID(),platform:x.platform,angle:typeof x.angle==="string"&&x.angle.trim()?x.angle.trim():"Draft",content:x.content.trim().slice(0,10000),status:"review"}));}
function parseModelOutput(raw:string){const trimmed=raw.trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();try{return JSON.parse(trimmed)}catch{}const start=trimmed.indexOf("[");const end=trimmed.lastIndexOf("]");if(start>=0&&end>start){try{return JSON.parse(trimmed.slice(start,end+1))}catch{}}return []}
export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("generate:"+user.id,30,60)))return NextResponse.json({error:"Generation rate limit reached. Try again shortly."},{status:429});
  const {topic}=await req.json().catch(()=>({}));
  if(!topic||typeof topic!=="string"||!topic.trim()||topic.length>4000)return NextResponse.json({error:"Topic is required and must be 1–4000 characters."},{status:400});
  const allowed=await consumeUsage(user,"generations");
  if(!allowed)return NextResponse.json({error:"Daily generation limit reached for your plan."},{status:429});
  let drafts:any[]=[];
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){
   drafts=cleanDrafts([
    {platform:"X",angle:"Hook",content:"What changed? Here’s the signal worth watching — and why it matters beyond the headline."},
    {platform:"TikTok",angle:"Explainer",content:"30-second script: lead with the surprising fact, explain the context, then end with one useful takeaway."},
    {platform:"Instagram",angle:"Carousel",content:"Slide 1: The story. Slide 2: What happened. Slide 3: Why it matters. Slide 4: What to watch next."}
   ]);
  }else{
   const prompt=["You are CYAN, a responsible social media agent.","Create original platform-native drafts from the supplied topic.","Do not invent facts. Clearly flag unsupported claims.","Return ONLY a JSON array. No markdown fences.","Each item must contain platform, angle, content.","Platforms: X, TikTok, Instagram.","Topic:",topic.trim()].join("\n");
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input:prompt})});
   if(!response.ok){await releaseUsage(user,"generations");return NextResponse.json({error:"AI provider request failed"},{status:502});}
   const data=await response.json();
   drafts=cleanDrafts(parseModelOutput(String(data.output_text||"")));
   if(drafts.length===0){await releaseUsage(user,"generations");return NextResponse.json({error:"AI returned no valid drafts. Try a more specific topic."},{status:502});}
  }
  await runAsUser(user,()=>saveDrafts(drafts));
  return NextResponse.json({drafts,source:apiKey?"ai":"fallback"});
 }catch(e){
  const message=e instanceof Error?e.message:"Generation failed";
  if(message==="UNAUTHENTICATED")return NextResponse.json({error:"Please sign in again."},{status:401});
  console.error("Generation failed",e);
  return NextResponse.json({error:"Generation service is temporarily unavailable."},{status:503});
 }
}