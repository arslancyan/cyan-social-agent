import {NextResponse} from "next/server";
import {requireUser,runAsUser,rateLimit} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("inbox:"+user.id,120,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});
  const url=new URL(req.url),status=url.searchParams.get("status"),platform=url.searchParams.get("platform"),limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||50)));
  return NextResponse.json(await runAsUser(user,async()=>{
   await dbReady();
   const r=await pool.query(`SELECT t.*,COALESCE((SELECT json_agg(m ORDER BY m.created_at ASC) FROM (SELECT * FROM cyan_inbox_messages WHERE thread_id=t.id ORDER BY created_at DESC LIMIT 20)m),'[]'::json) AS messages FROM cyan_inbox_threads t WHERE t.workspace_id=$1 AND ($2::text IS NULL OR t.status=$2) AND ($3::text IS NULL OR t.platform=$3) ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,t.last_message_at DESC LIMIT $4`,[user.id,status||null,platform||null,limit]);
   return {threads:r.rows,connectedSources:[]};
  }));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Inbox GET failed",e);return NextResponse.json({error:"Inbox unavailable"},{status:503});}
}
export async function PATCH(req:Request){
 try{
  const user=await requireUser();
  const body=await req.json().catch(()=>({}));
  const id=typeof body.id==="string"?body.id:"",status=typeof body.status==="string"?body.status:"",priority=typeof body.priority==="string"?body.priority:"";
  if(!id||(!["open","pending","resolved"].includes(status)&&!["normal","high","urgent"].includes(priority)))return NextResponse.json({error:"Invalid inbox update"},{status:400});
  return NextResponse.json(await runAsUser(user,async()=>{
   await dbReady();
   const r=await pool.query(`UPDATE cyan_inbox_threads SET status=CASE WHEN $2='' THEN status ELSE $2 END,priority=CASE WHEN $3='' THEN priority ELSE $3 END WHERE id=$1 AND workspace_id=$4 RETURNING *`,[id,status,priority,user.id]);
   if(!r.rows[0])throw new Error("Inbox thread not found");
   return {thread:r.rows[0]};
  }));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});if(e instanceof Error&&e.message==="Inbox thread not found")return NextResponse.json({error:e.message},{status:404});console.error("Inbox PATCH failed",e);return NextResponse.json({error:"Inbox unavailable"},{status:503});}
}
