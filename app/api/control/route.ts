import {NextRequest,NextResponse} from "next/server";
import {getControl,setControl} from "@/lib/store";
import {PriorityMode} from "@/lib/types";

export async function GET(){return NextResponse.json(await getControl());}
export async function PATCH(req:NextRequest){
 try{
  const b=await req.json();
  const patch:{mode?:PriorityMode;paused?:boolean}={};
  if(b.mode!==undefined){
   if(!["conservative","smart","autonomous"].includes(b.mode)) return NextResponse.json({error:"Invalid mode"},{status:400});
   patch.mode=b.mode;
  }
  if(b.paused!==undefined) patch.paused=Boolean(b.paused);
  return NextResponse.json(await setControl(patch));
 }catch{return NextResponse.json({error:"Invalid control request"},{status:400});}
}