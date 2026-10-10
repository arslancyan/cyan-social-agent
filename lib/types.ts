export type Platform="X"|"TikTok"|"Instagram"|"Facebook";
export type QueueStatus="draft"|"review"|"scheduled"|"publishing"|"published"|"failed";
export type PriorityMode="conservative"|"smart"|"autonomous";
export interface Trend{ id:string; title:string; summary:string; sourceUrl?:string; score:number; views?:number; velocity?:number; relevance?:number; createdAt:string; }
export interface ContentFeatureSet{hook:string;topic:string;format:string;length:"short"|"medium"|"long";cta:string;sentiment:string;media:"text"|"image"|"video";}
export interface Draft{ id:string; platform:Platform; angle:string; content:string; status:QueueStatus; scheduledAt?:string; externalId?:string; trendId?:string; replyToId?:string; replyOptInConfirmed?:boolean; protected?:boolean; mediaUrl?:string; mediaType?:"video"|"image"; publishAttempts?:number; publishStartedAt?:string; features?:ContentFeatureSet; experimentId?:string; variant?:string; exploration?:boolean; }
export interface PriorityDecision{ trendScore:number; priority:"normal"|"trending"|"hot"|"viral"; interrupt:boolean; reason:string; }
