import {NextRequest,NextResponse} from "next/server";
import {createSession,verifyPassword} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
export async function POST(req:NextRequest){
 try{
  const b=await req.json();const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  await dbReady();const r=await pool.query("SELECT id,email,password_hash,plan FROM cyan_users WHERE email=$1",[email]);const u=r.rows[0];
  if(!u||!verifyPassword(password,u.password_hash))return NextResponse.json({error:"Invalid email or password"},{status:401});
  const user={id:u.id,email:u.email,plan:u.plan};await createSession(user);return NextResponse.json({user:{id:user.id,email:user.email,plan:user.plan}});
 }catch{return NextResponse.json({error:"Login failed"},{status:400})}
}