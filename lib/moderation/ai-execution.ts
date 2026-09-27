import type {MultimodalModerationProvider} from './providers.ts';
import {AIProviderError,observationCodes,type AIInput,type AICallMetadata,type AICallResult} from './ai-contract.ts';
import {findingFamilies} from './finding-taxonomy.ts';
import {emptyShadow,evaluateShadow,type ShadowResult} from './shadow.ts';
import type {Rule,ModerationResult} from './contracts.ts';
/** Reservation is durable BEFORE network I/O; crashes cannot reset the call cap.
 * Scheduler retries reuse the run and its two-attempt ledger. */
export async function executeShadow(input:{provider:MultimodalModerationProvider;data:AIInput;rules:Rule[];base:ModerationResult;reserve:()=>Promise<number|null>;record:(attempt:number,meta:AICallMetadata)=>Promise<void>;signal:AbortSignal;sleep?:(ms:number)=>Promise<void>;onValidated?:(response:AICallResult)=>void}):Promise<ShadowResult>{
 const sleep=input.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 // Only trusted local rule output selects these checks, never client-supplied
 // fields. Keep unsupported families unresolved instead of inventing a result.
 const requiredTextChecks=observationCodes.filter(code=>(input.base.lexical?.review_rule_codes??[]).some(rule=>findingFamilies[rule as keyof typeof findingFamilies]===code));
 for(let retry=0;retry<2;retry++){
  input.signal.throwIfAborted();const attempt=await input.reserve();if(attempt===null)return emptyShadow('budget_exhausted');
  try{
   const response=await input.provider.analyzeListing({...input.data,required_text_checks:requiredTextChecks},input.signal);
   await input.record(attempt,{...response.metadata,retry_count:attempt-1});
   input.onValidated?.(response);
   return evaluateShadow(response.observations,input.rules,input.base);
  }catch(error){
   if(!(error instanceof AIProviderError))throw error; // DB failure: queue retry, never silently approve.
   if(error.metadata)await input.record(attempt,{...error.metadata,retry_count:attempt-1});
   if(!['timeout','network_error','provider_5xx','provider_rate_limit','invalid_schema','ocr_failure'].includes(error.code)||attempt>=2||retry>=1)return emptyShadow(error.code);
   await sleep(500*2**retry);
  }
 }
 return emptyShadow('budget_exhausted');
}
