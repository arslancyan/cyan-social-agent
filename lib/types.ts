export type Platform="X"|"TikTok"|"Instagram"|"Facebook";
export type QueueStatus="draft"|"review"|"scheduled"|"published"|"failed";
export interface Trend{ id:string; title:string; summary:string; sourceUrl?:string; score:number; createdAt:string; }
export interface Draft{ id:string; platform:Platform; angle:string; content:string; status:QueueStatus; scheduledAt?:string; trendId?:string; }
