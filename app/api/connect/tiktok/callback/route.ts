import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireUser,runAsUser} from "@/lib/auth";
import {encryptSecret} from "@/lib/crypto";
import {saveConnection} from "@/lib/store";

async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=10000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}}

export async function GET(req:NextRequest){
 const c=await cookies();
 try{
  const user=await requireUser();
  const u=new URL(req.url);
  if(u.searchParams.get("error")){c.delete("cyan_tt_state");c.delete("cyan_tt_verifier");return NextResponse.redirect(new URL("/?connection_error=TikTok",req.url));}
  const code=u.searchParams.get("code"),state=u.searchParams.get("state"),expected=c.get("cyan_tt_state")?.value,verifier=c.get("cyan_tt_verifier")?.value;
  if(!code||!state||state!==expected||!verifier)return NextResponse.json({error:"Invalid TikTok OAuth state."},{status:400});
  const key=process.env.TIKTOK_CLIENT_KEY,secret=process.env.TIKTOK_CLIENT_SECRET,redirect=process.env.TIKTOK_REDIRECT_URI;
  if(!key||!secret||!redirect)return NextResponse.json({error:"TikTok OAuth is not configured."},{status:503});
  const body=new URLSearchParams({client_key:key,client_secret:secret,code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:verifier});
  const response=await fetchWithTimeout("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","cache-control":"no-cache"},body});
  if(!response.ok)return NextResponse.json({error:"TikTok token exchange failed."},{status:502});
  const token=await response.json();
  if(!token.access_token)return NextResponse.json({error:"TikTok did not return an access token."},{status:502});
  let label:string|undefined;
  const me=await fetchWithTimeout("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",{headers:{authorization:"Bearer "+token.access_token}});
  if(me.ok){const d=await me.json();label=d.data?.user?.display_name||d.data?.display_name||undefined;}
  const accessToken=await encryptSecret(token.access_token); const refreshToken=token.refresh_token?await encryptSecret(token.refresh_token):""; await runAsUser(user,()=>saveConnection("TikTok",accessToken,refreshToken,label));
  c.delete("cyan_tt_state");c.delete("cyan_tt_verifier");
  return NextResponse.redirect(new URL("/?connected=TikTok",req.url));
 }catch(e){
  console.error("TikTok OAuth callback failed",e);
  c.delete("cyan_tt_state");c.delete("cyan_tt_verifier");
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({error:"TikTok connection could not be completed."},{status:502});
 }
}
