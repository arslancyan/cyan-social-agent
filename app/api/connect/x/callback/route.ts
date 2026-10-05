import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {encryptSecret} from "@/lib/crypto";
import {saveConnection} from "@/lib/store";
import {requireUser,runAsUser} from "@/lib/auth";

async function fetchWithTimeout(input:RequestInfo|URL,init:RequestInit={},timeoutMs=10000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);}}

export async function GET(req:NextRequest){
 const c=await cookies();
 try{
  const user=await requireUser();
  const url=new URL(req.url);
  const error=url.searchParams.get("error");
  if(error){c.delete("cyan_x_oauth_state");c.delete("cyan_x_pkce");return NextResponse.redirect(new URL("/?connection_error=X",req.url));}
  const code=url.searchParams.get("code"),state=url.searchParams.get("state");
  const expected=c.get("cyan_x_oauth_state")?.value,verifier=c.get("cyan_x_pkce")?.value;
  if(!code||!state||!expected||state!==expected||!verifier)return NextResponse.json({error:"Invalid OAuth state or missing code"},{status:400});
  const clientId=process.env.X_CLIENT_ID,redirect=process.env.X_REDIRECT_URI,secret=process.env.X_CLIENT_SECRET;
  if(!clientId||!redirect)return NextResponse.json({error:"X OAuth is not configured"},{status:503});
  const body=new URLSearchParams({code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:verifier});
  const headers:Record<string,string>={"content-type":"application/x-www-form-urlencoded"};
  if(secret)headers.authorization="Basic "+Buffer.from(clientId+":"+secret).toString("base64");
  const tokenResponse=await fetchWithTimeout("https://api.x.com/2/oauth2/token",{method:"POST",headers,body});
  if(!tokenResponse.ok)return NextResponse.json({error:"X token exchange failed"},{status:502});
  const token=await tokenResponse.json();
  if(!token.access_token)return NextResponse.json({error:"X did not return an access token"},{status:502});
  let label:string|undefined;
  const me=await fetchWithTimeout("https://api.x.com/2/users/me",{headers:{authorization:"Bearer "+token.access_token}});
  if(me.ok){const d=await me.json();label=d.data?.username?("@"+d.data.username):d.data?.name;}
  const accessToken=await encryptSecret(token.access_token); const refreshToken=token.refresh_token?await encryptSecret(token.refresh_token):""; await runAsUser(user,()=>saveConnection("X",accessToken,refreshToken,label));
  c.delete("cyan_x_oauth_state");c.delete("cyan_x_pkce");
  return NextResponse.redirect(new URL("/?connected=X",req.url));
 }catch(e){
  console.error("X OAuth callback failed",e);
  c.delete("cyan_x_oauth_state");c.delete("cyan_x_pkce");
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json({error:"X connection could not be completed."},{status:502});
 }
}
