export function scoreTrend(input:{velocity:number;engagement:number;freshness:number;relevance:number;views?:number}){
 const clamp=(n:number)=>Math.max(0,Math.min(100,n));
 const viewScore=input.views?Math.min(100,(input.views/1_000_000)*100):0;
 return Math.round(clamp(input.velocity*.30+input.engagement*.20+input.freshness*.15+input.relevance*.20+viewScore*.15));
}
export function priorityDecision(score:number,views=0,mode:"conservative"|"smart"|"autonomous"="smart"){
 const priority=score>=90?"viral":score>=75?"hot":score>=60?"trending":"normal";
 const interrupt=mode!=="conservative"&&(score>=85||views>=1_000_000);
 const reason=priority==="viral"?"Breakout trend detected: prioritize fresh content.":priority==="hot"?"High-velocity trend detected: consider moving flexible posts.":priority==="trending"?"Growing trend detected: monitor before interrupting the calendar.":"No schedule interruption recommended.";
 return {trendScore:score,priority,interrupt,reason};
}
const risky=/guaranteed|risk-free|insider|100%|will pump|buy now|can't lose|financial advice/i;
export function riskCheck(text:string){const claims=text.split(/[.!?]+/).filter(Boolean);const riskyClaims=claims.filter(c=>risky.test(c));return {risk:riskyClaims.length?"high":"low",reason:riskyClaims.length?"Certainty-heavy or promotional claims require human review.":"No high-risk promotional language detected.",flags:riskyClaims.map(c=>c.trim().slice(0,180))};}
export function contentQuality(text:string,platform:string){
 const t=text.trim();
 const length=t.length;
 const limits:Record<string,[number,number]>= {X:[20,280],TikTok:[40,2200],Instagram:[30,2200],Facebook:[30,5000]};
 const [min,max]=limits[platform]||[20,5000];
 const hasHook=/^.{1,140}(\?|!|:)/s.test(t)||/hook|why|what|how/i.test(t.slice(0,100));
 const hasCta=/\b(comment|follow|save|share|learn more|watch|reply)\b/i.test(t);
 const tooLong=length>max,tooShort=length<min;
 const score=Math.max(0,Math.min(100,Math.round(55+(hasHook?15:0)+(hasCta?8:0)-(tooLong?25:0)-(tooShort?20:0))));
 return {score,hasHook,hasCta,length,tooLong,tooShort};
}
export function platformGuidance(platform:string){return platform==="X"?"Lead with one clear idea, concise hook, and avoid unsupported certainty.":platform==="TikTok"?"Use a spoken hook, short beats, visual cues and one takeaway; avoid fabricated facts.":platform==="Instagram"?"Use a strong first slide/caption hook, readable structure and save-worthy takeaway.":"Use a clear opening, useful context and a natural discussion prompt.";}
