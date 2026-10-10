import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {isCryptoContent,filterCryptoTopics} from "../lib/crypto-topic";
import {POST_INTERVAL_HOURS,VIRAL_VIEWS_THRESHOLD,CONTENT_LANGUAGE,CRYPTO_TOPICS} from "../lib/crypto-agent-config";

describe("CYAN crypto agent configuration",()=>{
 it("uses the requested schedule, viral threshold, English, and crypto topics",()=>{
  assert.equal(POST_INTERVAL_HOURS,3);
  assert.equal(VIRAL_VIEWS_THRESHOLD,500000);
  assert.equal(CONTENT_LANGUAGE,"en");
  assert.deepEqual(CRYPTO_TOPICS,["Bitcoin","Ethereum","Solana","DeFi","memecoins","NFTs"]);
 });
});

describe("crypto-only content policy",()=>{
 it("accepts common crypto topics",()=>{
  for(const topic of ["Bitcoin ETF flows","Solana memecoin activity","Ethereum staking","DeFi liquidity","USDC stablecoin adoption","NFT marketplace on Base","NFTs on Solana"]) assert.equal(isCryptoContent(topic),true,topic);
 });
 it("rejects unrelated topics",()=>{
  for(const topic of ["Weekend travel ideas","Football match recap","Healthy breakfast recipe","AI art workflow"]) assert.equal(isCryptoContent(topic),false,topic);
 });
 it("filters trend items without crypto context",()=>{
  const items=filterCryptoTopics([{title:"Bitcoin rises",summary:"Market update"},{title:"Football final",summary:"Sports news"},{title:"Solana DEX volume",summary:"DeFi activity"}]);
  assert.deepEqual(items.map(x=>x.title),["Bitcoin rises","Solana DEX volume"]);
 });
});
