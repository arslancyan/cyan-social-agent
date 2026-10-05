import {NextRequest,NextResponse} from "next/server";
import {createSession,createUser} from "@/lib/auth";
export async function POST(req:NextRequest){
 try{
  const b=await req.json();const email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return NextResponse.json({error:"Valid email and password of at least 8 characters required."},{status:400});
  const user=await createUser(email,password);await createSession(user);return NextResponse.json({user:{id:user.id,email:user.email,plan:user.plan}});
 }catch(e){return NextResponse.json({error:"Account could not be created. The email may already be registered."},{status:409})}
}