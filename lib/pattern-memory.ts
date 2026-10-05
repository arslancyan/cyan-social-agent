import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";

type Pattern={id:string;patternType:string;patternKey:string;score:number;confidence:number;samples:number;successes:number;failures:number;firstObservedAt:string;lastObservedAt:string;metadata:Record<string,unknown>};

const clamp=(n:number,a=0,b=100)=>Math.max(a,Math.min(b,n));
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};

function weightedRows(rows:any[]){
 let weight=0,eng=0,views=0;
 for(const r of rows){
  const age=Math.max(0,(Date.now()-new Date(r.created_at).getTime())/86400000);
  const w=Math.max(.15,Math.exp(-age/30));
  const m=r.metadata||{},impressions=Math.max(1,Number(m.impressions||m.views||0));
  const interactions=Number(m.likes||0)+Number(m.comments||0)*3+Number(m.shares||0)*4+Number(m.clicks||0)*2;
  weight+=w;eng+=w*(interactions/impressions);views+=w*Math.max(0,Number(m.views||m.impressions||0));
 }
 const rate=weight?eng/weight:0;
 const avgViews=weight?views/weight:0;
 const score=clamp(rate*1000*.7+Math.min(100,Math.log10(avgViews+1)*20)*.3);
 return {score,avgViews};
}

export async function refreshPatternMemory(){
 await dbReady();
 const ws=workspaceId();
 const r=await pool.query(`SELECT e.platform,e.metadata,e.created_at,d.angle,d.features,d.content
 FROM cyan_events e JOIN cyan_drafts d ON d.id=e.draft_id AND d.workspace_id=e.workspace_id
 WHERE e.workspace_id=$1 AND e.type='performance_snapshot' AND e.created_at>=NOW()-INTERVAL '90 days'
 ORDER BY e.created_at DESC LIMIT 6000`,[ws]);

 const groups=new Map<string,{rows:any[];metadata:any}>();
 const add=(type:string,key:string,row:any,metadata:any={})=>{
  if(!key||key.length>300)return;
  const id=type+":"+key;
  if(!groups.has(id))groups.set(id,{rows:[],metadata});
  groups.get(id)!.rows.push(row);
 };
 for(const row of r.rows){
  const platform=String(row.platform||"unknown"),angle=String(row.angle||"unknown");
  add("angle",angle,row,{angle});
  add("platform_angle",platform+"|"+angle,row,{platform,angle});
  for(const [k,v] of Object.entries(row.features||{}))if(v!==undefined&&v!==null&&String(v))add("feature",k+":"+String(v),row,{feature:k,value:String(v)});
 }
 const winners=await pool.query(`SELECT platform,metadata,created_at,draft_id FROM cyan_events WHERE workspace_id=$1 AND type='experiment_winner' AND created_at>=NOW()-INTERVAL '180 days' ORDER BY created_at DESC LIMIT 500`,[ws]);
 for(const row of winners.rows){
  const m=row.metadata||{};
  if(row.platform)add("winner_platform",String(row.platform),{metadata:{views:0},created_at:row.created_at},{platform:row.platform,winner:true});
  if(m.variant)add("winner_variant",String(row.platform||"unknown")+"|"+String(m.variant),{metadata:{views:1},created_at:row.created_at},{platform:row.platform,variant:m.variant,winner:true});
 }
 for(const [id,g] of groups){
  const [type,key]=id.split(/:(.*)/s);const s=weightedRows(g.rows);const samples=g.rows.length;
  const successes=g.rows.filter(x=>{const m=x.metadata||{},impressions=Number(m.impressions||m.views||0),interactions=Number(m.likes||0)+Number(m.comments||0)*3+Number(m.shares||0)*4+Number(m.clicks||0)*2;return impressions>0&&interactions/impressions>=.03}).length;
  const failures=Math.max(0,samples-successes);
  const last=new Date(Math.max(...g.rows.map(x=>new Date(x.created_at).getTime())));
  const first=new Date(Math.min(...g.rows.map(x=>new Date(x.created_at).getTime())));
  const confidence=clamp(samples/20*100);
  await pool.query(`INSERT INTO cyan_patterns(id,workspace_id,pattern_type,pattern_key,score,confidence,samples,successes,failures,first_observed_at,last_observed_at,metadata,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
   ON CONFLICT(workspace_id,pattern_type,pattern_key) DO UPDATE SET score=EXCLUDED.score,confidence=EXCLUDED.confidence,samples=EXCLUDED.samples,successes=EXCLUDED.successes,failures=EXCLUDED.failures,first_observed_at=LEAST(cyan_patterns.first_observed_at,EXCLUDED.first_observed_at),last_observed_at=EXCLUDED.last_observed_at,metadata=EXCLUDED.metadata,updated_at=NOW()`,
   [ws,ws,type,key,Math.round(s.score),Math.round(confidence),samples,successes,failures,first.toISOString(),last.toISOString(),JSON.stringify({...g.metadata,avgViews:Math.round(s.avgViews)})]);
 }
 return topPatterns(30);
}

export async function topPatterns(limit=30):Promise<Pattern[]>{
 await dbReady();
 const ws=workspaceId();
 const r=await pool.query(`SELECT * FROM cyan_patterns WHERE workspace_id=$1 ORDER BY
   (score * (0.55 + confidence/200.0) * EXP(-GREATEST(0,EXTRACT(EPOCH FROM (NOW()-last_observed_at))/86400)/45.0)) DESC LIMIT $2`,[ws,limit]);
 return r.rows.map((x:any)=>({id:x.id,patternType:x.pattern_type,patternKey:x.pattern_key,score:Number(x.score),confidence:Number(x.confidence),samples:Number(x.samples),successes:Number(x.successes),failures:Number(x.failures),firstObservedAt:new Date(x.first_observed_at).toISOString(),lastObservedAt:new Date(x.last_observed_at).toISOString(),metadata:x.metadata||{}}));
}

export async function patternHealth(){
 const patterns=await topPatterns(100);
 const now=Date.now();
 const fresh=patterns.filter(p=>(now-new Date(p.lastObservedAt).getTime())<7*86400000);
 const stale=patterns.filter(p=>(now-new Date(p.lastObservedAt).getTime())>45*86400000);
 const decaying=patterns.filter(p=>{const age=(now-new Date(p.lastObservedAt).getTime())/86400000;return age>=7&&age<=45;});
 return {total:patterns.length,fresh:fresh.length,decaying:decaying.length,stale:stale.length,top:patterns.slice(0,15)};
}

export async function patternPrior(type:string,key:string){
 const patterns=await topPatterns(100);
 const p=patterns.find(x=>x.patternType===type&&x.patternKey===key);
 if(!p)return null;
 const age=Math.max(0,(Date.now()-new Date(p.lastObservedAt).getTime())/86400000);
 const decay=Math.exp(-age/45);
 return {...p,decayedScore:Math.round(50+(p.score-50)*decay)};
}
