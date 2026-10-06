export type Plan="free"|"creator"|"pro"|"agency";
export type WorkspaceRole="owner"|"admin"|"editor"|"viewer";

const PLAN_LIMITS:Record<Plan,{generations:number;publishes:number;accounts:number}>={
 free:{generations:10,publishes:10,accounts:1},
 creator:{generations:200,publishes:100,accounts:3},
 pro:{generations:600,publishes:500,accounts:10},
 agency:{generations:3000,publishes:3000,accounts:50}
};

export function limits(plan:Plan){return PLAN_LIMITS[plan]??PLAN_LIMITS.free;}

const ROLE_RANK:Record<WorkspaceRole,number>={viewer:0,editor:1,admin:2,owner:3};
export function hasWorkspaceRole(role:WorkspaceRole|null|undefined,required:WorkspaceRole[]){
 if(!role)return false;
 const minimum=Math.min(...required.map(r=>ROLE_RANK[r]));
 return ROLE_RANK[role]>=minimum;
}

export function normalizeEmail(value:unknown){
 return typeof value==="string"?value.trim().toLowerCase():"";
}

export function isValidEmail(email:string){
 return email.length<=320&&/^\S+@\S+\.\S+$/.test(email);
}

export function isValidPassword(password:string){
 return password.length>=8&&password.length<=256;
}

export function isReasonableId(value:unknown,max=200){
 return typeof value==="string"&&value.length>0&&value.length<=max;
}
