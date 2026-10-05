import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {Platform} from "./types";
import {rankDecisionCandidates} from "./self-optimization";
import {explorationBudget} from "./experiment-engine";

export type PolicyAction="publish_now"|"schedule"|"explore"|"wait"|"avoid";
export type PolicyDecision={action:PolicyAction;score:number;confidence:number;reason:string;expectedOutcome:number;exploration:boolean;};

const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));

export async function evaluatePolicy(trend:any, mode:"human"|"smart"|"autonomous"="autonomous"):Promise<PolicyDecision>{
  if(mode==="human")return{action:"wait",score:50,confidence:100,reason:"Human mode does not autonomously act.",expectedOutcome:0,exploration:false};
  const [candidates,budget]=await Promise.all([rankDecisionCandidates(trend,12),explorationBudget()]);
  if(!candidates.length)return{action:"wait",score:0,confidence:0,reason:"No valid candidate with available evidence.",expectedOutcome:0,exploration:false};
  const best=candidates[0], exploration=best.confidence<55||budget.needExploration;
  if(best.expectedScore<55)return{action:"wait",score:best.expectedScore,confidence:best.confidence,reason:"Expected outcome is below the autonomous action threshold.",expectedOutcome:best.expectedScore,exploration};
  if(exploration)return{action:"explore",score:best.expectedScore,confidence:best.confidence,reason:"Use a bounded exploration slot to improve evidence while preserving the proven portfolio.",expectedOutcome:best.expectedScore,exploration:true};
  if(best.expectedScore>=78&&best.confidence>=65)return{action:"schedule",score:best.expectedScore,confidence:best.confidence,reason:"High expected outcome with sufficient evidence; schedule using the optimized candidate.",expectedOutcome:best.expectedScore,exploration:false};
  return{action:"schedule",score:best.expectedScore,confidence:best.confidence,reason:"Positive expected outcome; schedule conservatively.",expectedOutcome:best.expectedScore,exploration:false};
}

export async function recordPolicyDecision(decision:PolicyDecision,trendId?:string,platform?:Platform){
  await dbReady();
  await pool.query("INSERT INTO cyan_events(workspace_id,type,metadata,platform) VALUES($1,$2,$3,$4)",[
    workspaceId(),"policy_decision",JSON.stringify({...decision,trendId:trendId||null,recordedAt:new Date().toISOString()}),platform||null
  ]);
}

export async function policyStatus(){
  await dbReady();
  const r=await pool.query("SELECT metadata,created_at,platform FROM cyan_events WHERE workspace_id=$1 AND type='policy_decision' ORDER BY created_at DESC LIMIT 20",[workspaceId()]);
  return r.rows.map(x=>({...x.metadata,createdAt:x.created_at,platform:x.platform}));
}
