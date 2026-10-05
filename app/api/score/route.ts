import {NextResponse} from "next/server"; import {scoreTrend} from "../../../lib/scoring";
export async function POST(req:Request){const b=await req.json().catch(()=>({})); return NextResponse.json({score:scoreTrend({velocity:Number(b.velocity||0),engagement:Number(b.engagement||0),freshness:Number(b.freshness||0),relevance:Number(b.relevance||0)})});}
