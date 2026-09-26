/** No vendor is installed/configured. Future adapters must return schema-validated observations, not decisions. */
export interface ModerationAIProvider {
  readonly name:string; readonly version:string;
  readonly locality:'KZ'|'external'|'unavailable';
  readonly supportsRUandKK:boolean;
  analyzeText(data:{title:string;description:string;attributes:string;category:string},signal:AbortSignal):Promise<unknown>;
  analyzeImage(data:{bytes:Uint8Array;mimeType:string;category:string;title:string},signal:AbortSignal):Promise<unknown>;
  healthCheck(signal:AbortSignal):Promise<boolean>;
}
export interface ModerationOCRProvider {
  readonly name:string; readonly version:string; readonly locality:'KZ'|'external'|'unavailable'; readonly supportsRUandKK:boolean;
  extractImageText(data:{bytes:Uint8Array;mimeType:string},signal:AbortSignal):Promise<unknown>;
}
export class ProviderUnavailable extends Error { constructor(){super('provider_unavailable');} }
export class UnavailableAIProvider implements ModerationAIProvider {
  readonly name='unavailable';readonly version='none';readonly locality='unavailable';readonly supportsRUandKK=false;
  async analyzeText():Promise<never>{throw new ProviderUnavailable();}
  async analyzeImage():Promise<never>{throw new ProviderUnavailable();}
  async healthCheck(){return false;}
}
export class UnavailableOCRProvider implements ModerationOCRProvider {
  readonly name='unavailable';readonly version='none';readonly locality='unavailable';readonly supportsRUandKK=false;
  async extractImageText():Promise<never>{throw new ProviderUnavailable();}
}
export async function bounded<T>(operation:(signal:AbortSignal)=>Promise<T>,milliseconds=8000):Promise<T>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('provider_timeout'));},milliseconds);})]);}
  finally{if(timer)clearTimeout(timer);controller.abort();}
}
