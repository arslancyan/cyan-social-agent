import {Draft,Platform} from "./types";
import {decryptSecret,encryptSecret} from "./crypto";
import {getConnectionSecret,updateConnectionTokens} from "./store";

export interface PublishResult { platform:Platform; ok:boolean; message:string; externalId?:string; pending?:boolean; }

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
 if(!connection?.access_token_enc)return{platform:"X",ok:false,message:"X is not connected."};
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
 if(!draft.mediaUrl||draft.mediaType!=="video")return{platform:"TikTok",ok:false,message:"TikTok Direct Post needs a public video URL. Add a media URL to this scheduled post."};
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
export async function publishDraft(draft:Draft):Promise<PublishResult>{
 if(draft.platform==="X")return publishX(draft);
 if(draft.platform==="TikTok")return publishTikTok(draft);
 return{platform:draft.platform,ok:false,message:"Connector not configured yet. Connect the official platform OAuth/API before publishing."};
}
