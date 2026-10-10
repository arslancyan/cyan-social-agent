import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireUser,rateLimit,requireWorkspaceRole,runAsUser,workspaceId} from "@/lib/auth";

function b64(v:Uint8Array){return Buffer.from(v).toString("base64url");}

export async function GET(){
 try{
  const user=await requireUser();
  if(!(await rateLimit("oauth:youtube:"+user.id,10,600)))return NextResponse.json({error:"Too many YouTube connection attempts. Try again later."},{status:429});
  const oauthWorkspace=await runAsUser(user,async()=>{await requireWorkspaceRole(user.id,["owner","admin"]);return workspaceId();});
  const clientId=process.env.GOOGLE_CLIENT_ID,redirect=process.env.GOOGLE_REDIRECT_URI;
  if(!clientId||!redirect)return NextResponse.json({error:"YouTube OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI."},{status:503});
  const state=b64(crypto.getRandomValues(new Uint8Array(24)));
  const c=await cookies();
  c.set("cyan_youtube_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
  c.set("cyan_youtube_oauth_workspace",oauthWorkspace,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
  const q=new URLSearchParams({
   client_id:clientId,
   redirect_uri:redirect,
   response_type:"code",
   scope:"https://www.googleapis.com/auth/youtube.upload",
   access_type:"offline",
   prompt:"consent",
   include_granted_scopes:"true",
   state
  });
  return NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+q.toString());
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  console.error("YouTube OAuth start failed",e);
  return NextResponse.json({error:"Could not start YouTube OAuth."},{status:503});
 }
}
