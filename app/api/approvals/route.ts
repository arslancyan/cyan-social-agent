import {NextResponse} from "next/server";
import {requireUser,runAsUser,rateLimit,requireWorkspaceRole} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){
 try{const user=await requireUser();if(!(await rateLimit("approvals:"+user.id,120,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});
  return NextResponse.json(await runAsUser(user,async()=>{await dbReady();const r=await pool.query("SELECT * FROM cyan_drafts WHERE workspace_id=$1 AND status IN ('draft','review','scheduled') AND approval_status='pending' ORDER BY created_at DESC",[user.id]);return{drafts:r.rows};}));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Approvals GET failed",e);return NextResponse.json({error:"Approvals unavailable"},{status:503});}
}
export async function PATCH(req:Request){
 try{const user=await requireUser();const body=await req.json().catch(()=>({}));const id=typeof body.id==="string"?body.id:"",decision=typeof body.decision==="string"?body.decision:"";if(!id||!["approved","rejected","pending"].includes(decision))return NextResponse.json({error:"Invalid approval decision"},{status:400});
  return NextResponse.json(await runAsUser(user,async()=>{await dbReady();await requireWorkspaceRole(user.id,["owner","admin","approver"]);const r=await pool.query(`UPDATE cyan_drafts SET approval_status=$1,approval_by=$2,approval_at=NOW() WHERE id=$3 AND workspace_id=$2 AND status<>'published' AND protected=false RETURNING *`,[decision,user.id,id]);if(!r.rows[0])throw new Error("Draft not found or immutable");return{draft:r.rows[0]};}));
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});if(e instanceof Error&&e.message==="Draft not found or immutable")return NextResponse.json({error:e.message},{status:404});console.error("Approvals PATCH failed",e);return NextResponse.json({error:"Approval unavailable"},{status:503});}
}
