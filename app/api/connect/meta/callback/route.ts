import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {encryptSecret} from "@/lib/crypto";
import {saveConnection} from "@/lib/store";
import {requireUser,runAsUser,requireWorkspaceRole,rateLimit} from "@/lib/auth";

async function fetchJson(url:string,init:RequestInit={}){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{...init,signal:controller.signal,cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error?.message||"Meta API request failed");return d;}finally{clearTimeout(timer);}}
export async function GET(req:NextRequest){
 const c=await cookies();
 try{
  const user=await requireUser(); if(!(await rateLimit("meta-oauth-callback:"+user.id,10,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});
  const u=new URL(req.url); if(u.searchParams.get("error")){c.delete("cyan_meta_state");c.delete("cyan_meta_oauth_workspace");return NextResponse.redirect(new URL("/?connection_error=Meta",req.url));}
  const code=u.searchParams.get("code"),state=u.searchParams.get("state"),expected=c.get("cyan_meta_state")?.value,oauthWorkspace=c.get("cyan_meta_oauth_workspace")?.value;
  if(!code||!state||state!==expected||!oauthWorkspace){c.delete("cyan_meta_state");c.delete("cyan_meta_oauth_workspace");return NextResponse.json({error:"Invalid Meta OAuth state."},{status:400});}
  await runAsUser(user,async()=>{await requireWorkspaceRole(user.id,["owner","admin"],oauthWorkspace);});
  const appId=process.env.META_APP_ID,secret=process.env.META_APP_SECRET,redirect=process.env.META_REDIRECT_URI,version=process.env.META_GRAPH_VERSION||"v23.0";
  if(!appId||!secret||!redirect)return NextResponse.json({error:"Meta OAuth is not configured."},{status:503});
  const token=await fetchJson("https://graph.facebook.com/"+version+"/oauth/access_token?"+new URLSearchParams({client_id:appId,client_secret:secret,redirect_uri:redirect,code}));
  const userToken=String(token.access_token||""); if(!userToken)throw new Error("Meta did not return a user token.");
  const pages=await fetchJson("https://graph.facebook.com/"+version+"/me/accounts?"+new URLSearchParams({fields:"id,name,access_token,instagram_business_account{id,username}",access_token:userToken}));
  const page=Array.isArray(pages.data)?pages.data.find((p:any)=>p?.access_token):null;
  if(!page)throw new Error("No Facebook Page was returned. Connect a Facebook Page with publishing permission.");
  const pageToken=String(page.access_token),pageId=String(page.id),pageName=String(page.name||"Facebook Page");
  const encryptedPageToken=await encryptSecret(pageToken);\n  await runAsUser(user,()=>saveConnection("Facebook",encryptedPageToken,"",pageName),oauthWorkspace);
  const ig=page.instagram_business_account;
  if(ig?.id){
   const igLabel=ig.username?"@"+String(ig.username):"Instagram "+String(ig.id);
   await runAsUser(user,()=>saveConnection("Instagram",await encryptSecret(userToken),"",igLabel),oauthWorkspace);
  }
  c.delete("cyan_meta_state");c.delete("cyan_meta_oauth_workspace");
  return NextResponse.redirect(new URL("/?connected=Meta",req.url));
 }catch(e){
  console.error("Meta OAuth callback failed",e);c.delete("cyan_meta_state");c.delete("cyan_meta_oauth_workspace");
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json({error:e instanceof Error?e.message:"Meta connection could not be completed."},{status:502});
 }
}