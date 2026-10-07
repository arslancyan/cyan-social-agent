export type HiggsfieldVideoOptions={
 prompt:string;
 model?:string;
 duration?:number;
 aspectRatio?:string;
 resolution?:string;
 generateAudio?:boolean;
};

export function higgsfieldConfigured(){
 return Boolean(process.env.HF_API_KEY||process.env.HF_CREDENTIALS);
}

/*
 * Higgsfield credentials are intentionally server-only.
 * The production adapter is kept behind this boundary so the browser and
 * autonomous worker never need provider credentials or provider-specific
 * request logic.
 *
 * Set HF_VIDEO_WEBHOOK_URL to a trusted CYAN-side provider gateway when using
 * a Higgsfield account/API deployment. CYAN sends a normalized job contract
 * to that gateway and receives a provider job id + polling URL.
 */
function gateway(){
 const url=process.env.HF_VIDEO_WEBHOOK_URL;
 const secret=process.env.HF_API_KEY||process.env.HF_CREDENTIALS;
 if(!url||!secret)throw new Error("Higgsfield is not configured. Set HF_VIDEO_WEBHOOK_URL and HF_API_KEY on the server.");
 return {url,secret};
}

export async function submitHiggsfieldVideo(options:HiggsfieldVideoOptions){
 const {url,secret}=gateway();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url,{method:"POST",headers:{"Authorization":"Bearer "+secret,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({
   provider:"higgsfield",
   operation:"text-to-video",
   model:options.model||process.env.HF_VIDEO_MODEL||"seedance_2_5",
   prompt:options.prompt.trim().slice(0,5000),
   duration:Math.max(1,Math.min(30,Math.floor(options.duration||5))),
   aspect_ratio:options.aspectRatio||"9:16",
   resolution:options.resolution||"720p",
   generate_audio:options.generateAudio!==false
  }),signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||data?.message||"Higgsfield gateway request failed ("+response.status+")"));
  const requestId=String(data.request_id||data.job_id||data.id||"");
  if(!requestId)throw new Error("Higgsfield gateway returned no job id.");
  return {requestId,statusUrl:String(data.status_url||"")};
 }finally{clearTimeout(timer)}
}

export async function waitHiggsfieldVideo(requestId:string,statusUrl:string,maxMs=120000){
 const {secret}=gateway();
 const url=statusUrl||process.env.HF_VIDEO_STATUS_URL;
 if(!url)throw new Error("Higgsfield status URL was not returned by the configured gateway.");
 const deadline=Date.now()+Math.max(5000,Math.min(150000,maxMs));
 while(Date.now()<deadline){
  const response=await fetch(url.replace("{request_id}",encodeURIComponent(requestId)),{headers:{"Authorization":"Bearer "+secret,"Accept":"application/json"},cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||data?.message||"Higgsfield status request failed ("+response.status+")"));
  const status=String(data.status||"").toLowerCase();
  if(["completed","success","succeeded"].includes(status)){
   const videoUrl=String(data.video_url||data.url||data.result?.url||data.result?.video_url||"");
   if(!videoUrl)throw new Error("Higgsfield job completed without a video URL.");
   return {status:"completed",url:videoUrl,raw:data};
  }
  if(["failed","canceled","cancelled","nsfw"].includes(status))throw new Error("Higgsfield generation "+status+".");
  await new Promise(r=>setTimeout(r,3000));
 }
 throw new Error("Higgsfield generation is still processing.");
}

export async function generateHiggsfieldVideo(options:HiggsfieldVideoOptions){
 const submitted=await submitHiggsfieldVideo(options);
 return waitHiggsfieldVideo(submitted.requestId,submitted.statusUrl);
}
