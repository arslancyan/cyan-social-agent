const encoder=new TextEncoder();

function key(){
 const raw=process.env.CYAN_TOKEN_ENCRYPTION_KEY;
 if(!raw) throw new Error("CYAN_TOKEN_ENCRYPTION_KEY is not configured");
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length%4!==0) throw new Error("CYAN_TOKEN_ENCRYPTION_KEY must be valid base64");
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
 if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0) throw new Error("Encrypted secret is malformed");
 const raw=Buffer.from(value,"base64");
 if(raw.length<28) throw new Error("Encrypted secret is malformed");
 const iv=raw.subarray(0,12),data=raw.subarray(12);
 const k=await key();
 try{
  const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv},k,data);
  return new TextDecoder().decode(decrypted);
 }catch{
  throw new Error("Unable to decrypt secret");
 }
}