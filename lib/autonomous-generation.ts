import {consumeUsage,releaseUsage} from "./auth";
import {buildBrainContext,inspectDraft} from "./agent";
import {createExperiment,generationStrategy,platformAdaptationPlans} from "./adaptive";
import {allocateAutonomousCalendar} from "./autonomous-calendar";
import {contentFatigue,recordEvent,saveDrafts} from "./store";
import {classifyContent} from "./content-intelligence";
import {StrategyDecision} from "./autonomy";
import {dbReady,pool} from "./db";
import {Draft,Platform} from "./types";

function clean(input:any[],decision:StrategyDecision):Draft[]{
 const allowed=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);
 return input.filter(x=>x&&allowed.has(x.platform)&&typeof x.content==="string"&&x.content.trim()).slice(0,4).map(x=>({
  id:x.id||crypto.randomUUID(),
  platform:x.platform as Platform,
  angle:typeof x.angle==="string"&&x.angle.trim()?x.angle.trim():decision.angle,
  content:x.content.trim().slice(0,10000),
  status:"review",
  trendId:decision.trend.id,
  mediaType:x.mediaType==="video"||x.mediaType==="image"?x.mediaType:undefined,
  mediaUrl:typeof x.mediaUrl==="string"&&/^https?:\/\//i.test(x.mediaUrl)?x.mediaUrl:undefined,
  ...(x.exploration?{exploration:true}:{} )
 }));
}

function parse(raw:string){
 const s=raw.trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();
 try{return JSON.parse(s)}catch{}
 const a=s.indexOf("[");const b=s.lastIndexOf("]");
 if(a>=0&&b>a)try{return JSON.parse(s.slice(a,b+1))}catch{}
 return [];
}

async function cooldown(){
 await dbReady();
 const r=await pool.query("SELECT 1 FROM cyan_events WHERE workspace_id=$1 AND type='autonomous_generation' AND created_at>=NOW()-INTERVAL '1 hour' LIMIT 1",[(await import("./auth")).workspaceId()]);
 return Boolean(r.rowCount);
}

export async function autonomousGenerate(user:any,decision:StrategyDecision){
 if(decision.priority<70||!decision.trend.sourceUrl)return {generated:0,scheduled:0,skipped:"Trend is below the autonomous threshold or has no source URL."};
 if(await cooldown())return {generated:0,scheduled:0,skipped:"Autonomous generation cooldown is active."};
 const capacity=await pool.query("SELECT COUNT(*)::int count FROM cyan_drafts WHERE workspace_id=$1 AND status IN ('review','scheduled','publishing')",[await import("./auth").then(x=>x.workspaceId())]);
 if(Number(capacity.rows[0]?.count||0)>=50)return {generated:0,scheduled:0,skipped:"Autonomous queue capacity guard is active."};
 const allowed=await consumeUsage(user,"generations");
 if(!allowed)return {generated:0,scheduled:0,skipped:"Daily generation limit reached."};
 const apiKey=process.env.OPENAI_API_KEY;
 try{
  const strategy=await generationStrategy();
  const adaptations=await platformAdaptationPlans();
  const context=buildBrainContext(decision.topic,[decision.platform,"X","TikTok","Instagram","Facebook"].filter((v,i,a)=>a.indexOf(v)===i) as Platform[]);
  let drafts:Draft[];
  if(!apiKey){
   drafts=clean([{platform:decision.platform,angle:decision.angle,content:decision.platform==="X"?decision.topic+" — what is the signal, what is verified, and what should creators watch next?":decision.platform==="TikTok"?"Hook: "+decision.topic+"\nContext: what is verified.\nTakeaway: what creators should watch next.":"Slide 1: "+decision.topic+"\nSlide 2: What is verified\nSlide 3: Why it matters\nSlide 4: What to watch next",mediaType:decision.platform==="TikTok"?"video":"image"}],decision);
  }else{
   const prompt=["You are CYAN running an autonomous social-content cycle.","Create up to 4 original drafts for this verified trend.","The trend source is provided; do not invent additional facts or sources.","Use 3 exploitation candidates and 1 exploration candidate. Optimize for the selected platform and learned features. Each candidate must be genuinely platform-native and follow the supplied adaptation plan, not copy the same content across platforms.","Never use guaranteed returns, insider claims, pump language, pressure to buy, or fabricated statistics/quotes.","Each item: platform, angle, content, optional mediaType, exploration. Set exploration=true on exactly one candidate.","Return ONLY JSON array.","Selected idea:",JSON.stringify(decision),"Adaptive strategy:",JSON.stringify(strategy),"Platform-native adaptation plans:",JSON.stringify(adaptations),"Brain:",JSON.stringify(context),"Verified source URL:",decision.trend.sourceUrl].join("\n");
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);let response:Response;try{response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6-luna",input:prompt}),signal:controller.signal});}finally{clearTimeout(timeout)}
   if(!response.ok)throw new Error("AI provider request failed");
   const data=await response.json();drafts=clean(parse(String(data.output_text||"")),decision);
  }
  if(!drafts.length)throw new Error("No valid autonomous drafts returned.");
  drafts=drafts.map(d=>({...d,features:classifyContent(d.content,d.platform,d.mediaType)}));
  const safe=drafts.filter(d=>{const i=inspectDraft(d.content,d.platform);return i.risk.risk==="low"&&i.quality.score>=60;});
  if(!safe.length){await releaseUsage(user,"generations");await recordEvent("autonomous_generation",{metadata:{source:apiKey?"ai":"fallback",trendId:decision.trend.id,draftCount:drafts.length,accepted:0,reason:"quality_or_risk_gate"}});return{generated:0,scheduled:0,skipped:"All autonomous candidates failed quality/risk checks."};}
  const fresh=await contentFatigue(safe);
  if(!fresh.length){await releaseUsage(user,"generations");return{generated:0,scheduled:0,skipped:"Content fatigue protection rejected all candidates."};}
  await saveDrafts(fresh);
  const experiment=await createExperiment(decision.topic,fresh);
  const explorationIds=new Set(fresh.filter((d:any)=>d.exploration).map(d=>d.id));
  const calendar=await allocateAutonomousCalendar(fresh,explorationIds);
  const scheduled=calendar.scheduled;
  await recordEvent("autonomous_generation",{metadata:{source:apiKey?"ai":"fallback",trendId:decision.trend.id,draftCount:fresh.length,scheduledCount:scheduled.length,experimentId:experiment?.id||null,priority:decision.priority,exploration:decision.exploration,allocation:calendar.allocation}});
  return{generated:fresh.length,scheduled:scheduled.length,scheduledDrafts:scheduled,allocation:calendar.allocation,experiment};
 }catch(e){
  await releaseUsage(user,"generations");
  throw e;
 }
}
