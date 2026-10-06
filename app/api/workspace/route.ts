import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {randomBytes} from "crypto";
import {requireUser,runAsUser,rateLimit,requireWorkspaceRole,limits,workspaceId} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";
import {recordEvent} from "@/lib/store";

export const dynamic="force-dynamic";

async function ensure(user:any){
 await pool.query("INSERT INTO cyan_workspaces(id,owner_user_id,name) VALUES($1,$1,$2) ON CONFLICT(id) DO NOTHING",[user.id,"CYAN Workspace"]);
 await pool.query("INSERT INTO cyan_workspace_members(workspace_id,user_id,role) VALUES($1,$1,'owner') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='owner'",[user.id]);
}

export async function GET(){
 try{
  const user=await requireUser();
  return NextResponse.json(await runAsUser(user,async()=>{
   await dbReady(); await ensure(user);
   const activeId=workspaceId();
   const workspaces=await pool.query(`SELECT w.id,w.name,w.owner_user_id,m.role
     FROM cyan_workspaces w
     JOIN cyan_workspace_members m ON m.workspace_id=w.id AND m.user_id=$1
     ORDER BY w.created_at ASC`,[user.id]);
   const active=workspaces.rows.find((w:any)=>w.id===activeId)||workspaces.rows.find((w:any)=>w.id===user.id);
   const members=active?await pool.query(`SELECT m.user_id,u.email,u.plan,m.role,m.created_at
     FROM cyan_workspace_members m JOIN cyan_users u ON u.id=m.user_id
     WHERE m.workspace_id=$1 ORDER BY m.created_at`,[active.id]):{rows:[]};
   return {workspace:active,members:members.rows,workspaces:workspaces.rows};
  }));
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  console.error("Workspace GET failed",e); return NextResponse.json({error:"Workspace unavailable"},{status:503});
 }
}

export async function PUT(req:Request){
 try{
  const user=await requireUser();
  const body=await req.json().catch(()=>({}));
  const id=typeof body.workspaceId==="string"?body.workspaceId.trim():"";
  if(!id||id.length>200)return NextResponse.json({error:"A valid workspaceId is required."},{status:400});
  await runAsUser(user,async()=>{
   await dbReady();
   await requireWorkspaceRole(user.id,["owner","admin","editor","viewer"],id);
  },id);
  const c=await cookies();
  c.set("cyan_workspace",id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:60*60*24*30,path:"/"});
  return NextResponse.json({ok:true,workspaceId:id});
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"You are not a member of that workspace."},{status:403});
  console.error("Workspace switch failed",e); return NextResponse.json({error:"Workspace switch unavailable"},{status:503});
 }
}

export async function POST(req:Request){
 try{
  const user=await requireUser();
  if(!(await rateLimit("workspace-invite:"+user.id,20,3600)))return NextResponse.json({error:"Invite limit reached."},{status:429});
  const body=await req.json().catch(()=>({}));
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  const role=typeof body.role==="string"?body.role:"viewer";
  if(!email||!["admin","editor","viewer"].includes(role))return NextResponse.json({error:"Invalid member invite"},{status:400});
  return NextResponse.json(await runAsUser(user,async()=>{
   await dbReady(); await ensure(user);
   const activeId=workspaceId();
   await requireWorkspaceRole(user.id,["owner","admin"],activeId);
   const found=await pool.query("SELECT id,email,plan FROM cyan_users WHERE email=$1",[email]);
   if(!found.rows[0])return{invited:false,reason:"User must create a CYAN account before joining a workspace."};
   const existing=await pool.query("SELECT 1 FROM cyan_workspace_members WHERE workspace_id=$1 AND user_id=$2",[activeId,found.rows[0].id]);
   if(!existing.rowCount){
    const count=await pool.query("SELECT COUNT(*)::int AS count FROM cyan_workspace_members WHERE workspace_id=$1",[activeId]);
    if(Number(count.rows[0]?.count||0)>=limits(user.plan).accounts)return{invited:false,reason:"Workspace member limit reached for your plan."};
   }
   await pool.query("INSERT INTO cyan_workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role",[activeId,found.rows[0].id,role]);
   await recordEvent("workspace_member_changed",{metadata:{workspaceId:activeId,memberId:found.rows[0].id,role,source:"workspace_api"}});
   return{invited:true,email,role,workspaceId:activeId};
  }));
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  console.error("Workspace invite failed",e); return NextResponse.json({error:"Workspace unavailable"},{status:503});
 }
}