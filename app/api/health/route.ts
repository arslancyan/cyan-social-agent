import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({name:"CYAN Social Agent",status:"ok",mode:"human-supervised",publishing:"connectors-pending"});}
