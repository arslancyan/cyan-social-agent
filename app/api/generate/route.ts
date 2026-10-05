import {NextResponse} from "next/server";
import {saveDrafts} from "@/lib/store";
import {consumeUsage,requireUser,runAsUser} from "@/lib/auth";

export async function POST(req:Request){
 const user=await requireUser();
 const allowed=await consumeUsage(user,"generations");
 if(!allowed)return NextResponse.json({error:"Daily generation limit reached for your plan."},{status:429});
 const {topic}=await req.json().catch(()=>({}));
 if(!topic||typeof topic!=="string"||!topic.trim()) return NextResponse.json({error:"Topic is required"},{status:400});
 let drafts:any[]=[];
 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey){
  drafts=[
   {id:crypto.randomUUID(),platform:"X",angle:"Hook",content:"What changed? Here’s the signal worth watching — and why it matters beyond the headline.",status:"review"},
   {id:crypto.randomUUID(),platform:"TikTok",angle:"Explainer",content:"30-second script: lead with the surprising fact, explain the context, then end with one useful takeaway.",status:"review"},
   {id:crypto.randomUUID(),platform:"Instagram",angle:"Carousel",content:"Slide 1: The story. Slide 2: What happened. Slide 3: Why it matters. Slide 4: What to watch next.",status:"review"}
  ];
 }else{
  const prompt=["You are CYAN, a responsible social media agent.","Create original platform-native drafts from the supplied topic.","Do not invent facts. Clearly flag unsupported claims.","Return strict JSON array with platform, angle, content.","Platforms: X, TikTok, Instagram.","Topic:",topic.trim()].join("\n");
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6-luna",input:prompt})});
  if(!response.ok) return NextResponse.json({error:"AI provider request failed"},{status:502});
  const data=await response.json(); const raw=data.output_text||"[]";
  try{drafts=JSON.parse(raw)}catch{drafts=[{platform:"X",angle:"Draft",content:raw}]}
  drafts=drafts.map((d:any)=>({...d,id:d.id||crypto.randomUUID(),status:d.status||"review"}));
 }
 await runAsUser(user,()=>saveDrafts(drafts));
 return NextResponse.json({drafts,source:apiKey?"ai":"fallback"});
}