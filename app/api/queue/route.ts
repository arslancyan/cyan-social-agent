import {NextResponse} from "next/server"; import {buildDrafts} from "../../../lib/agent";
export async function POST(req:Request){const {topic}=await req.json().catch(()=>({})); if(!topic)return NextResponse.json({error:"Topic required"},{status:400}); return NextResponse.json({drafts:buildDrafts(topic)});}
