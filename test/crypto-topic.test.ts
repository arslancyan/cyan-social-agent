import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {isCryptoContent,filterCryptoTopics} from "../lib/crypto-topic";

describe("crypto-only content policy",()=>{
 it("accepts common crypto topics",()=>{
  for(const topic of ["Bitcoin ETF flows","Solana memecoin activity","Ethereum staking","DeFi liquidity","USDC stablecoin adoption","NFT marketplace on Base"]) assert.equal(isCryptoContent(topic),true,topic);
 });
 it("rejects unrelated topics",()=>{
  for(const topic of ["Weekend travel ideas","Football match recap","Healthy breakfast recipe","AI art workflow"]) assert.equal(isCryptoContent(topic),false,topic);
 });
 it("filters trend items without crypto context",()=>{
  const items=filterCryptoTopics([{title:"Bitcoin rises",summary:"Market update"},{title:"Football final",summary:"Sports news"},{title:"Solana DEX volume",summary:"DeFi activity"}]);
  assert.deepEqual(items.map(x=>x.title),["Bitcoin rises","Solana DEX volume"]);
 });
});
