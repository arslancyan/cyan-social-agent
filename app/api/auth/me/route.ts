import {NextResponse} from "next/server";import {currentUser} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const user=await currentUser();
  return NextResponse.json({authenticated:Boolean(user),user:user?{id:user.id,email:user.email,plan:user.plan}:null});
 }catch{
  return NextResponse.json({authenticated:false,user:null,error:"Authentication service unavailable"},{status:503});
 }
}