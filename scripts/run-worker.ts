import {NextRequest} from "next/server";
import {POST} from "../app/api/worker/tick/route";
import {pool} from "../lib/db";

async function main(){
 const token=process.env.CYAN_WORKER_OIDC_TOKEN;
 if(!token)throw new Error("CYAN_WORKER_OIDC_TOKEN is required.");
 const request=new NextRequest("http://localhost/api/worker/tick",{method:"POST",headers:{"x-github-oidc-token":token,"accept":"application/json"}});
 const response=await POST(request);
 const payload=await response.json().catch(()=>({error:"Worker returned a non-JSON response"}));
 console.log(JSON.stringify({httpStatus:response.status,...payload},null,2));
 if(!response.ok||payload.ok!==true)process.exitCode=1;
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Standalone worker failed.");process.exitCode=1;}).finally(async()=>{await pool.end().catch(()=>{});});
