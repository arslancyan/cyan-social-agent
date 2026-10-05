import {Draft,Platform} from "./types";

export type ContentFeatures={
 hook:string; topic:string; format:string; length:"short"|"medium"|"long";
 cta:string; sentiment:string; media:"text"|"image"|"video";
};

const pick=(content:string,patterns:[string,RegExp][],fallback:string)=>patterns.find(([,r])=>r.test(content))?.[0]||fallback;

export function classifyContent(content:string,platform:Platform,mediaType?:Draft["mediaType"]):ContentFeatures{
 const text=content.trim(), words=text.split(/\s+/).filter(Boolean).length;
 const hook=pick(text,[["question",/\?/],["contrarian",/\b(but|however|actually|wrong|myth)\b/i],["curiosity",/\b(why|how|secret|truth|reason|what if)\b/i],["news",/\b(today|breaking|latest|update|just in)\b/i]],"statement");
 const topic=pick(text,[["crypto",/\b(bitcoin|btc|ethereum|eth|solana|crypto|memecoin|token|defi|nft)\b/i],["creator",/\b(creator|artist|design|art|animation|content)\b/i],["ai",/\b(ai|artificial intelligence|model|agent|llm|automation)\b/i]],"general");
 const format=pick(text,[["thread",/\b(1\/|thread|part \d|🧵)\b/i],["list",/(^|\n)\s*[-*•]\s|\b(top|steps|ways|reasons)\b/i],["story",/\b(story|journey|lesson|learned)\b/i],["explainer",/\b(explain|explainer|how it works|breakdown)\b/i]],platform==="Instagram"?"caption":platform==="TikTok"?"short-video":"post");
 const length=words<=35?"short":words<=100?"medium":"long";
 const cta=pick(text,[["question",/\?\s*$/],["comment",/\b(comment|tell me|what do you think)\b/i],["follow",/\b(follow|subscribe)\b/i],["click",/\b(link|visit|read more)\b/i]],"none");
 const sentiment=pick(text,[["positive",/\b(great|love|excited|win|growth|good)\b/i],["negative",/\b(risk|warning|bad|fail|loss|problem)\b/i]],"neutral");
 const media=mediaType||"text";
 return{hook,topic,format,length,cta,sentiment,media};
}

export function featureKey(f:ContentFeatures){return [f.hook,f.topic,f.format,f.length,f.cta,f.sentiment,f.media].join("|");}
export function featureSummary(f:ContentFeatures){return `${f.hook} hook · ${f.topic} · ${f.format} · ${f.length} · ${f.cta} CTA · ${f.media}`;}
