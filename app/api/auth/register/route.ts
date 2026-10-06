import {NextRequest,NextResponse} from "next/server";
import {createSession,createUser,rateLimit} from "@/lib/auth";
import {normalizeEmail,isValidEmail,isValidPassword} from "@/lib/security-policy";
export async function POST(req:NextRequest){
 try{
  const length=Number(req.headers.get("content-length")||0);if(length>16384)return NextResponse.json({error:"Request is too large"},{status:413});
  const b=await req.json();const email=normalizeEmail(b.email),password=typeof b.password==="string"?b.password:"";
  const ip=req.headers.get("x-real-ip")?.trim()||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  if(!(await rateLimit("register:"+ip,5,3600))||!(await rateLimit("register-email:"+email,5,3600))){return NextResponse.json({error:"Too many registration attempts. Try again later."},{status:429});}
  if(!isValidEmail(email)||!isValidPassword(password)){return NextResponse.json({error:"Valid email and password of 8–256 characters required."},{status:400});}
  const user=await createUser(email,password);
  await createSession(user);
  return NextResponse.json({user:{id:user.id,email:user.email,plan:user.plan}});
 }catch(e){
  const code=(e as any)?.code;
  if(code==="23505"){return NextResponse.json({error:"This email is already registered. Use “I already have an account” and sign in."},{status:409});}
  console.error("Registration failed",e);
  return NextResponse.json({error:"Registration is temporarily unavailable. Please try again in a moment."},{status:503});
 }
}
