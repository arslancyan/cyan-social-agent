import {NextRequest,NextResponse} from "next/server";
import {dueDrafts,getControl,heartbeat,latestTrends,recordWorker,reprioritizeSchedule,saveTrends,updateStatus} from "@/lib/store";
import {publishDraft} from "@/lib/platforms";
import {scoreTrend} from "@/lib/scoring";
import {Trend} from "@/lib/types";

export const dynamic="force-dynamic";

function authorized(req:NextRequest){
 const secret=process.env.CYAN_WORKER_SECRET||process.env.CRON_SECRET;
 if(!secret) return process.env.NODE_ENV!=="production";
 return req.headers.get("authorization")==="Bearer "+secret;
}

async function pollTrends(){
 const url=process.env.TREND_SOURCE_URL;
 if(!url) return {fetched:0,top:null as Trend|null};
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(url,{headers:{"accept":"application/json"},cache:"no-store",signal:controller.signal});
  if(!response.ok) throw new Error("Trend source returned "+response.status);
  const data=await response.json();
  const items=Array.isArray(data)?data:data.trends;
  if(!Array.isArray(items)) throw new Error("Trend source must return an array or {trends:[]}");
  const trends:Trend[]=items.slice(0,50).filter((x:any)=>x&&typeof x.title==="string"&&x.title.trim()).map((x:any,i:number)=>{
   const score=scoreTrend({velocity:Number(x.velocity||0),engagement:Number(x.engagement||0),freshness:Number(x.freshness||0),relevance:Number(x.relevance||0),views:Number(x.views||0)});
   return {id:String(x.id||`${Date.now()}-${i}`),title:x.title.trim(),summary:typeof x.summary==="string"?x.summary:"",sourceUrl:typeof x.sourceUrl==="string"?x.sourceUrl:typeof x.source_url==="string"?x.source_url:undefined,score,views:Number(x.views||0),velocity:Number(x.velocity||0),relevance:Number(x.relevance||0),createdAt:new Date().toISOString()};
  });
  await saveTrends(trends);
  const top=[...trends].sort((a,b)=>b.score-a.score)[0]||null;
  return {fetched:trends.length,top};
 }finally{clearTimeout(timeout)}
}

async function run(req:NextRequest){
 if(!authorized(req)) return NextResponse.json({error:"Unauthorized worker request"},{status:401});
 try{
  const control=await getControl();
  await heartbeat();
  if(control.paused){
   await recordWorker(true,"Agent paused; scheduler and trend tick skipped.");
   return NextResponse.json({ok:true,paused:true,processed:0});
  }

  let trendResult={fetched:0,top:null as Trend|null,interrupted:0};
  if(process.env.TREND_SOURCE_URL){
   try{
    const polled=await pollTrends();
    trendResult.fetched=polled.fetched;
    trendResult.top=polled.top;
    if(polled.top&&control.mode!=="conservative"&&polled.top.score>=85){
     const result=await reprioritizeSchedule(polled.top.id,polled.top.score);
     trendResult.interrupted=result.changed.length;
    }
   }catch(e){
    trendResult.top=null;
   }
  }

  const due=await dueDrafts();
  const results=[];
  for(const draft of due){
   const result=await publishDraft(draft);
   if(result.ok) await updateStatus(draft.id,"published");
   else await updateStatus(draft.id,"scheduled",new Date(Date.now()+15*60*1000).toISOString());
   results.push({id:draft.id,platform:draft.platform,ok:result.ok,message:result.message});
  }
  const processed=results.filter(r=>r.ok).length;
  const blocked=results.filter(r=>!r.ok).length;
  await recordWorker(blocked===0,"Trends="+trendResult.fetched+"; due="+due.length+"; published="+processed+"; blocked="+blocked+"; interrupted="+trendResult.interrupted);
  return NextResponse.json({ok:true,paused:false,processed,blocked,trend:trendResult,topTrends:(await latestTrends(5)),results,heartbeat:new Date().toISOString()});
 }catch(e){
  const message=e instanceof Error?e.message:"Worker tick failed";
  try{await recordWorker(false,message)}catch{}
  return NextResponse.json({error:message},{status:500});
 }
}

export async function GET(req:NextRequest){return run(req);}
export async function POST(req:NextRequest){return run(req);}
