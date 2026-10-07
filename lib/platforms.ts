import {Draft,Platform} from "./types";
import {decryptSecret,encryptSecret} from "./crypto";
import {getConnectionSecret,updateConnectionTokens} from "./store";

export interface PublishResult { platform:Platform; ok:boolean; message:string; externalId?:string; pending?:boolean; retryable?:boolean; }

function metaVersion(){return process.env.META_GRAPH_VERSION||"v23.0";}
async function metaJson(path:string,token:string,init:RequestInit={}){
 const url=path.startsWith("http")?path:"https://graph.facebook.com/"+metaVersion()+path;
 const response=await fetchWithTimeout(url,{...init,headers:{...(init.headers||{}),authorization:"Bearer "+token}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data?.error)return {ok:false,data,message:data?.error?.message||"Meta Graph API rejected the request."};
 return {ok:true,data};
}
async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=15000){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  return await fetch(input,{...init,signal:controller.signal});
 }finally{clearTimeout(timer);}
}

async function refreshX(refreshToken:string){
 const clientId=process.env.X_CLIENT_ID;
 if(!clientId)throw new Error("X_CLIENT_ID is not configured");
 const body=new URLSearchParams({refresh_token:refreshToken,grant_type:"refresh_token",client_id:clientId});
 const response=await fetchWithTimeout("https://api.x.com/2/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
 if(!response.ok)throw new Error("X token refresh failed");
 return response.json();
}
async function postX(token:string,text:string){
 return fetchWithTimeout("https://api.x.com/2/tweets",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({text})});
}
async function publishX(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("X");
 if(!connection?.access_token_enc)return{platform:"X",ok:false,retryable:false,message:"X is not connected."};
 try{
  let token=await decryptSecret(connection.access_token_enc);
  let response=await postX(token,draft.content);
  if(response.status===401&&connection.refresh_token_enc){
   const refreshed=await refreshX(await decryptSecret(connection.refresh_token_enc));
   if(!refreshed.access_token)return{platform:"X",ok:false,message:"X refresh did not return an access token."};
   token=refreshed.access_token;
   await updateConnectionTokens("X",await encryptSecret(token),refreshed.refresh_token?await encryptSecret(refreshed.refresh_token):undefined);
   response=await postX(token,draft.content);
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return{platform:"X",ok:false,message:data?.detail||data?.title||"X API rejected the post."};
  const externalId=typeof data?.data?.id==="string"?data.data.id:"";
  if(!externalId)return{platform:"X",ok:false,message:"X API returned success without a post ID; publication state was not committed."};
  return{platform:"X",ok:true,message:"Published through the official X API.",externalId};
 }catch(e){return{platform:"X",ok:false,message:e instanceof Error?e.message:"X publishing failed."};}
}
async function refreshTikTok(refreshToken:string){
 const key=process.env.TIKTOK_CLIENT_KEY,secret=process.env.TIKTOK_CLIENT_SECRET;
 if(!key||!secret)throw new Error("TikTok OAuth credentials are not configured");
 const body=new URLSearchParams({client_key:key,client_secret:secret,grant_type:"refresh_token",refresh_token:refreshToken});
 const response=await fetchWithTimeout("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","cache-control":"no-cache"},body});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw new Error(data?.error?.message||"TikTok token refresh failed");
 return data;
}
async function publishTikTok(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("TikTok");
 if(!connection?.access_token_enc)return{platform:"TikTok",ok:false,message:"TikTok is not connected."};
 if(!draft.mediaUrl||draft.mediaType!=="video")return{platform:"TikTok",ok:false,retryable:false,message:"TikTok Direct Post needs a public video URL. Add a media URL to this scheduled post."};
 try{
  let token=await decryptSecret(connection.access_token_enc);
  const refresh=async()=>{
   if(!connection.refresh_token_enc)throw new Error("TikTok access token expired and no refresh token is available. Reconnect TikTok.");
   const refreshed=await refreshTikTok(await decryptSecret(connection.refresh_token_enc));
   token=refreshed.access_token;
   await updateConnectionTokens("TikTok",await encryptSecret(token),refreshed.refresh_token?await encryptSecret(refreshed.refresh_token):undefined);
  };
  if(draft.externalId){
   let statusResponse=await fetchWithTimeout("https://open.tiktokapis.com/v2/post/publish/status/fetch/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({publish_id:draft.externalId})});
   if(statusResponse.status===401){await refresh();statusResponse=await fetchWithTimeout("https://open.tiktokapis.com/v2/post/publish/status/fetch/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({publish_id:draft.externalId})});}
   const statusData=await statusResponse.json().catch(()=>({}));
   if(statusResponse.ok&&statusData?.error?.code==="ok"){
    const status=String(statusData?.data?.status||"");
    if(status==="PUBLISH_COMPLETE")return{platform:"TikTok",ok:true,message:"Published through the official TikTok Content Posting API.",externalId:draft.externalId};
    if(["FAILED","PUBLISH_FAILED"].includes(status))return{platform:"TikTok",ok:false,message:"TikTok reported that the publish failed.",externalId:draft.externalId};
   }
   return{platform:"TikTok",ok:false,pending:true,message:"TikTok is still processing the publish request.",externalId:draft.externalId};
  }
  let creator=await fetchWithTimeout("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:"{}"});
  if(creator.status===401){await refresh();creator=await fetchWithTimeout("https://open.tiktokapis.com/v2/post/publish/creator_info/query/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:"{}"});}
  const creatorData=await creator.json().catch(()=>({}));
  if(!creator.ok||creatorData?.error?.code!=="ok")return{platform:"TikTok",ok:false,message:creatorData?.error?.message||"TikTok creator information could not be queried."};
  const options=creatorData.data?.privacy_level_options||[];
  const privacy=process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL&&options.includes(process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL)?process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL:options.includes("PUBLIC_TO_EVERYONE")?"PUBLIC_TO_EVERYONE":options[0];
  if(!privacy)return{platform:"TikTok",ok:false,message:"TikTok returned no usable privacy level."};
  const init=await fetchWithTimeout("https://open.tiktokapis.com/v2/post/publish/video/init/",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({post_info:{title:draft.content.slice(0,2200),privacy_level:privacy,is_aigc:Boolean(process.env.TIKTOK_MARK_AI_GENERATED==="true")},source_info:{source:"PULL_FROM_URL",video_url:draft.mediaUrl}})});
  const data=await init.json().catch(()=>({}));
  if(!init.ok||data?.error?.code!=="ok")return{platform:"TikTok",ok:false,message:data?.error?.message||"TikTok rejected the video publish request."};
  const publishId=data?.data?.publish_id;
  if(!publishId)return{platform:"TikTok",ok:false,message:"TikTok did not return a publish ID."};
  return{platform:"TikTok",ok:false,pending:true,message:"TikTok accepted the publish request; status will be checked by the cloud worker.",externalId:publishId};
 }catch(e){return{platform:"TikTok",ok:false,message:e instanceof Error?e.message:"TikTok publishing failed."};}
}

async function publishInstagram(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("Instagram");
 if(!connection?.access_token_enc)return{platform:"Instagram",ok:false,retryable:false,message:"Instagram is not connected."};
 if(!draft.mediaUrl)return{platform:"Instagram",ok:false,retryable:false,message:"Instagram publishing requires a public media URL."};
 try{
  const token=await decryptSecret(connection.access_token_enc);
  const label=String(connection.account_label||"");
  const match=/^ig:([^:]+):/.exec(label);
  const igId=match?.[1]||"";
  if(!igId)return{platform:"Instagram",ok:false,retryable:false,message:"Instagram account metadata is missing. Reconnect Instagram."};
  if(draft.externalId){
   const status=await metaJson("/"+encodeURIComponent(draft.externalId)+"?fields=status_code",token);
   const code=String(status.data?.status_code||"");
   if(status.ok&&code==="FINISHED"){
    const published=await metaJson("/"+igId+"/media_publish",token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({creation_id:draft.externalId}).toString()});
    if(!published.ok||!published.data?.id)return{platform:"Instagram",ok:false,message:published.message||"Instagram publish failed after container processing."};
    return{platform:"Instagram",ok:true,message:"Published through the official Instagram Graph API.",externalId:String(published.data.id)};
   }
   if(status.ok&&["ERROR","EXPIRED"].includes(code))return{platform:"Instagram",ok:false,retryable:false,message:"Instagram media container failed."};
   return{platform:"Instagram",ok:false,pending:true,message:"Instagram media container is still processing.",externalId:draft.externalId};
  }
  const isVideo=draft.mediaType==="video";
  const params=new URLSearchParams({caption:draft.content,access_token:token});
  if(isVideo){params.set("media_type","REELS");params.set("video_url",draft.mediaUrl);}
  else{params.set("image_url",draft.mediaUrl);}
  const container=await metaJson("/"+igId+"/media",token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:params.toString()});
  if(!container.ok||!container.data?.id)return{platform:"Instagram",ok:false,message:container.message||"Instagram container creation failed."};
  const creationId=String(container.data.id);
  if(isVideo)return{platform:"Instagram",ok:false,pending:true,message:"Instagram accepted the media container; worker will poll and publish it.",externalId:creationId};
  const published=await metaJson("/"+igId+"/media_publish",token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({creation_id:creationId}).toString()});
  if(!published.ok||!published.data?.id)return{platform:"Instagram",ok:false,message:published.message||"Instagram publish failed."};
  return{platform:"Instagram",ok:true,message:"Published through the official Instagram Graph API.",externalId:String(published.data.id)};
 }catch(e){return{platform:"Instagram",ok:false,message:e instanceof Error?e.message:"Instagram publishing failed."};}
}
async function publishFacebook(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("Facebook");
 if(!connection?.access_token_enc)return{platform:"Facebook",ok:false,retryable:false,message:"Facebook Page is not connected."};
 if(!draft.mediaUrl)return{platform:"Facebook",ok:false,retryable:false,message:"Facebook publishing requires a public media URL."};
 try{
  const token=await decryptSecret(connection.access_token_enc);
  const me=await metaJson("/me?fields=id,name",token);
  if(!me.ok||!me.data?.id)return{platform:"Facebook",ok:false,retryable:false,message:me.message||"Facebook Page could not be resolved."};
  const pageId=String(me.data.id);
  if(draft.externalId)return{platform:"Facebook",ok:false,retryable:false,message:"Facebook publish state cannot be resumed safely without a verified post lookup."};
  const isVideo=draft.mediaType==="video";
  const params=new URLSearchParams({access_token:token});
  if(isVideo){params.set("file_url",draft.mediaUrl);params.set("description",draft.content);}
  else{params.set("url",draft.mediaUrl);params.set("caption",draft.content);}
  const endpoint=isVideo?"/"+pageId+"/videos":"/"+pageId+"/photos";
  const result=await metaJson(endpoint,token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:params.toString()});
  if(!result.ok||!result.data?.id)return{platform:"Facebook",ok:false,message:result.message||"Facebook publish failed."};
  return{platform:"Facebook",ok:true,message:"Published through the official Facebook Graph API.",externalId:String(result.data.id)};
}
catch(e){return{platform:"Facebook",ok:false,message:e instanceof Error?e.message:"Facebook publishing failed."};}
}

export async function publishDraft(draft:Draft):Promise<PublishResult>{
 if(draft.platform==="X")return publishX(draft);
 if(draft.platform==="TikTok")return publishTikTok(draft);
 if(draft.platform==="Instagram")return publishInstagram(draft);
 if(draft.platform==="Facebook")return publishFacebook(draft);
 return{platform:draft.platform,ok:false,retryable:false,message:"Connector not configured yet. Connect the official platform OAuth/API before publishing."};
}
