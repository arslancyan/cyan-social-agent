import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({plans:[
 {id:"free",name:"Free",price:0,generations:10,publishes:10,accounts:1},
 {id:"creator",name:"Creator",price:9,generations:200,publishes:100,accounts:3},
 {id:"pro",name:"Pro",price:19,generations:600,publishes:500,accounts:10},
 {id:"agency",name:"Agency",price:49,generations:3000,publishes:3000,accounts:50}
],currency:"USD"})}