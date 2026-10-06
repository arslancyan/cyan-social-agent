import {NextRequest,NextResponse} from "next/server";
import {isIP} from "net";
import {addManualDraft} from "@/lib/store";
import {Draft,Platform} from "@/lib/types";
import {requireUser,runAsUser,rateLimit,requireWorkspaceRole} from "@/lib/auth";

const platforms=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);

function isSafeMediaUrl(value:string){
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password)return false;
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if(host==="localhost"||host.endsWith(".localhost")||host==="metadata.google.internal"||host==="metadata.google"){
   return false;
  }
  const ipKind=isIP(host);
  if(ipKind===6){
   const normalized=host.toLowerCase();
   if(normalized==="::1"||normalized==="::"||normalized.startsWith("fc")||normalized.startsWith("fd")||normalized.startsWith("fe8")||normalized.startsWith("fe9")||normalized.startsWith("fea")||normalized.startsWith("feb")||normalized.startsWith("ff"))return false;
   const mapped=normalized.match(/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/);
   if(mapped){const m=mapped[1].split(".").map(Number);const [a,b]=m;if(a===10||a===127||a===0||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168)return false;}
  } else if(ipKind===4 && (host==="0.0.0.0"||host.startsWith("169.254.")))return false;
  const ipv4=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if(ipv4){
   const n=ipv4.slice(1).map(Number);
   if(n.some(x=>x>255))return false;
   const [a,b]=n;
   if(a===10||a===127||a===0||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168)return false;
  }
  return true;
 }catch{return false}
}

export async function POST(req:NextRequest){
 try{
  const u=await requireUser();
  if(!(await rateLimit("manual:"+u.id,30,60)))return NextResponse.json({error:"Manual post rate limit reached. Try again shortly."},{status:429});
  await runAsUser(u,()=>requireWorkspaceRole(u.id,["owner","admin","editor"]));
  const b=await req.json();
  if(typeof b.content!=="string"||!b.content.trim()||b.content.length>10000)return NextResponse.json({error:"content is required"},{status:400});
  if(!platforms.has(b.platform))return NextResponse.json({error:"Unsupported platform"},{status:400});
  if(b.scheduledAt&&String(b.scheduledAt).length>80)return NextResponse.json({error:"scheduledAt is too long"},{status:400});
  if(b.scheduledAt&&Number.isNaN(Date.parse(b.scheduledAt)))return NextResponse.json({error:"Invalid scheduledAt"},{status:400});
  if(b.scheduledAt&&new Date(b.scheduledAt).getTime()<=Date.now())return NextResponse.json({error:"scheduledAt must be in the future"},{status:400});
  const mediaUrl=typeof b.mediaUrl==="string"?b.mediaUrl.trim():"";
  if(mediaUrl&&mediaUrl.length>2000)return NextResponse.json({error:"mediaUrl is too long"},{status:400});
  if(mediaUrl&&!isSafeMediaUrl(mediaUrl))return NextResponse.json({error:"mediaUrl must be a public HTTPS URL"},{status:400});
  const mediaType=b.mediaType==="image"?"image":b.mediaType==="video"?"video":undefined;
  const draft:Draft={id:crypto.randomUUID(),platform:b.platform,angle:typeof b.angle==="string"&&b.angle.trim()?b.angle.trim():"manual",content:b.content.trim(),status:b.scheduledAt?"scheduled":"draft",scheduledAt:b.scheduledAt,protected:Boolean(b.protected),mediaUrl:mediaUrl||undefined,mediaType};
  return NextResponse.json(await runAsUser(u,async()=>({draft:await addManualDraft(draft)})));
 }catch(e){
  if(e instanceof Error&&e.message==="UNAUTHENTICATED")return NextResponse.json({error:"Unauthorized"},{status:401});
  if(e instanceof Error&&e.message==="FORBIDDEN")return NextResponse.json({error:"Forbidden"},{status:403});
  console.error("Manual draft API failed",e);
  return NextResponse.json({error:"Draft service unavailable"},{status:503});
 }
}
