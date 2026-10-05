import {NextResponse} from "next/server";
import {limits,requireUser} from "@/lib/auth";
import {dbReady,pool} from "@/lib/db";

export const dynamic="force-dynamic";

export async function GET(){
 try{
  const user=await requireUser();
  await dbReady();
  const r=await pool.query(
   "SELECT generations,publishes FROM cyan_usage WHERE user_id=$1 AND day=CURRENT_DATE",
   [user.id]
  );
  const row=r.rows[0]||{generations:0,publishes:0};
  const l=limits(user.plan);
  return NextResponse.json({
   plan:user.plan,
   day:new Date().toISOString().slice(0,10),
   generations:{used:Number(row.generations),limit:l.generations,remaining:Math.max(0,l.generations-Number(row.generations))},
   publishes:{used:Number(row.publishes),limit:l.publishes,remaining:Math.max(0,l.publishes-Number(row.publishes))}
  });
 }catch(e){
  if(e instanceof Error&&e.message.toLowerCase().includes("unauth"))return NextResponse.json({error:"Unauthorized"},{status:401});
  console.error("Usage API failed",e);return NextResponse.json({error:"Usage service unavailable"},{status:503});
 }
}