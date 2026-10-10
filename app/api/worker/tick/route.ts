import {NextRequest,NextResponse} from "next/server";
import {dbReady,pool,withWorkerLock} from "@/lib/db";
import {consumeUsage,listAgentWorkspaces,releaseUsage,runAsUser,workspaceId} from "@/lib/auth";
import {getConnectionSecret,getControl,heartbeat,recordEvent,recordWorker,recoverStalePublishing,saveTrends,dueDrafts,updateStatus,saveDrafts} from "@/lib/store";
import {publishDraft} from "@/lib/platforms";
import {scoreTrend} from "@/lib/scoring";
import {Draft,Trend} from "@/lib/types";
import {filterCryptoTopics,isCryptoContent} from "@/lib/crypto-topic";
import {monitorViralCryptoPosts} from "@/lib/viral-monitor";
import {POST_INTERVAL_HOURS,POST_INTERVAL_MS,VIRAL_SCAN_INTERVAL_MS,VIRAL_VIEWS_THRESHOLD,CONTENT_LANGUAGE} from "@/lib/crypto-agent-config";

export const dynamic="force-dynamic";
export const maxDuration=300;

async function authorized(req:NextRequest){
 const secret=process.env.CYAN_WORKER_SECRET||process.env.CRON_SECRET;
 if(secret&&req.headers.get("authorization")==="Bearer "+secret)return true;
 const oidc=req.headers.get("x-github-oidc-token");if(!oidc)return process.env.NODE_ENV!=="production";
 try{
  const {createRemoteJWKSet,jwtVerify}=await import("jose");
  const issuer="https://token.actions.githubusercontent.com";
  const jwks=createRemoteJWKSet(new URL(issuer+"/.well-known/jwks"));
  const audience=process.env.CYAN_WORKER_AUDIENCE||process.env.CYAN_APP_URL||"cyan-social-agent-worker";
  const {payload}=await jwtVerify(oidc,jwks,{issuer,audience});
  return payload.repository==="arslancyan/cyan-social-agent"&&payload.repository_owner==="arslancyan"&&["schedule","workflow_dispatch"].includes(String(payload.event_name||""))&&payload.ref==="refs/heads/main"&&payload.workflow_ref==="arslancyan/cyan-social-agent/.github/workflows/worker.yml@refs/heads/main";
 }catch{return false;}
}

async function pollCryptoNews(){
 const query=process.env.GDELT_TREND_QUERY||"(bitcoin OR ethereum OR solana OR DeFi OR memecoin OR \"meme coin\" OR NFT OR NFTs OR crypto) sourcelang:english";
 const url="https://api.gdeltproject.org/api/v2/doc/doc?query="+encodeURIComponent(query)+"&mode=artlist&format=json&maxrecords=50&timespan=1h";
 const response=await fetch(url,{cache:"no-store",headers:{accept:"application/json"},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error("Crypto news source returned "+response.status);
 const data=await response.json();
 const articles=filterCryptoTopics((Array.isArray(data.articles)?data.articles:[]).map((a:any)=>({title:String(a.title||""),summary:String(a.domain||""),raw:a}))).map((a:any)=>a.raw);
 const now=Date.now();
 const trends:Trend[]=articles.map((a:any,i:number)=>{
  const seen=String(a.seendate||"");
  const parsed=seen.length>=14?Date.parse(seen.slice(0,4)+"-"+seen.slice(4,6)+"-"+seen.slice(6,8)+"T"+seen.slice(8,10)+":"+seen.slice(10,12)+":"+seen.slice(12,14)+"Z"):now;
  const age=Math.max(0,(now-(Number.isNaN(parsed)?now:parsed))/3600000);
  const velocity=Math.max(0,Math.min(100,100-age*20));
  return{id:workspaceId()+"-gdelt-"+String(a.url||i),title:String(a.title||"Crypto news"),summary:String(a.domain||"Crypto news")+" · English crypto news",sourceUrl:typeof a.url==="string"?a.url:undefined,score:scoreTrend({velocity,engagement:50,freshness:Math.max(10,100-age*25),relevance:90,views:0}),velocity,relevance:90,createdAt:new Date().toISOString()};
 });
 await saveTrends(trends);
 return{fetched:trends.length,top:[...trends].sort((a,b)=>b.score-a.score)[0]||null};
}

async function createAutomaticCryptoPost(user:any,trend:Trend){
 if(!isCryptoContent(trend.title+" "+trend.summary))return{created:false,reason:"crypto_only_guard"};
 const connection=await getConnectionSecret("X");
 if(!connection?.access_token_enc)return{created:false,reason:"X_not_connected"};
 const recent=await pool.query("SELECT created_at FROM cyan_events WHERE workspace_id=$1 AND type='auto_post_attempt' ORDER BY created_at DESC LIMIT 1",[workspaceId()]);
 const lastAttempt=recent.rows[0]?.created_at?new Date(recent.rows[0].created_at).getTime():0;
 if(Date.now()-lastAttempt<POST_INTERVAL_MS)return{created:false,reason:"auto_post_cooldown"};
 const scheduled=await pool.query("SELECT 1 FROM cyan_drafts WHERE workspace_id=$1 AND status IN ('scheduled','publishing') LIMIT 1",[workspaceId()]);
 if(scheduled.rowCount)return{created:false,reason:"scheduled_post_already_queued"};
 if(!(await consumeUsage(user,"generations")))return{created:false,reason:"generation_limit"};
 let content="Crypto watch: "+trend.title.slice(0,140)+". What signal would confirm this trend next?";
 const apiKey=process.env.OPENAI_API_KEY;
 if(apiKey){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6-luna",input:["Write one concise English X post (under 260 characters) about this crypto news item.","Use only facts in the title/summary/source; do not invent statistics or price predictions.","No financial advice, no buy/sell pressure, no guaranteed returns. Ask a useful question or highlight what to watch next.","Return only the post text.","Title: "+trend.title,"Summary: "+trend.summary,"Source: "+(trend.sourceUrl||"not supplied")].join("\\n")}),signal:controller.signal});
   if(response.ok){const data=await response.json();const candidate=String(data.output_text||"").trim().replace(/^["']|["']$/g,"");if(candidate&&isCryptoContent(candidate+" "+trend.title))content=candidate.slice(0,280);}
  }catch{}finally{clearTimeout(timer);}
 }
 const draft:Draft={id:"auto-crypto-"+crypto.randomUUID(),platform:"X",angle:"Crypto auto post · English · 3-hour cadence",content,status:"scheduled",scheduledAt:new Date(Date.now()+60*1000).toISOString(),trendId:trend.id};
 try{await saveDrafts([draft]);await recordEvent("auto_post_attempt",{platform:"X",draftId:draft.id,metadata:{trendId:trend.id,sourceUrl:trend.sourceUrl||null,generatedBy:apiKey?"openai_or_fallback":"fallback"}});return{created:true,draftId:draft.id,scheduledAt:draft.scheduledAt};}
 catch(e){await releaseUsage(user,"generations");throw e;}
}

async function run(req:NextRequest){
 if(!(await authorized(req)))return NextResponse.json({error:"Unauthorized worker request"},{status:401});
 const locked=await withWorkerLock(async()=>{
  try{
   await dbReady();
   const workspaces=await listAgentWorkspaces();
   const summaries:any[]=[];
   for(const workspace of workspaces){
    const user=workspace.ownerUser;
    try{
     const result=await runAsUser(user,async()=>{
      const control=await getControl();
      await heartbeat();
      const recovered=await recoverStalePublishing();
      if(control.paused){await recordWorker(true,"Crypto worker paused.");return{paused:true,recovered,news:0,viral:null,published:0,nextPostAt:null};}
      let news=0;let newsTop:Trend|null=null;let newsError:string|undefined;
      try{const scan=await pollCryptoNews();news=scan.fetched;newsTop=scan.top;}catch(e){newsError=e instanceof Error?e.message:"Crypto news scan failed";}
      let viral:any={skipped:"Waiting for next viral scan window."};
      const recentScan=await pool.query("SELECT created_at FROM cyan_events WHERE workspace_id=$1 AND type='viral_reply_scan' ORDER BY created_at DESC LIMIT 1",[workspaceId()]);
      const lastScan=recentScan.rows[0]?.created_at?new Date(recentScan.rows[0].created_at).getTime():0;
      if(Date.now()-lastScan>=VIRAL_SCAN_INTERVAL_MS){
       try{viral=await monitorViralCryptoPosts();await recordEvent("viral_reply_scan",{platform:"X",metadata:{...viral}});}
       catch(e){viral={error:e instanceof Error?e.message:"Viral scan failed"};await recordEvent("viral_reply_scan",{platform:"X",metadata:{error:viral.error}});}
      }
      const lastPublish=await pool.query("SELECT created_at FROM cyan_events WHERE workspace_id=$1 AND type='publish' ORDER BY created_at DESC LIMIT 1",[workspaceId()]);
      const lastPublishedAt=lastPublish.rows[0]?.created_at?new Date(lastPublish.rows[0].created_at).getTime():0;
      const canPublish=Date.now()-lastPublishedAt>=POST_INTERVAL_MS;
      let due=canPublish?await dueDrafts():[];
      let autoPost:any={created:false,reason:canPublish?"no_crypto_trend":"posting_cooldown"};
      if(canPublish&&due.length===0&&newsTop){try{autoPost=await createAutomaticCryptoPost(user,newsTop);}catch(e){autoPost={created:false,error:e instanceof Error?e.message:"Automatic post generation failed"};}}
      let published=0;let blocked=0;let nextPostAt=canPublish?null:new Date(lastPublishedAt+POST_INTERVAL_MS).toISOString();
      for(const draft of due){
       if(!isCryptoContent(draft.content+" "+draft.angle)){
        await updateStatus(draft.id,"review",undefined,null);
        await recordEvent("publish_blocked",{platform:draft.platform,draftId:draft.id,metadata:{reason:"crypto_only_policy"}});
        blocked++;continue;
       }
       if(draft.replyToId&&!draft.replyOptInConfirmed){
        await updateStatus(draft.id,"review",undefined,null);
        await recordEvent("publish_blocked",{platform:"X",draftId:draft.id,externalId:draft.replyToId,metadata:{reason:"reply_requires_recipient_opt_in"}});
        blocked++;continue;
       }
       let outcome:Awaited<ReturnType<typeof publishDraft>>;
       try{outcome=await publishDraft(draft);}catch(e){outcome={platform:draft.platform,ok:false,message:e instanceof Error?e.message:"Publish failed"};}
       if(outcome.ok){
        await updateStatus(draft.id,"published",undefined,outcome.externalId);
        await recordEvent("publish",{platform:draft.platform,draftId:draft.id,externalId:outcome.externalId,metadata:{replyToId:draft.replyToId||null}});
        published++;
        break;
       }
       await updateStatus(draft.id,"review",undefined,null);
       await recordEvent("publish_failed",{platform:draft.platform,draftId:draft.id,metadata:{message:outcome.message}});
       blocked++;
       break;
      }
      const detail="crypto_news="+news+"; auto_post_created="+Boolean(autoPost.created)+"; viral_drafts="+Number(viral.draftsCreated||0)+"; published="+published+"; blocked="+blocked+"; interval_hours=3";
      await recordWorker(blocked===0,detail+(newsError?"; news_error="+newsError:""));
      return{paused:false,recovered,news,newsError,viral,autoPost,published,blocked,nextPostAt,postingIntervalHours:POST_INTERVAL_HOURS,viralThresholdViews:VIRAL_VIEWS_THRESHOLD,language:CONTENT_LANGUAGE};
     },workspace.id);
     summaries.push({workspace:workspace.id,workspaceName:workspace.name,...result});
    }catch(e){const message=e instanceof Error?e.message:"Workspace tick failed";summaries.push({workspace:workspace.id,error:message});try{await runAsUser(user,()=>recordWorker(false,message),workspace.id)}catch{}}
   }
   return NextResponse.json({ok:true,workspaces:summaries.length,summaries,heartbeat:new Date().toISOString()});
  }catch(e){const message=e instanceof Error?e.message:"Worker tick failed";return NextResponse.json({error:message,code:message.includes("Database connection is not configured")?"DATABASE_NOT_CONFIGURED":"WORKER_TICK_FAILED"},{status:message.includes("Database connection is not configured")?503:500});}
 });
 if(locked===null)return NextResponse.json({ok:true,skipped:true,reason:"worker_already_running"});
 return locked;
}
export async function GET(req:NextRequest){return run(req);}
export async function POST(req:NextRequest){return run(req);}
