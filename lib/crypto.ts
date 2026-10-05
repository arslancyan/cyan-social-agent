const encoder=new TextEncoder();

function key(){
 const raw=process.env.CYAN_TOKEN_ENCRYPTION_KEY;
 if(!raw) throw new Error("CYAN_TOKEN_ENCRYPTION_KEY is not configured");
 const bytes=Uint8Array.from(Buffer.from(raw,"base64"));
 if(bytes.length!==32) throw new Error("CYAN_TOKEN_ENCRYPTION_KEY must be 32 bytes base64 encoded");
 return crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["encrypt","decrypt"]);
}

export async function encryptSecret(value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const k=await key();
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},k,encoder.encode(value)));
 return Buffer.concat([Buffer.from(iv),Buffer.from(encrypted)]).toString("base64");
}

export async function decryptSecret(value:string){
 const raw=Buffer.from(value,"base64");
 const iv=raw.subarray(0,12),data=raw.subarray(12);
 const k=await key();
 const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv},k,data);
 return new TextDecoder().decode(decrypted);
}