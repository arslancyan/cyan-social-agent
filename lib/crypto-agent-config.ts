export const POST_INTERVAL_HOURS=3;
export const POST_INTERVAL_MS=POST_INTERVAL_HOURS*60*60*1000;
export const VIRAL_VIEWS_THRESHOLD=500_000;
export const VIRAL_SCAN_INTERVAL_MINUTES=15;
export const VIRAL_SCAN_INTERVAL_MS=VIRAL_SCAN_INTERVAL_MINUTES*60*1000;
export const CONTENT_LANGUAGE="en" as const;
export const CRYPTO_TOPICS=["Bitcoin","Ethereum","Solana","DeFi","memecoins","NFTs"] as const;
export const X_CRYPTO_SEARCH_QUERY='(bitcoin OR BTC OR ethereum OR ETH OR solana OR SOL OR DeFi OR memecoin OR "meme coin" OR NFT OR NFTs) -is:retweet lang:en';
