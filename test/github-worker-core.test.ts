import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {isCrypto,topicOf,buildPost,buildReplyDraft,oauth1Header,POST_INTERVAL_MS,VIRAL_THRESHOLD,CRYPTO_QUERY} from "../lib/github-worker-core";

describe("GitHub worker settings",()=>{
 it("uses three-hour posting and 500K viral threshold",()=>{
  assert.equal(POST_INTERVAL_MS,3*60*60*1000);
  assert.equal(VIRAL_THRESHOLD,500000);
  assert.match(CRYPTO_QUERY,/lang:en/);
 });
});
describe("crypto-only guard",()=>{
 it("accepts configured crypto topics",()=>{
  for(const s of ["Bitcoin ETF flows","Ethereum staking","Solana DeFi","memecoin launch","NFTs on Ethereum"])assert.equal(isCrypto(s),true,s);
 });
 it("rejects unrelated topics",()=>{
  for(const s of ["football highlights","weekend travel","healthy breakfast"])assert.equal(isCrypto(s),false,s);
 });
});
describe("draft helpers",()=>{
 it("creates short English post and reply drafts",()=>{
  assert.ok(buildPost("Bitcoin ETF inflows").length<=280);
  assert.match(buildReplyDraft("Solana DEX liquidity grows","Solana"),/Solana/);
  assert.equal(topicOf("NFT marketplace"),"NFTs");
 });
 it("signs X requests with OAuth 1.0a",()=>{
  const header=oauth1Header("GET","https://api.x.com/2/tweets/search/recent",{query:"bitcoin",max_results:"10"},{consumerKey:"key",consumerSecret:"secret",accessToken:"token",tokenSecret:"tokensecret"},"nonce","1700000000");
  assert.match(header,/OAuth /);
  assert.match(header,/oauth_signature=/);
  assert.match(header,/oauth_consumer_key="key"/);
 });
});
