import {dbReady,pool} from "./db";
import {workspaceId} from "./auth";
import {decryptSecret} from "./crypto";
import {getConnectionSecret,recordEvent,saveDrafts} from "./store";
import {Draft} from "./types";
import {isCryptoContent} from "./crypto-topic";
import {VIRAL_VIEWS_THRESHOLD,CONTENT_LANGUAGE,X_CRYPTO_SEARCH_QUERY} from "./crypto-agent-config";


function topicLabel(text:string){
 const rules:[RegExp,string][]=[
  [/\b(bitcoin|\$btc|\bbtc\b)/i,"Bitcoin"],
  [/\b(ethereum|\$eth|\beth\b)/i,"Ethereum"],
  [/\b(solana|\$sol|\bsol\b)/i,"Solana"],
  [/\b(defi|decentralized finance|dex|liquidity pool)/i,"DeFi"],
  [/\b(memecoin|meme coin|\$pepe|\$ponke|\$fren|\$donkee)/i,"memecoins"],
  [/\b(nfts?|non.fungible tokens?)/i,"NFTs"]
 ];
 return rules.find(([pattern])=>pattern.test(text))?.[1]||"crypto";
}

async function makeComment(tweetText:string,topic:string){
 const apiKey=process.env.OPENAI_API_KEY;
 if(apiKey){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+apiKey},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-6-luna",input:[
    "Write one thoughtful English reply draft to this public crypto post for a human to review.",
    "Keep it natural, specific to the post, under 240 characters, and add value through a question or concise insight.",
    "Do not make price predictions, give financial advice, promote buying/selling, invent facts, impersonate the author, or use hashtags unless essential.",
    "This is a draft only. Do not send it.",
    "Topic: "+topic,
    "Original post: "+tweetText,
    "Return only the reply text."
   ].join("\n")}),signal:controller.signal});
   if(response.ok){const data=await response.json();const text=String(data.output_text||"").trim().replace(/^["']|["']$/g,"");if(text)return text.slice(0,260);}
  }catch{}finally{clearTimeout(timer);}
 }
 return "Interesting point on "+topic+". What signal or data would you watch next to confirm this thesis?";
}

export async function monitorViralCryptoPosts(){
 await dbReady();
 const connection=await getConnectionSecret("X");
 if(!connection?.access_token_enc)return {scanned:0,qualified:0,draftsCreated:0,skipped:"X is not connected."};
 let token:string;
 try{token=await decryptSecret(connection.access_token_enc);}catch{return {scanned:0,qualified:0,draftsCreated:0,skipped:"Could not decrypt the X access token."};}
 const url="https://api.x.com/2/tweets/search/recent?query="+encodeURIComponent(X_CRYPTO_SEARCH_QUERY)+"&max_results=100&tweet.fields=created_at,lang,public_metrics,author_id";
 const response=await fetch(url,{headers:{authorization:"Bearer "+token,accept:"application/json"},signal:AbortSignal.timeout(15000)});
 if(!response.ok){
  const body=await response.text().catch(()=>"");
  return {scanned:0,qualified:0,draftsCreated:0,skipped:"X search unavailable ("+response.status+"): "+body.slice(0,160)};
 }
 const payload=await response.json();
 const tweets=Array.isArray(payload.data)?payload.data:[];
 const qualified=tweets.filter((tweet:any)=>{
  const text=String(tweet.text||"");
  const views=Number(tweet.public_metrics?.impression_count||0);
  return tweet.lang===CONTENT_LANGUAGE&&views>=VIRAL_VIEWS_THRESHOLD&&isCryptoContent(text);
 });
 let draftsCreated=0;
 for(const tweet of qualified){
  const sourceId=String(tweet.id||"");if(!sourceId)continue;
  const exists=await pool.query("SELECT 1 FROM cyan_drafts WHERE workspace_id=$1 AND reply_to_id=$2 LIMIT 1",[workspaceId(),sourceId]);
  if(exists.rowCount)continue;
  const sourceText=String(tweet.text||"").slice(0,4000);
  const topic=topicLabel(sourceText);
  const comment=await makeComment(sourceText,topic);
  const draft:Draft={
   id:"viral-reply-"+sourceId,
   platform:"X",
   angle:"Viral reply draft · "+topic+" · "+Number(tweet.public_metrics?.impression_count||0)+" views · opt-in required",
   content:comment,
   status:"review",
   trendId:"x-viral-"+sourceId,
   replyToId:sourceId,
   replyOptInConfirmed:false
  };
  await saveDrafts([draft]);
  await recordEvent("viral_reply_draft",{platform:"X",draftId:draft.id,externalId:sourceId,metadata:{views:Number(tweet.public_metrics?.impression_count||0),topic,language:"en"}});
  draftsCreated++;
 }
 return {scanned:tweets.length,qualified:qualified.length,draftsCreated,threshold:VIRAL_VIEWS_THRESHOLD,language:CONTENT_LANGUAGE};
}
