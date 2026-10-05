import {NextResponse} from "next/server";
import {requireUser,runAsUser} from "@/lib/auth";
import {growthStatus} from "@/lib/growth-optimizer";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const user=await requireUser();
  return NextResponse.json(await runAsUser(user,async()=>({decisions:await growthStatus()})));
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({error:"Growth analytics unavailable"},{status:503});
 }
}