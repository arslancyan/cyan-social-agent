import {NextRequest,NextResponse} from "next/server";
import {addManualDraft} from "@/lib/store";
import {Draft,Platform} from "@/lib/types";
export async function POST(req:NextRequest){
 const b=await req.json();
 if(!b.content||!b.platform)return NextResponse.json({error:"content and platform are required"},{status:400});
 const draft:Draft={id:crypto.randomUUID(),platform:b.platform as Platform,angle:b.angle||"manual",content:b.content,status:b.scheduledAt?"scheduled":"draft",scheduledAt:b.scheduledAt,protected:Boolean(b.protected)};
 return NextResponse.json({draft:addManualDraft(draft)});
}
