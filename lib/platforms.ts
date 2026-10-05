import {Draft,Platform} from "./types";
import {decryptSecret} from "./crypto";
import {getConnectionSecret} from "./store";

export interface PublishResult{platform:Platform;ok:boolean;message:string;externalId?:string;}

async function publishX(draft:Draft):Promise<PublishResult>{
 const connection=await getConnectionSecret("X");
 if(!connection?.access_token_enc) return {platform:"X",ok:false,message:"X is not connected."};
 try{
  const token=await decryptSecret(connection.access_token_enc);
  const response=await fetch("https://api.x.com/2/tweets",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+token},body:JSON.stringify({text:draft.content})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) return {platform:"X",ok:false,message:data?.detail||data?.title||"X API rejected the post."};
  return {platform:"X",ok:true,message:"Published through the official X API.",externalId:data?.data?.id};
 }catch(e){return {platform:"X",ok:false,message:e instanceof Error?e.message:"X publishing failed."};}
}

export async function publishDraft(draft:Draft):Promise<PublishResult>{
 if(draft.platform==="X") return publishX(draft);
 return {platform:draft.platform,ok:false,message:"Connector not configured yet. Connect the official platform OAuth/API before publishing."};
}
