import {NextResponse} from "next/server";
import {publishDraft} from "@/lib/platforms";
import {consumeUsage,requireUser,runAsUser} from "@/lib/auth";
export async function POST(req:Request){
 try{
  const user=await requireUser();const allowed=await consumeUsage(user,"publishes");
  if(!allowed)return NextResponse.json({error:"Daily publishing limit reached for your plan."},{status:429});
  const b=await req.json().catch(()=>({}));
  if(!b.draft)return NextResponse.json({error:"draft required"},{status:400});
  return NextResponse.json(await runAsUser(user,()=>publishDraft(b.draft)));
 }catch{return NextResponse.json({error:"Unauthorized"},{status:401})}
}