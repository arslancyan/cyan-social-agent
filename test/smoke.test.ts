import {test} from "node:test";
import assert from "node:assert/strict";
import {contentQuality,priorityDecision,riskCheck,scoreTrend} from "../lib/scoring";

test("trend scoring stays bounded and reacts to strong signals",()=>{
  const score=scoreTrend({velocity:100,engagement:100,freshness:100,relevance:100,views:1_000_000});
  assert.equal(score,100);
});

test("priority engine interrupts smart/autonomous modes for breakout trends",()=>{
  assert.equal(priorityDecision(90,0,"smart").interrupt,true);
  assert.equal(priorityDecision(90,0,"conservative").interrupt,false);
});

test("risk gate catches certainty-heavy promotional language",()=>{
  assert.equal(riskCheck("This token will pump 100%!").risk,"high");
  assert.equal(riskCheck("Here is what the source confirms.").risk,"low");
});

test("platform quality scoring recognizes a hook and CTA",()=>{
  const result=contentQuality("What changed? Follow for the next update.","X");
  assert.equal(result.hasHook,true);
  assert.equal(result.hasCta,true);
  assert.ok(result.score>=70);
});
