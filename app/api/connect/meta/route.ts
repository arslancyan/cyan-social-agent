import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireUser,rateLimit,requireWorkspaceRole,runAsUser,workspaceId} from "@/lib/auth";

function b64(v:Uint8Array){return Buffer.from(v).toString("base64url");}
export async function GET(){
 const user=await requireUser();
 if(!(await rateLimit("oauth:meta:"+user.id,10,600)))return NextResponse.json({error:"Too many Meta connection attempts. Try again later."},{status:429});
 const oauthWorkspace=await runAsUser(user,async()=>{await requireWorkspaceRole(user.id,["owner","admin"]);return workspaceId();});
 const appId=process.env.META_APP_ID,redirect=process.env.META_REDIRECT_URI;
 if(!appId||!redirect)return NextResponse.json({error:"Meta OAuth is not configured. Set META_APP_ID and META_REDIRECT_URI."},{status:503});
 const state=b64(crypto.getRandomValues(new Uint8Array(24))),c=await cookies();
 c.set("cyan_meta_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 c.set("cyan_meta_oauth_workspace",oauthWorkspace,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 const scope=["pages_show_list","pages_read_engagement","pages_manage_posts","instagram_basic","instagram_content_publish"].join(",");
 const version=process.env.META_GRAPH_VERSION||"v23.0";
 const q=new URLSearchParams({client_id:appId,redirect_uri:redirect,state,scope,response_type:"code"});
 return NextResponse.redirect("https://www.facebook.com/"+version+"/dialog/oauth?"+q.toString());
}