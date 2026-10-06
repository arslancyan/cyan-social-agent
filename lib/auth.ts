import {cookies} from "next/headers";
import {randomBytes,scryptSync,timingSafeEqual,createHash} from "crypto";
import {dbReady,pool} from "./db";
import {AsyncLocalStorage} from "async_hooks";
import {limits as planLimits,hasWorkspaceRole,Plan,WorkspaceRole} from "./security-policy";

type SessionUser={id:string;email:string;plan:"free"|"creator"|"pro"|"agency"};
type RequestContext={user:SessionUser;workspaceId:string};
const context=new AsyncLocalStorage<RequestContext>();

export function hashPassword(password:string){
 const salt=randomBytes(16).toString("hex");
 return salt+":"+scryptSync(password,salt,64).toString("hex");
}
export function verifyPassword(password:string,stored:string){
 const [salt,hash]=stored.split(":"); if(!salt||!hash)return false;
 const derived=scryptSync(password,salt,64); const expected=Buffer.from(hash,"hex");
 return expected.length===derived.length&&timingSafeEqual(expected,derived);
}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
export async function createUser(email:string,password:string){
 await dbReady();
 const id=randomBytes(16).toString("hex");
 const result=await pool.query("INSERT INTO cyan_users(id,email,password_hash) VALUES($1,$2,$3) RETURNING id,email,plan",[id,email.toLowerCase(),hashPassword(password)]);
 return result.rows[0] as SessionUser;
}
export async function createSession(user:SessionUser){
 await dbReady();
 const token=randomBytes(32).toString("base64url");
 await pool.query("INSERT INTO cyan_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[hashToken(token),user.id]);
 const c=await cookies();
 c.set("cyan_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:60*60*24*30,path:"/"});
 c.set("cyan_workspace",user.id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:60*60*24*30,path:"/"});
 return user;
}
export async function currentUser():Promise<SessionUser|null>{
 const token=(await cookies()).get("cyan_session")?.value;
 if(!token)return null;
 await dbReady();
 await pool.query("DELETE FROM cyan_sessions WHERE expires_at<=NOW()");
 const r=await pool.query("SELECT u.id,u.email,u.plan FROM cyan_sessions s JOIN cyan_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",[hashToken(token)]);
 return r.rows[0]?(r.rows[0] as SessionUser):null;
}
export async function requireUser(){const user=await currentUser();if(!user)throw new Error("UNAUTHENTICATED");return user;}

export async function rateLimit(key:string,limit:number,windowSeconds:number){
 await dbReady();
 const sql="INSERT INTO cyan_rate_limits(key,count,reset_at) VALUES($1,1,NOW()+($2 * INTERVAL '1 second')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN cyan_rate_limits.reset_at<=NOW() THEN 1 ELSE cyan_rate_limits.count+1 END, reset_at=CASE WHEN cyan_rate_limits.reset_at<=NOW() THEN NOW()+($2 * INTERVAL '1 second') ELSE cyan_rate_limits.reset_at END WHERE cyan_rate_limits.reset_at<=NOW() OR cyan_rate_limits.count < $3 RETURNING count";
 const r=await pool.query(sql,[key,windowSeconds,limit]);
 return r.rowCount===1;
}
export async function logout(){
 const c=await cookies(),token=c.get("cyan_session")?.value;
 if(token){await dbReady();await pool.query("DELETE FROM cyan_sessions WHERE token_hash=$1",[hashToken(token)]);}
 c.delete("cyan_session");
 c.delete("cyan_workspace");
}
export async function runAsUser<T>(user:SessionUser,fn:()=>Promise<T>,requestedWorkspace?:string){
 await dbReady();
 const cookieWorkspace=(await cookies()).get("cyan_workspace")?.value;
 const candidate=requestedWorkspace||cookieWorkspace||user.id;
 const membership=await pool.query("SELECT 1 FROM cyan_workspace_members WHERE workspace_id=$1 AND user_id=$2 LIMIT 1",[candidate,user.id]);
 const activeWorkspace=membership.rowCount?candidate:user.id;
 return context.run({user,workspaceId:activeWorkspace},fn);
}
export async function workspaceRole(userId:string,workspace?:string){await dbReady();const wid=workspace||userId;const r=await pool.query("SELECT role FROM cyan_workspace_members WHERE workspace_id=$1 AND user_id=$2",[wid,userId]);return r.rows[0]?.role||((wid===userId)?"owner":null);}
export async function requireWorkspaceRole(userId:string,roles:string[],workspace?:string){const role=await workspaceRole(userId,workspace);if(!role||!hasWorkspaceRole(role as WorkspaceRole,roles as WorkspaceRole[]))throw new Error("FORBIDDEN");return role;}
export function workspaceId(){const ctx=context.getStore();return ctx?.workspaceId||process.env.CYAN_WORKSPACE_ID||"local";}
export function limits(plan:SessionUser["plan"]){return planLimits(plan);}

export async function consumeUsage(user:SessionUser,type:"generations"|"publishes"){
 await dbReady();
 const l=limits(user.plan);
 const column=type==="generations"?"generations":"publishes";
 const limit=l[type];
 const r=await pool.query(`INSERT INTO cyan_usage(user_id,day,${column}) VALUES($1,CURRENT_DATE,1)
 ON CONFLICT(user_id,day) DO UPDATE SET ${column}=cyan_usage.${column}+1
 WHERE cyan_usage.${column} < $2
 RETURNING ${column} AS used`,[user.id,limit]);
 return r.rowCount===1;
}

export async function releaseUsage(user:SessionUser,type:"generations"|"publishes"){
 await dbReady();
 const column=type==="generations"?"generations":"publishes";
 await pool.query(`UPDATE cyan_usage SET ${column}=GREATEST(0,${column}-1) WHERE user_id=$1 AND day=CURRENT_DATE`,[user.id]);
}

export async function listAgentUsers(){
 await dbReady();
 const r=await pool.query("SELECT id,email,plan FROM cyan_users ORDER BY created_at ASC");
 return r.rows as SessionUser[];
}