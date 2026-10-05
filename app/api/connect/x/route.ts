import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {requireUser} from "@/lib/auth";

function b64url(bytes:Uint8Array){return Buffer.from(bytes).toString("base64url");}

export async function GET(){
 await requireUser();
 const clientId=process.env.X_CLIENT_ID;
 const redirect=process.env.X_REDIRECT_URI;
 if(!clientId||!redirect) return NextResponse.json({error:"X OAuth is not configured. Set X_CLIENT_ID and X_REDIRECT_URI."},{status:503});
 const verifier=b64url(crypto.getRandomValues(new Uint8Array(32)));
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 const challenge=b64url(new Uint8Array(digest));
 const state=b64url(crypto.getRandomValues(new Uint8Array(24)));
 const c=await cookies();
 c.set("cyan_x_oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 c.set("cyan_x_pkce",verifier,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:600,path:"/"});
 const params=new URLSearchParams({response_type:"code",client_id:clientId,redirect_uri:redirect,scope:"tweet.read tweet.write users.read offline.access",state,code_challenge:challenge,code_challenge_method:"S256"});
 return NextResponse.redirect("https://twitter.com/i/oauth2/authorize?"+params.toString());
}