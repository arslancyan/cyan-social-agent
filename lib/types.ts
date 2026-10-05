export type Platform="X"|"TikTok"|"Instagram"|"Facebook";
export type QueueStatus="draft"|"review"|"scheduled"|"publishing"|"published"|"failed";
export type PriorityMode="conservative"|"smart"|"autonomous";
export interface Trend{
 id:string; title:string; summary:string; sourceUrl?:string; score:number;
 views?:number; velocity?:number; relevance?:number; createdAt:string;
}
export interface Draft{
 id:string; platform:Platform; angle:string; content:string;
 status:QueueStatus; scheduledAt?:string; externalId?:string; trendId?:string; protected?:boolean;
 mediaUrl?:string; mediaType?:"video"|"image";
}
export interface PriorityDecision{
 trendScore:number;
 priority:"normal"|"trending"|"hot"|"viral";
 interrupt:boolean;
 reason:string;
}
