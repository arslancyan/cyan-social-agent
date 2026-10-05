import {Draft,QueueStatus} from "./types";
let memory:Draft[]=[];
export function listDrafts(){return memory;}
export function saveDrafts(drafts:Draft[]){memory=[...memory,...drafts];return drafts;}
export function updateStatus(id:string,status:QueueStatus,scheduledAt?:string){memory=memory.map(d=>d.id===id?{...d,status,scheduledAt}:d);return memory.find(d=>d.id===id);}
export function addManualDraft(draft:Draft){memory=[draft,...memory];return draft;}
export function reprioritizeSchedule(trendId:string,viralScore:number,now=new Date()){
 const movable=memory.filter(d=>d.status==="scheduled"&&!d.protected&&d.scheduledAt).sort((a,b)=>new Date(a.scheduledAt!).getTime()-new Date(b.scheduledAt!).getTime());
 if(viralScore<85||movable.length===0)return {changed:[],message:"No interruption required."};
 const changed:Draft[]=[];
 let cursor=new Date(now.getTime()+15*60*1000);
 for(const d of movable.slice(0,4)){d.scheduledAt=cursor.toISOString();changed.push(d);cursor=new Date(cursor.getTime()+90*60*1000);}
 return {changed,message:"Flexible scheduled posts moved to make room for the viral priority slot.",trendId};
}
