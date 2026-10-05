import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {decryptSecret,encryptSecret} from "./crypto";
import {getConnectionSecret,recordEvent,updateConnectionTokens} from "./store";
import {Draft,Platform} from "./types";

type Metrics={views?:number;impressions?:number;likes?:number;comments?:number;shares?:number;clicks?:number;};
function attributionWindow(createdAt:string){const age=(Date.now()-new Date(createdAt).getTime())/3600000;if(age<1)return null;if(age<6)return "1h";if(age<24)return "6h";if(age<72)return "24h";return "72h";}

function safeMetric(v:any){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.min(10000000000,Math.floor(n)):0;}

async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=12000){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}
}

async function syncX(draft:Draft):Promise<{ok:boolean;message:string;metrics?:Metrics}>{
 if(!draft.externalId)return{ok:false,message:"No external X post ID."};
 const connection=await getConnectionSecret("X");if(!connection?.access_token_enc)return{ok:false,message:"X is not connected."};
 try{
  let token=await decryptSecret(connection.access_token_enc);
  const request=()=>fetchWithTimeout("https://api.x.com/2/tweets?ids="+encodeURIComponent(draft.externalId!)+"&tweet.fields=created_at,public_metrics",{headers:{authorization:"Bearer "+token,accept:"application/json"}});
  let response=await request();
  if(response.status===401&&connection.refresh_token_enc){
   const body=new URLSearchParams({refresh_token:await decryptSecret(connection.refresh_token_enc),grant_type:"refresh_token",client_id:process.env.X_CLIENT_ID||""});
   const refreshed=await fetchWithTimeout("https://api.x.com/2/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
   const rd=await refreshed.json().catch(()=>({}));
   if(refreshed.ok&&rd.access_token){token=rd.access_token;await updateConnectionTokens("X",await encryptSecret(token),rd.refresh_token?await encryptSecret(rd.refresh_token):undefined);response=await request();}
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return{ok:false,message:data?.detail||data?.title||"X metrics request failed."};
  const m=data?.data?.[0]?.public_metrics;
  if(!m)return{ok:false,message:"X returned no public metrics for this post."};
  return{ok:true,message:"X performance metrics synchronized.",metrics:{impressions:safeMetric(m.impression_count),likes:safeMetric(m.like_count),comments:safeMetric(m.reply_count),shares:safeMetric(m.retweet_count)+safeMetric(m.quote_count),clicks:safeMetric(m.url_link_clicks),views:safeMetric(m.impression_count)}};
 }catch(e){return{ok:false,message:e instanceof Error?e.message:"X metrics sync failed."};}
}

export async function syncPublishedPerformance(drafts:Draft[]){
 await dbReady();const results:any[]=[];
 for(const draft of drafts){
  if(!draft.externalId||draft.status!=="published")continue;
  const window=attributionWindow(draft.scheduledAt||new Date().toISOString());
  if(!window)continue;
  const recent=await pool.query("SELECT id FROM cyan_events WHERE workspace_id=$1 AND type='performance_snapshot' AND draft_id=$2 AND metadata->>'window'=$3 LIMIT 1",[workspaceId(),draft.id,window]);
  if(recent.rows.length)continue;
  let result:{ok:boolean;message:string;metrics?:Metrics}={ok:false,message:"Unsupported platform."};
  if(draft.platform==="X")result=await syncX(draft);
  if(!result.ok){results.push({draftId:draft.id,platform:draft.platform,ok:false,message:result.message});continue;}
  await recordEvent("performance_snapshot",{platform:draft.platform,draftId:draft.id,externalId:draft.externalId,metadata:{...result.metrics,window,syncedAt:new Date().toISOString()}});
  results.push({draftId:draft.id,platform:draft.platform,ok:true,metrics:result.metrics});
 }
 return results;
}
