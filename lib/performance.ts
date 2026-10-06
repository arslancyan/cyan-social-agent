import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {decryptSecret,encryptSecret} from "./crypto";
import {getConnectionSecret,recordEvent,updateConnectionTokens} from "./store";
import {Draft,Platform} from "./types";

type Metrics={views?:number;impressions?:number;likes?:number;comments?:number;shares?:number;clicks?:number;saves?:number;};
export type PerformanceSource={platform:Platform;connected:boolean;supported:boolean;status:"live"|"not_connected"|"not_supported";message:string;lastSyncedAt?:string;};

function attributionWindow(createdAt:string){const age=(Date.now()-new Date(createdAt).getTime())/3600000;if(age<1)return null;if(age<6)return "1h";if(age<24)return "6h";if(age<72)return "24h";return "72h";}
function safeMetric(v:any){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.min(10000000000,Math.floor(n)):0;}
async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=12000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}}

async function refreshTikTok(refreshToken:string){
 const key=process.env.TIKTOK_CLIENT_KEY,secret=process.env.TIKTOK_CLIENT_SECRET;
 if(!key||!secret)throw new Error("TikTok OAuth credentials are not configured");
 const body=new URLSearchParams({client_key:key,client_secret:secret,grant_type:"refresh_token",refresh_token:refreshToken});
 const response=await fetchWithTimeout("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","cache-control":"no-cache"},body});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw new Error(data?.error?.message||"TikTok token refresh failed");
 return data;
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

async function syncTikTok(draft:Draft):Promise<{ok:boolean;message:string;metrics?:Metrics}>{
 if(!draft.externalId)return{ok:false,message:"No external TikTok video ID."};
 const connection=await getConnectionSecret("TikTok");if(!connection?.access_token_enc)return{ok:false,message:"TikTok is not connected."};
 try{
  let token=await decryptSecret(connection.access_token_enc);
  const request=()=>fetchWithTimeout("https://open.tiktokapis.com/v2/video/query/?fields=id,create_time,like_count,comment_count,share_count,view_count",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({filters:{video_ids:[draft.externalId]}})});
  let response=await request();
  if(response.status===401&&connection.refresh_token_enc){
   const refreshed=await refreshTikTok(await decryptSecret(connection.refresh_token_enc));
   token=refreshed.access_token;
   await updateConnectionTokens("TikTok",await encryptSecret(token),refreshed.refresh_token?await encryptSecret(refreshed.refresh_token):undefined);
   response=await request();
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.error?.code&&data.error.code!=="ok")return{ok:false,message:data?.error?.message||"TikTok metrics request failed."};
  const v=data?.data?.videos?.[0];
  if(!v)return{ok:false,message:"TikTok returned no metrics for this video. Ensure the connected account has video.list permission."};
  const views=safeMetric(v.view_count);
  return{ok:true,message:"TikTok performance metrics synchronized.",metrics:{views,impressions:views,likes:safeMetric(v.like_count),comments:safeMetric(v.comment_count),shares:safeMetric(v.share_count)}};
 }catch(e){return{ok:false,message:e instanceof Error?e.message:"TikTok metrics sync failed."};}
}

export async function performanceSources():Promise<PerformanceSource[]>{
 await dbReady();
 const connections=await pool.query("SELECT platform,status,connected_at FROM cyan_connections WHERE workspace_id=$1",[workspaceId()]);
 const synced=await pool.query("SELECT platform,MAX(created_at) AS last_synced_at FROM cyan_events WHERE workspace_id=$1 AND type='performance_snapshot' GROUP BY platform",[workspaceId()]);
 const lastBy=new Map(synced.rows.map((r:any)=>[String(r.platform),r.last_synced_at]));
 const by=new Map(connections.rows.map((r:any)=>[String(r.platform),r]));
 const platforms:Platform[]=["X","TikTok","Instagram","Facebook"];
 return platforms.map(platform=>{
  const c=by.get(platform);
  if(!c||c.status!=="connected")return{platform,connected:false,supported:platform==="X"||platform==="TikTok",status:"not_connected",message:platform==="Instagram"||platform==="Facebook"?"Official performance connector is not enabled yet.":"Connect the official account to begin performance learning.",lastSyncedAt:lastBy.get(platform)?new Date(lastBy.get(platform)).toISOString():undefined};
  return{platform,connected:true,supported:platform==="X"||platform==="TikTok",status:platform==="X"||platform==="TikTok"?"live":"not_supported",message:platform==="X"||platform==="TikTok"?"Official API performance sync is enabled.":"Account is connected, but official performance sync is not enabled yet.",lastSyncedAt:lastBy.get(platform)?new Date(lastBy.get(platform)).toISOString():undefined};
 });
}

export async function syncPublishedPerformance(drafts:Draft[]){
 await dbReady();const results:any[]=[];
 for(const draft of drafts){
  if(!draft.externalId||draft.status!=="published")continue;
  const publishedAt=await pool.query("SELECT created_at FROM cyan_events WHERE workspace_id=$1 AND type='publish' AND draft_id=$2 ORDER BY created_at ASC LIMIT 1",[workspaceId(),draft.id]);
  const window=attributionWindow(publishedAt.rows[0]?.created_at||new Date().toISOString());
  if(!window)continue;
  const recent=await pool.query("SELECT id FROM cyan_events WHERE workspace_id=$1 AND type='performance_snapshot' AND draft_id=$2 AND metadata->>'window'=$3 LIMIT 1",[workspaceId(),draft.id,window]);
  if(recent.rows.length)continue;
  let result:{ok:boolean;message:string;metrics?:Metrics}={ok:false,message:"Unsupported platform."};
  if(draft.platform==="X")result=await syncX(draft);
  else if(draft.platform==="TikTok")result=await syncTikTok(draft);
  if(!result.ok){results.push({draftId:draft.id,platform:draft.platform,ok:false,message:result.message});continue;}
  const prediction=await pool.query("SELECT metadata FROM cyan_events WHERE workspace_id=$1 AND draft_id=$2 AND type='adaptive_decision' AND metadata->>'recommendedAt' IS NOT NULL ORDER BY created_at DESC LIMIT 1",[workspaceId(),draft.id]);
  const expectedOutcome=prediction.rows[0]?.metadata?.expectedOutcome;
  const predictionSource=Number.isFinite(Number(expectedOutcome))?"adaptive_decision":undefined;
  await recordEvent("performance_snapshot",{platform:draft.platform,draftId:draft.id,externalId:draft.externalId,metadata:{...result.metrics,window,syncedAt:new Date().toISOString(),source:"official_api",schemaVersion:1,...(predictionSource?{expectedOutcome:Number(expectedOutcome),predictionSource}: {})}});
  results.push({draftId:draft.id,platform:draft.platform,ok:true,metrics:result.metrics});
 }
 return results;
}