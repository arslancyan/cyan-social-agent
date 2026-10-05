import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {recordEvent} from "./store";

function score(m:any){
 const impressions=Math.max(1,Number(m?.impressions||m?.views||0));
 const interactions=Number(m?.likes||0)+Number(m?.comments||0)*3+Number(m?.shares||0)*4+Number(m?.clicks||0)*2;
 return Math.min(100,(interactions/impressions)*1000);
}

export async function evolveExperiments(){
 await dbReady();
 const ws=workspaceId();
 await pool.query(`UPDATE cyan_experiments SET status='expired' WHERE workspace_id=$1 AND status='active' AND created_at<NOW()-INTERVAL '7 days'`,[ws]);
 await pool.query(`UPDATE cyan_drafts d SET status='review',scheduled_at=NULL WHERE d.workspace_id=$1 AND d.experiment_id IN (SELECT id FROM cyan_experiments WHERE workspace_id=$1 AND status='expired') AND d.status='scheduled' AND d.protected=false`,[ws]);
 const r=await pool.query(`SELECT e.id,e.topic,d.id draft_id,d.status,d.protected,d.variant,d.platform,d.exploration,
   MAX(CASE WHEN ev.metadata->>'window'='24h' THEN ev.metadata END) m24,
   MAX(CASE WHEN ev.metadata->>'window'='72h' THEN ev.metadata END) m72
 FROM cyan_experiments e JOIN cyan_drafts d ON d.experiment_id=e.id
 LEFT JOIN cyan_events ev ON ev.workspace_id=d.workspace_id AND ev.draft_id=d.id AND ev.type='performance_snapshot'
 WHERE e.workspace_id=$1 AND e.status='active'
 GROUP BY e.id,e.topic,d.id,d.status,d.protected,d.variant,d.platform,d.exploration
 ORDER BY e.created_at ASC`,[ws]);
 const groups=new Map<string,any[]>();
 for(const row of r.rows){if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id)!.push(row);}
 const results:any[]=[];
 for(const [experimentId,rows] of groups){
  const measured=rows.map(x=>({...x,score:x.m72?score(x.m72):x.m24?score(x.m24):null})).filter(x=>x.score!==null);
  if(measured.length<2)continue;
  measured.sort((a,b)=>b.score-a.score);
  const winner=measured[0];
  const runner=measured[1];
  const gap=Number(winner.score)-Number(runner.score);
  const maturityBonus=measured.filter(x=>x.m72).length*10+measured.filter(x=>x.m24).length*5;
  const confidence=Math.min(100,20+measured.length*15+maturityBonus+Math.max(0,gap)*2);
  if(confidence<55)continue;
  const u=await pool.query("UPDATE cyan_experiments SET status='completed',winner_draft_id=$1,winner_score=$2 WHERE workspace_id=$3 AND id=$4 AND status='active' RETURNING id",[winner.draft_id,winner.score,ws,experimentId]);
  if(!u.rowCount)continue;
  const unpublishedLosers=rows.filter(x=>x.draft_id!==winner.draft_id&&x.status!=='published'&&!x.protected);
  for(const loser of unpublishedLosers){
   await pool.query("UPDATE cyan_drafts SET status='review',scheduled_at=NULL WHERE workspace_id=$1 AND id=$2 AND status='scheduled' AND protected=false",[ws,loser.draft_id]);
  }
  await recordEvent("experiment_winner",{platform:winner.platform,draftId:winner.draft_id,metadata:{experimentId,topic:rows[0].topic,score:winner.score,variant:winner.variant,confidence,exploration:Boolean(winner.exploration),runnerUpScore:runner.score,scoreGap:gap,maturity:winner.m72?"72h":winner.m24?"24h":"early"}});
  results.push({experimentId,topic:rows[0].topic,winnerDraftId:winner.draft_id,winnerScore:Number(winner.score),confidence,variants:rows.length,unscheduledLosers:unpublishedLosers.length});
 }
 return results;
}

export async function experimentHealth(){
 await dbReady();
 const r=await pool.query(`SELECT status,COUNT(*)::int count,AVG(EXTRACT(EPOCH FROM (NOW()-created_at))/3600)::numeric avg_age_hours
 FROM cyan_experiments WHERE workspace_id=$1 GROUP BY status`,[workspaceId()]);
 const stale=await pool.query(`SELECT COUNT(*)::int count FROM cyan_experiments WHERE workspace_id=$1 AND status='active' AND created_at<NOW()-INTERVAL '5 days'`,[workspaceId()]);
 return {statuses:r.rows,staleActive:Number(stale.rows[0]?.count||0)};
}

export async function explorationBudget(){
 await dbReady();
 const r=await pool.query(`SELECT
 COUNT(*) FILTER (WHERE d.exploration=true)::int total,
 COUNT(*) FILTER (WHERE d.exploration=true AND d.status='published')::int published,
 COUNT(*) FILTER (WHERE d.exploration=true AND d.status IN ('scheduled','review','draft'))::int pending,
 COUNT(*) FILTER (WHERE d.exploration=false)::int exploitation
 FROM cyan_drafts d WHERE d.workspace_id=$1 AND d.created_at>=NOW()-INTERVAL '7 days'`,[workspaceId()]);
 const x=r.rows[0]||{};
 const total=Number(x.total||0),exploitation=Number(x.exploitation||0);
 const ratio=(total+exploitation)?total/(total+exploitation):0;
 return {total,exploitation,published:Number(x.published||0),pending:Number(x.pending||0),ratio,targetMin:.15,targetMax:.35,needExploration:ratio<.15,needExploitation:ratio>.35};
}
