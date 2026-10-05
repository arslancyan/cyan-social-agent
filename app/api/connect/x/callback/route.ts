import {NextRequest,NextResponse} from "next/server";
import {cookies} from "next/headers";
import {encryptSecret} from "@/lib/crypto";
import {saveConnection} from "@/lib/store";
import {requireUser,runAsUser} from "@/lib/auth";

export async function GET(req:NextRequest){
 const user=await requireUser();
 const url=new URL(req.url);
 const code=url.searchParams.get("code"),state=url.searchParams.get("state");
 const c=await cookies();
 const expected=c.get("cyan_x_oauth_state")?.value,verifier=c.get("cyan_x_pkce")?.value;
 if(!code||!state||!expected||state!==expected||!verifier) return NextResponse.json({error:"Invalid OAuth state or missing code"},{status:400});
 const clientId=process.env.X_CLIENT_ID,redirect=process.env.X_REDIRECT_URI,secret=process.env.X_CLIENT_SECRET;
 if(!clientId||!redirect) return NextResponse.json({error:"X OAuth is not configured"},{status:503});
 const body=new URLSearchParams({code,grant_type:"authorization_code",redirect_uri:redirect,code_verifier:verifier});
 const auth=secret?Buffer.from(clientId+":"+secret).toString("base64"):undefined;
 const headers:Record<string,string>={"content-type":"application/x-www-form-urlencoded"};
 if(auth) headers.authorization="Basic "+auth;
 const tokenResponse=await fetch("https://api.x.com/2/oauth2/token",{method:"POST",headers,body});
 if(!tokenResponse.ok) return NextResponse.json({error:"X token exchange failed"},{status:502});
 const token=await tokenResponse.json();
 if(!token.access_token) return NextResponse.json({error:"X did not return an access token"},{status:502});
 let label:string|undefined;
 const me=await fetch("https://api.x.com/2/users/me",{headers:{authorization:"Bearer "+token.access_token}});
 if(me.ok){const d=await me.json();label=d.data?.username?("@"+d.data.username):d.data?.name;}
 await runAsUser(user,()=>saveConnection("X",await encryptSecret(token.access_token),token.refresh_token?await encryptSecret(token.refresh_token):"",label));
 c.delete("cyan_x_oauth_state");c.delete("cyan_x_pkce");
 return NextResponse.redirect(new URL("/?connected=X",req.url));
}