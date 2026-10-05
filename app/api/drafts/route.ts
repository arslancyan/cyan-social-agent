import {NextResponse} from "next/server"; import {listDrafts,saveDrafts,updateStatus} from "../../../lib/store"; import {buildDrafts} from "../../../lib/agent";
export async function GET(){return NextResponse.json({drafts:listDrafts()});}
export async function POST(req:Request){const b=await req.json().catch(()=>({})); if(!b.topic)return NextResponse.json({error:"Topic required"},{status:400}); return NextResponse.json({drafts:saveDrafts(buildDrafts(b.topic))});}
export async function PATCH(req:Request){const b=await req.json().catch(()=>({})); if(!b.id||!b.status)return NextResponse.json({error:"id and status required"},{status:400}); return NextResponse.json({draft:updateStatus(b.id,b.status,b.scheduledAt)});}
