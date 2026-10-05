import {NextResponse} from "next/server";
import {latestTrends} from "@/lib/store";

export const dynamic="force-dynamic";

export async function GET(){
 try{return NextResponse.json({trends:await latestTrends(10)})}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Trend store unavailable"},{status:503})}
}