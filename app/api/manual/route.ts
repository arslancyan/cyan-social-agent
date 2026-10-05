import {NextRequest,NextResponse} from "next/server";
import {addManualDraft} from "@/lib/store";
import {Draft,Platform} from "@/lib/types";
const platforms=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  if(typeof b.content!=="string"||!b.content.trim()) return NextResponse.json({error:"content is required"},{status:400});
  if(!platforms.has(b.platform)) return NextResponse.json({error:"Unsupported platform"},{status:400});
  if(b.scheduledAt&&Number.isNaN(Date.parse(b.scheduledAt))) return NextResponse.json({error:"Invalid scheduledAt"},{status:400});
  if(b.scheduledAt&&new Date(b.scheduledAt).getTime()<=Date.now()) return NextResponse.json({error:"scheduledAt must be in the future"},{status:400});
  const draft:Draft={id:crypto.randomUUID(),platform:b.platform,angle:typeof b.angle==="string"&&b.angle.trim()?b.angle.trim():"manual",content:b.content.trim(),status:b.scheduledAt?"scheduled":"draft",scheduledAt:b.scheduledAt,protected:Boolean(b.protected)};
  return NextResponse.json({draft:await addManualDraft(draft)});
 }catch{return NextResponse.json({error:"Invalid request"},{status:400});}
}