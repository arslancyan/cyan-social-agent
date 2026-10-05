export function scoreTrend(input:{velocity:number;engagement:number;freshness:number;relevance:number;views?:number}){
 const clamp=(n:number)=>Math.max(0,Math.min(100,n));
 const viewScore=input.views?Math.min(100,(input.views/1_000_000)*100):0;
 return Math.round(clamp(input.velocity*.30+input.engagement*.20+input.freshness*.15+input.relevance*.20+viewScore*.15));
}
export function priorityDecision(score:number,views=0,mode:"conservative"|"smart"|"autonomous"="smart"){
 const priority=score>=90?"viral":score>=75?"hot":score>=60?"trending":"normal";
 const interrupt=mode!=="conservative" && (score>=85 || views>=1_000_000);
 const reason=priority==="viral"?"Breakout trend detected: prioritize fresh content.":priority==="hot"?"High-velocity trend detected: consider moving flexible posts.":priority==="trending"?"Growing trend detected: monitor before interrupting the calendar.":"No schedule interruption recommended.";
 return {trendScore:score,priority,interrupt,reason};
}
export function riskCheck(text:string){const claims=text.split(/[.!?]+/).filter(Boolean);const risky=/guaranteed|risk-free|insider|100%|will pump|buy now/i;return {risk:claims.some(c=>risky.test(c))?"high":"low",reason:"CYAN flags certainty-heavy or promotional claims for human review."};}
