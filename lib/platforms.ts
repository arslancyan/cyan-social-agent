import {Draft,Platform} from "./types";
export interface PublishResult{platform:Platform;ok:boolean;message:string;}
export async function publishDraft(draft:Draft):Promise<PublishResult>{
  return {platform:draft.platform,ok:false,message:"Connector not configured. Connect the official platform OAuth/API before publishing."};
}
