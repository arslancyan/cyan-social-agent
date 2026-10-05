import {NextRequest,NextResponse} from "next/server";
import {disconnectConnection,listConnections} from "@/lib/store";
import {requireUser,runAsUser} from "@/lib/auth";
import {Platform} from "@/lib/types";
export const dynamic="force-dynamic";
const platforms=new Set<Platform>(["X","TikTok","Instagram","Facebook"]);
export async function GET(){try{const u=await requireUser();return NextResponse.json(await runAsUser(u,async()=>({connections:await listConnections()})))}catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Connections GET failed",e);return NextResponse.json({error:"Connection service unavailable"},{status:503})}}
export async function DELETE(req:NextRequest){try{const u=await requireUser();const b=await req.json().catch(()=>({}));if(!platforms.has(b.platform))return NextResponse.json({error:"Unsupported platform"},{status:400});await runAsUser(u,()=>disconnectConnection(b.platform));return NextResponse.json({ok:true})}catch(e){if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});console.error("Connection DELETE failed",e);return NextResponse.json({error:"Could not disconnect account"},{status:503})}}
