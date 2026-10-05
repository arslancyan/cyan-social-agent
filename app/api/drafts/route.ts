import {NextResponse} from "next/server";
import {listDrafts,saveDrafts,updateStatus} from "@/lib/store";
import {buildDrafts} from "@/lib/agent";

export async function GET(){return NextResponse.json({drafts:await listDrafts()});}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!b.topic||typeof b.topic!=="string") return NextResponse.json({error:"Topic required"},{status:400});
 const drafts=buildDrafts(b.topic);
 return NextResponse.json({drafts:await saveDrafts(drafts)});
}
export async function PATCH(req:Request){
 const b=await req.json().catch(()=>({}));
 if(!b.id||!b.status) return NextResponse.json({error:"id and status required"},{status:400});
 const draft=await updateStatus(b.id,b.status,b.scheduledAt);
 if(!draft) return NextResponse.json({error:"Draft not found"},{status:404});
 return NextResponse.json({draft});
}