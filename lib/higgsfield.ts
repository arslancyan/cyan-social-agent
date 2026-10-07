const BASE="https://api.higgsfield.ai";

export type HiggsfieldVideoOptions={
 prompt:string;
 model?:string;
 duration?:number;
 aspectRatio?:string;
 resolution?:string;
 generateAudio?:boolean;
};

function key(){return process.env.HF_API_KEY||process.env.HF_CREDENTIALS||"";}
function headers(){const k=key();if(!k)throw new Error("Higgsfield is not configured. Set HF_API_KEY on the server.");return {"Authorization":"Key "+k,"Content-Type":"application/json","Accept":"application/json"};}

export function higgsfieldConfigured(){return Boolean(key());}

export async function submitHiggsfieldVideo(options:HiggsfieldVideoOptions){
 const model=options.model||process.env.HF_VIDEO_MODEL||"bytedance/seedance-2.0/text-to-video";
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(BASE+"/"+model,{method:"POST",headers:headers(),body:JSON.stringify({
   prompt:options.prompt.trim().slice(0,5000),
   duration:Math.max(1,Math.min(15,Math.floor(options.duration||5))),
   resolution:options.resolution||"720p",
   aspect_ratio:options.aspectRatio||"9:16",
   generate_audio:options.generateAudio!==false
  }),signal:controller.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error?.message||data?.message||"Higgsfield request failed ("+response.status+")"));
  return {requestId:String(data.request_id||data.id||""),statusUrl:String(data.status_url||"")};
 }finally{clearTimeout(timer)}
}

export async function waitHiggsfieldVideo(requestId:string,maxMs=120000){
 if(!requestId)throw new Error("Higgsfield returned no request id.");
 const deadline=Date.now()+Math.max(5000,Math.min(150000,maxMs));
 while(Date.now()<deadline){
  const response=await fetch(BASE+"/requests/"+encodeURIComponent(requestId)+"/status",{headers:headers(),cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error?.message||data?.message||"Higgsfield status failed ("+response.status+")"));
  const status=String(data.status||"").toLowerCase();
  if(status==="completed"){
   const url=String(data.video?.url||data.video_url||data.result?.video?.url||data.result?.url||"");
   if(!url)throw new Error("Higgsfield completed without a video URL.");
   return {status,url,raw:data};
  }
  if(["failed","canceled","nsfw"].includes(status))throw new Error("Higgsfield generation "+status+".");
  await new Promise(r=>setTimeout(r,3000));
 }
 throw new Error("Higgsfield generation is still processing; keep the job request id for polling.");
}

export async function generateHiggsfieldVideo(options:HiggsfieldVideoOptions){
 const submitted=await submitHiggsfieldVideo(options);
 return waitHiggsfieldVideo(submitted.requestId);
}
