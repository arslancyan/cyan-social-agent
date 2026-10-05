import {NextResponse} from "next/server";import {analyticsSummary} from "@/lib/store";import {requireUser,runAsUser} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){try{const u=await requireUser();return NextResponse.json({events:await runAsUser(u,analyticsSummary)})}catch{return NextResponse.json({error:"Unauthorized"},{status:401})}}