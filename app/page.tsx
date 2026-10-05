"use client";

import {useEffect, useState} from "react";

type Status = {agent:boolean; scheduler:boolean; trendWatch:boolean; lastHeartbeat:string};
type Draft = {id:string; platform:string; content:string; angle:string; status:string; scheduledAt?:string; protected?:boolean};

export default function Home(){
 const [status,setStatus]=useState<Status>({agent:false,scheduler:false,trendWatch:false,lastHeartbeat:"—"});
 const [mode,setMode]=useState("smart");
 const [topic,setTopic]=useState("Crypto market story with a useful angle");
 const [loading,setLoading]=useState(false),[drafts,setDrafts]=useState<Draft[]>([]);
 const [manual,setManual]=useState(""),[manualPlatform,setManualPlatform]=useState("X"),[scheduled,setScheduled]=useState(""),[protectedPost,setProtectedPost]=useState(false),[error,setError]=useState("");

 async function refresh(){
  try{const r=await fetch("/api/health",{cache:"no-store"}); const d=await r.json(); if(r.ok)setStatus({agent:Boolean(d.agent),scheduler:Boolean(d.scheduler),trendWatch:Boolean(d.trendWatch),lastHeartbeat:d.lastHeartbeat||"—"});}catch{}
  try{const r=await fetch("/api/drafts",{cache:"no-store"}); const d=await r.json(); if(r.ok)setDrafts(d.drafts||[]);}catch{}
 }
 useEffect(()=>{refresh(); const id=setInterval(refresh,30000); return()=>clearInterval(id)},[]);

 async function generate(){
  setLoading(true);setError("");
  try{const r=await fetch("/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Generation failed");setDrafts(d.drafts||[]);}
  catch(e){setError(e instanceof Error?e.message:"Generation failed")}finally{setLoading(false)}
 }
 async function saveManual(){
  setError("");
  try{const r=await fetch("/api/manual",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content:manual,platform:manualPlatform,scheduledAt:scheduled||undefined,protected:protectedPost})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not save post");setManual("");setScheduled("");setProtectedPost(false);await refresh();}
  catch(e){setError(e instanceof Error?e.message:"Could not save post")}
 }
 return <main className="page">
  <header className="top">
   <div className="brand"><div className="mark">C</div><div><strong>CYAN</strong><div className="muted">Social Agent · Control Center</div></div></div>
   <div className="top-actions"><span className="pill">REMOTE CONTROL</span><span className={"status "+(status.agent?"online":"offline")}><i/> {status.agent?"AGENT ONLINE":"AGENT OFFLINE"}</span></div>
  </header>

  <section className="controlbar">
   <div><div className="eyebrow">24/7 CLOUD CONTROL</div><div className="hero small">The dashboard is the remote control. Workers run independently in the cloud.</div></div>
   <div className="mode"><span className="muted">Operation mode</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="conservative">Conservative</option><option value="smart">Smart</option><option value="autonomous">Autonomous</option></select></div>
  </section>

  <section className="statusgrid">
   {[
    ["Agent",status.agent,"Cloud worker"],
    ["Scheduler",status.scheduler,"Due-post runner"],
    ["Trend Watch",status.trendWatch,"Viral detector"],
    ["Heartbeat",true,status.lastHeartbeat]
   ].map(([name,on,sub])=><div className="statcard" key={String(name)}><div className="stathead"><span>{name}</span><b className={on?"ok":"off"}>{on?"●":"○"}</b></div><strong>{name==="Heartbeat"?String(sub):on?"RUNNING":"NOT CONNECTED"}</strong><span className="muted">{name==="Heartbeat"?"Last worker signal":sub}</span></div>)}
  </section>

  <section className="grid">
   <div className="card"><div className="eyebrow">AI CONTENT ENGINE</div><div className="hero">Turn live stories into platform-native content.</div><p className="muted">Discover → Verify → Score → Generate → Adapt → Review → Schedule → Publish → Analyze.</p><div className="title">Topic / source summary</div><textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={4}/><button className="btn" onClick={generate} disabled={loading}>{loading?"Generating…":"Generate content"}</button></div>
   <div className="card"><div className="eyebrow">PRIORITY ENGINE</div><div className="hero small">Viral events can interrupt flexible schedules.</div><div className="metrics"><div className="metric"><strong>1M+</strong><span>views trigger</span></div><div className="metric"><strong>90</strong><span>viral score</span></div></div><div className="row"><span>Protected posts</span><span className="pill">LOCKED</span></div><div className="row"><span>Current mode</span><span className="pill">{mode.toUpperCase()}</span></div></div>
  </section>

  <section className="card" style={{marginTop:18}}><div className="eyebrow">MANUAL POST</div><div className="hero small">Write it yourself. CYAN can publish it later without keeping this page open.</div><div className="controls"><select value={manualPlatform} onChange={e=>setManualPlatform(e.target.value)}><option>X</option><option>Instagram</option><option>Facebook</option><option>TikTok</option></select><input type="datetime-local" value={scheduled} onChange={e=>setScheduled(e.target.value)}/></div><textarea value={manual} onChange={e=>setManual(e.target.value)} placeholder="Write a post…" rows={4}/><label className="check muted"><input type="checkbox" checked={protectedPost} onChange={e=>setProtectedPost(e.target.checked)}/> Protect this post from viral schedule shifts</label><button className="btn secondary" onClick={saveManual}>Save to calendar</button></section>

  <section className="card" style={{marginTop:18}}><div className="sectionhead"><div><div className="eyebrow">REMOTE QUEUE</div><div className="title">Scheduled & generated content</div></div><button className="btn ghost" onClick={refresh}>Refresh</button></div>{error&&<div className="error">{error}</div>}<div className="queue" style={{marginTop:10}}>{drafts.length===0?<div className="muted">No queued posts yet.</div>:drafts.slice(0,12).map(d=><div className="queueitem" key={d.id}><div><strong>{d.platform}</strong><div style={{marginTop:6}}>{d.content}</div><div className="muted mini">{d.scheduledAt?new Date(d.scheduledAt).toLocaleString():"Draft"} · {d.status}{d.protected?" · protected":""}</div></div><span className="pill">{d.angle}</span></div>)}</div></section>

  <section className="card integrations"><div className="eyebrow">ACCOUNT CONNECTIONS</div><div className="hero small">Official OAuth/API connections will live here.</div><div className="connectgrid">{["X","Instagram","TikTok","Facebook"].map(p=><div className="connection" key={p}><span className="platformdot">{p[0]}</span><div><strong>{p}</strong><div className="muted">Not connected</div></div><button className="btn ghost" disabled>Connect</button></div>)}</div><p className="muted mini">No passwords. CYAN will use official authorization scopes and platform APIs only.</p></section>
 </main>;
}
