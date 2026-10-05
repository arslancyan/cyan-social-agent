import {NextRequest,NextResponse} from "next/server";
import {dueDrafts,getControl,heartbeat,recordWorker,updateStatus} from "@/lib/store";
import {publishDraft} from "@/lib/platforms";

export const dynamic="force-dynamic";

function authorized(req:NextRequest){
 const secret=process.env.CYAN_WORKER_SECRET;
 if(!secret) return process.env.NODE_ENV!=="production";
 return req.headers.get("authorization")==="Bearer "+secret;
}

export async function POST(req:NextRequest){
 if(!authorized(req)) return NextResponse.json({error:"Unauthorized worker request"},{status:401});
 try{
  const control=await getControl();
  await heartbeat();
  if(control.paused){
   await recordWorker(true,"Agent paused; scheduler tick skipped.");
   return NextResponse.json({ok:true,paused:true,processed:0});
  }
  const due=await dueDrafts();
  const results=[];
  for(const draft of due){
   const result=await publishDraft(draft);
   if(result.ok) await updateStatus(draft.id,"published");
   results.push({id:draft.id,platform:draft.platform,ok:result.ok,message:result.message});
  }
  const processed=results.filter(r=>r.ok).length;
  const blocked=results.filter(r=>!r.ok).length;
  await recordWorker(blocked===0,"Due="+due.length+"; published="+processed+"; blocked="+blocked);
  return NextResponse.json({ok:true,paused:false,processed,blocked,results,heartbeat:new Date().toISOString()});
 }catch(e){
  const message=e instanceof Error?e.message:"Worker tick failed";
  try{await recordWorker(false,message)}catch{}
  return NextResponse.json({error:message},{status:500});
 }
}