const CRYPTO_TERMS = [
 "crypto","cryptocurrency","bitcoin","btc","ethereum","eth","solana","sol","memecoin","meme coin","defi","web3","blockchain","on-chain","onchain","token","tokenomics","airdrop","staking","validator","wallet","stablecoin","usdc","usdt","nft","dex","cex","liquidity","market cap","gas fee","layer 2","l2","rollup","base chain","ethereum etf","bitcoin etf","altcoin","bull market","bear market","crypto market","crypto trading","crypto regulation","binance","coinbase","uniswap","raydium","pump.fun","fren","donkee","ponke","pepe coin"
];
const NON_CRYPTO_CONTEXT = /\b(crypto|cryptocurrency|bitcoin|btc|ethereum|eth|solana|memecoin|meme coin|defi|web3|blockchain|on[ -]?chain|tokenomics|airdrop|staking|stablecoin|usdc|usdt|altcoin|crypto market|crypto trading|crypto regulation|binance|coinbase|uniswap|raydium|pump\.fun|nft|dex|cex|layer 2|rollup)\b/i;
export function isCryptoContent(text: string): boolean {
 if (typeof text !== "string" || !text.trim()) return false;
 return NON_CRYPTO_CONTEXT.test(text);
}
export function filterCryptoTopics<T extends {title:string;summary?:string}>(items:T[]):T[] {
 return items.filter(item => isCryptoContent(item.title+" "+(item.summary||"")));
}
