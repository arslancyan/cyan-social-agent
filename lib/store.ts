import {Draft,QueueStatus} from "./types";
let memory:Draft[]=[];
export function listDrafts(){return memory;}
export function saveDrafts(drafts:Draft[]){memory=[...memory,...drafts];return drafts;}
export function updateStatus(id:string,status:QueueStatus,scheduledAt?:string){memory=memory.map(d=>d.id===id?{...d,status,scheduledAt}:d);return memory.find(d=>d.id===id);}
