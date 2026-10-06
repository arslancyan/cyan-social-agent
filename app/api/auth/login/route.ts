import {NextRequest,NextResponse} from "next/server";
import {createSession,verifyPassword,rateLimit} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
export async function POST(req:NextRequest){
 try{
  const length=Number(req.headers.get("content-length")||0);if(length>16384)return NextResponse.json({error:"Request is too large"},{status:413});
  const b=await req.json();const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(email.length>254||password.length>256)return NextResponse.json({error:"Invalid credentials"},{status:400});
  const ip=req.headers.get("x-real-ip")?.trim()||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  if(!(await rateLimit("login:"+ip+":"+email,8,600))||!(await rateLimit("login-email:"+email,8,600)))return NextResponse.json({error:"Too many login attempts. Try again later."},{status:429});
  await dbReady();const r=await pool.query("SELECT id,email,password_hash,plan FROM cyan_users WHERE email=$1",[email]);const u=r.rows[0];
  if(!u||!verifyPassword(password,u.password_hash))return NextResponse.json({error:"Invalid email or password"},{status:401});
  const user={id:u.id,email:u.email,plan:u.plan};await createSession(user);return NextResponse.json({user:{id:user.id,email:user.email,plan:user.plan}});
 }catch(e){console.error("Login failed",e);return NextResponse.json({error:"Authentication service unavailable"},{status:503})}
}