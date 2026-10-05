import {cookies} from "next/headers";
import {randomBytes,scryptSync,timingSafeEqual,createHash} from "crypto";
import {dbReady,pool} from "./db";
import {AsyncLocalStorage} from "async_hooks";

type SessionUser={id:string;email:string;plan:"free"|"creator"|"pro"|"agency"};
const context=new AsyncLocalStorage<SessionUser>();

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
 return user;
}
export async function currentUser():Promise<SessionUser|null>{
 const token=(await cookies()).get("cyan_session")?.value;
 if(!token)return null;
 await dbReady();
 const r=await pool.query("SELECT u.id,u.email,u.plan FROM cyan_sessions s JOIN cyan_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",[hashToken(token)]);
 return r.rows[0]?(r.rows[0] as SessionUser):null;
}
export async function requireUser(){const user=await currentUser();if(!user)throw new Error("UNAUTHENTICATED");return user;}
export async function logout(){
 const c=await cookies(),token=c.get("cyan_session")?.value;
 if(token){await dbReady();await pool.query("DELETE FROM cyan_sessions WHERE token_hash=$1",[hashToken(token)]);}
 c.delete("cyan_session");
}
export async function runAsUser<T>(user:SessionUser,fn:()=>Promise<T>){return context.run(user,fn);}
export function workspaceId(){const user=context.getStore();return user?.id||process.env.CYAN_WORKSPACE_ID||"local";}
export function limits(plan:SessionUser["plan"]){
 return plan==="free"?{generations:10,publishes:10,accounts:1}:plan==="creator"?{generations:200,publishes:100,accounts:3}:plan==="pro"?{generations:600,publishes:500,accounts:10}:{generations:3000,publishes:3000,accounts:50};
}