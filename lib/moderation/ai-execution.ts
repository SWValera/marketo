import type {MultimodalModerationProvider} from './providers.ts';
import {AIProviderError,type AIInput,type AICallMetadata} from './ai-contract.ts';
import {emptyShadow,evaluateShadow,type ShadowResult} from './shadow.ts';
import type {Rule,ModerationResult} from './contracts.ts';
/** Reservation is durable BEFORE network I/O; crashes cannot reset the call cap.
 * Scheduler retries reuse the run and its two-attempt ledger. */
export async function executeShadow(input:{provider:MultimodalModerationProvider;data:AIInput;rules:Rule[];base:ModerationResult;reserve:()=>Promise<number|null>;record:(attempt:number,meta:AICallMetadata)=>Promise<void>;signal:AbortSignal;sleep?:(ms:number)=>Promise<void>}):Promise<ShadowResult>{
 const sleep=input.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 for(let retry=0;retry<2;retry++){
  input.signal.throwIfAborted();const attempt=await input.reserve();if(attempt===null)return emptyShadow('budget_exhausted');
  try{
   const response=await input.provider.analyzeListing(input.data,input.signal);
   await input.record(attempt,{...response.metadata,retry_count:attempt-1});
   return evaluateShadow(response.observations,input.rules,input.base);
  }catch(error){
   if(!(error instanceof AIProviderError))throw error; // DB failure: queue retry, never silently approve.
   if(error.metadata)await input.record(attempt,{...error.metadata,retry_count:attempt-1});
   if(!['timeout','network_error','provider_5xx','provider_rate_limit'].includes(error.code)||attempt>=2||retry>=1)return emptyShadow(error.code);
   await sleep(500*2**retry);
  }
 }
 return emptyShadow('budget_exhausted');
}
