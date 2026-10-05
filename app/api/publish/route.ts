import {NextResponse} from "next/server"; import {publishDraft} from "../../../lib/platforms"; 
export async function POST(req:Request){const b=await req.json().catch(()=>({})); if(!b.draft)return NextResponse.json({error:"draft required"},{status:400}); return NextResponse.json(await publishDraft(b.draft));}
