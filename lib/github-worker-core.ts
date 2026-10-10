import {createHmac,randomBytes} from "node:crypto";

export const CRYPTO_QUERY='(bitcoin OR BTC OR ethereum OR ETH OR solana OR SOL OR DeFi OR memecoin OR "meme coin" OR NFT OR NFTs) -is:retweet lang:en';
export const VIRAL_THRESHOLD=500_000;
export const POST_INTERVAL_MS=3*60*60*1000;
export const SCAN_INTERVAL_MS=15*60*1000;

export function isCrypto(text:string){
 return /\b(bitcoin|btc|ethereum|eth|solana|sol|defi|web3|blockchain|memecoin|meme coin|nfts?|stablecoin|usdc|usdt|staking|airdrop|altcoin|dex|cex|tokenomics|\$btc|\$eth|\$sol|\$pepe|\$ponke|\$fren|\$donkee)\b/i.test(text||"");
}
export function topicOf(text:string){
 const rules:[RegExp,string][]=[
  [/\b(bitcoin|btc|\$btc)\b/i,"Bitcoin"],
  [/\b(ethereum|eth|\$eth)\b/i,"Ethereum"],
  [/\b(solana|sol|\$sol)\b/i,"Solana"],
  [/\b(defi|dex|liquidity pool)\b/i,"DeFi"],
  [/\b(memecoin|meme coin|\$pepe|\$ponke|\$fren|\$donkee)\b/i,"memecoins"],
  [/\b(nfts?)\b/i,"NFTs"]
 ];
 return rules.find(([r])=>r.test(text))?.[1]||"crypto";
}
export function encodeRFC3986(value:string){return encodeURIComponent(value).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());}

export function oauth1Header(method:string,url:string,query:Record<string,string>,env:{consumerKey:string;consumerSecret:string;accessToken:string;tokenSecret:string},nonce=randomBytes(16).toString("hex"),timestamp=String(Math.floor(Date.now()/1000))){
 const oauth:Record<string,string>={
  oauth_consumer_key:env.consumerKey,
  oauth_nonce:nonce,
  oauth_signature_method:"HMAC-SHA1",
  oauth_timestamp:timestamp,
  oauth_token:env.accessToken,
  oauth_version:"1.0"
 };
 const all={...query,...oauth};
 const normalized=Object.keys(all).sort().map(k=>encodeRFC3986(k)+"="+encodeRFC3986(all[k])).join("&");
 const base=method.toUpperCase()+"&"+encodeRFC3986(url)+"&"+encodeRFC3986(normalized);
 const signingKey=encodeRFC3986(env.consumerSecret)+"&"+encodeRFC3986(env.tokenSecret);
 oauth.oauth_signature=createHmac("sha1",signingKey).update(base).digest("base64");
 return "OAuth "+Object.keys(oauth).sort().map(k=>encodeRFC3986(k)+'="'+encodeRFC3986(oauth[k])+'"').join(", ");
}
export function buildReplyDraft(text:string,topic:string){
 const clean=text.replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim();
 const first=clean.length>150?clean.slice(0,147)+"...":clean;
 return ("Interesting point on "+topic+". "+(first? "The key detail here is: "+first+" ":"")+"What signal would you watch next?").slice(0,270);
}
export function buildPost(title:string,summary=""){
 const base="Crypto watch: "+title.replace(/\s+/g," ").trim();
 const context=summary.replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim();
 return (base+(context? " — "+context.slice(0,90):"")+". What data point would confirm this trend?").slice(0,280);
}
