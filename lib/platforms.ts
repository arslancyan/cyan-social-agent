import {Draft,Platform} from "./types";
import {decryptSecret,encryptSecret} from "./crypto";
import {getConnectionSecret,updateConnectionTokens} from "./store";

export interface PublishResult{platform:Platform;ok:boolean;message:string;externalId?:string;}

async function refreshX(refreshToken:string){
 const clientId=process.env.X_CLIENT_ID;
 if(!clientId) throw new Error("X_CLIENT_ID is not configured");
 const body=new URLSearchParams({refresh_token:refreshToken,grant_type:"refresh_token",client_id:clientId});
 const response=await fetch("https://api.x.com/2/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
 if(!response.ok) throw new Error("X token refresh failed");
 return response.json();
}

async function postX(token:string,text:string){
 return fetch("https://api.x.com/2/tweets",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({text})});
}

async function publishX(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("X");
 if(!connection?.access_token_enc) return {platform:"X",ok:false,message:"X is not connected."};
 try{
  let token=await decryptSecret(connection.access_token_enc);
  let response=await postX(token,draft.content);
  if(response.status===401 && connection.refresh_token_enc){
   const refreshed=await refreshX(await decryptSecret(connection.refresh_token_enc));
   if(!refreshed.access_token) return {platform:"X",ok:false,message:"X refresh did not return an access token."};
   token=refreshed.access_token;
   await updateConnectionTokens("X",await encryptSecret(token),refreshed.refresh_token?await encryptSecret(refreshed.refresh_token):undefined);
   response=await postX(token,draft.content);
  }
  const data=await response.json().catch(()=>({}));
  if(!response.ok) return {platform:"X",ok:false,message:data?.detail||data?.title||"X API rejected the post."};
  return {platform:"X",ok:true,message:"Published through the official X API.",externalId:data?.data?.id};
 }catch(e){return {platform:"X",ok:false,message:e instanceof Error?e.message:"X publishing failed."};}
}

export async function publishDraft(draft:Draft):Promise<PublishResult>{
 if(draft.platform==="X") return publishX(draft);
 return {platform:draft.platform,ok:false,message:"Connector not configured yet. Connect the official platform OAuth/API before publishing."};
}
