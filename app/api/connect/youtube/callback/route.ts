import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {encryptSecret} from "@/lib/crypto";
import {saveConnection} from "@/lib/store";
import {requireUser,runAsUser,requireWorkspaceRole,rateLimit} from "@/lib/auth";

async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=12000){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetch(input,{...init,signal:controller.signal,cache:"no-store"});}finally{clearTimeout(timer);}
}

export async function GET(req:NextRequest){
 const c=await cookies();
 try{
  const user=await requireUser();
  if(!(await rateLimit("youtube-oauth-callback:"+user.id,10,60)))return NextResponse.json({error:"Rate limit reached."},{status:429});
  const u=new URL(req.url);
  if(u.searchParams.get("error")){c.delete("cyan_youtube_state");c.delete("cyan_youtube_oauth_workspace");return NextResponse.redirect(new URL("/?connection_error=YouTube",req.url));}
  const code=u.searchParams.get("code"),state=u.searchParams.get("state");
  const expected=c.get("cyan_youtube_state")?.value,oauthWorkspace=c.get("cyan_youtube_oauth_workspace")?.value;
  if(!code||!state||!expected||state!==expected||!oauthWorkspace){
   c.delete("cyan_youtube_state");c.delete("cyan_youtube_oauth_workspace");
   return NextResponse.json({error:"Invalid YouTube OAuth state."},{status:400,headers:{"Cache-Control":"no-store"}});
  }
  await runAsUser(user,async()=>{await requireWorkspaceRole(user.id,["owner","admin"],oauthWorkspace);});
  const clientId=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,redirect=process.env.GOOGLE_REDIRECT_URI;
  if(!clientId||!secret||!redirect)return NextResponse.json({error:"YouTube OAuth is not configured."},{status:503,headers:{"Cache-Control":"no-store"}});
  const body=new URLSearchParams({code,client_id:clientId,client_secret:secret,redirect_uri:redirect,grant_type:"authorization_code"});
  const response=await fetchWithTimeout("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  const token=await response.json().catch(()=>({}));
  if(!response.ok||!token.access_token)return NextResponse.json({error:"Google token exchange failed. Check OAuth client and redirect URI."},{status:502,headers:{"Cache-Control":"no-store"}});
  if(!token.refresh_token){
   return NextResponse.json({error:"Google did not return a refresh token. Disconnect this app in Google Account permissions and reconnect with consent, or verify OAuth access_type=offline."},{status:502,headers:{"Cache-Control":"no-store"}});
  }
  await runAsUser(user,()=>saveConnection("YouTube",await encryptSecret(String(token.access_token)),await encryptSecret(String(token.refresh_token)),"YouTube channel"),oauthWorkspace);
  c.delete("cyan_youtube_state");c.delete("cyan_youtube_oauth_workspace");
  return NextResponse.redirect(new URL("/?connected=YouTube",req.url));
 }catch(e){
  console.error("YouTube OAuth callback failed",e);
  c.delete("cyan_youtube_state");c.delete("cyan_youtube_oauth_workspace");
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json({error:"YouTube connection could not be completed."},{status:502});
 }
}
