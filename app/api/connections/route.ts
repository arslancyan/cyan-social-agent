import {NextResponse} from "next/server";
import {listConnections} from "@/lib/store";
export const dynamic="force-dynamic";
export async function GET(){
 try{return NextResponse.json({connections:await listConnections()})}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Connection store unavailable"},{status:503})}
}