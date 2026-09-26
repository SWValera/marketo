import type {LexicalRouting,LexicalExecution,LexicalAIState,LexicalResult} from './lexical-contract.ts';
import type {Stage} from './contracts.ts';

/** Execution disposition is local dispatch, not the final publication decision. */
export function resolveLexicalExecution(route:LexicalRouting,ai:LexicalAIState):LexicalExecution{
 if(route==='DETERMINISTIC_REJECT')return {execution_decision:'REJECT',fallback_reason:null};
 if(route==='HUMAN_REVIEW')return {execution_decision:'HUMAN_REVIEW',fallback_reason:null};
 if(route==='NO_TEXT_RISK'||ai==='READY')return {execution_decision:'CONTINUE_PIPELINE',fallback_reason:null};
 return {execution_decision:'HUMAN_REVIEW',fallback_reason:ai==='DISABLED'?'AI_DISABLED':ai==='PROVIDER_ERROR'?'AI_PROVIDER_ERROR':'AI_UNAVAILABLE'};
}
/** Persist through the existing bounded stage metadata contract. No migration or
 * extra stage is needed (seven photos already use all 27 mandatory stage slots).
 * Source rule IDs remain unchanged; canonical families live in immutable config.
 */
export function recordLexicalExecution(local:LexicalResult,stages:Stage[],ai:LexicalAIState){
 Object.assign(local,resolveLexicalExecution(local.lexical_routing_decision,ai));
 const text=stages.find(s=>s.code==='text'),rules=stages.find(s=>s.code==='rules');
 if(!text||!rules)throw Error('missing_lexical_audit_stage');
 text.provider='lexical_route/'+local.lexical_routing_decision;text.version=local.lexical_engine_version+':'+local.normalized_text_hash;
 rules.provider='lexical_execution';rules.version=JSON.stringify({execution_decision:local.execution_decision,fallback_reason:local.fallback_reason});
}
export function readLexicalAudit(stages:Stage[]){
 const text=stages.find(s=>s.code==='text'),rules=stages.find(s=>s.code==='rules');
 if(!text?.provider?.startsWith('lexical_route/')||rules?.provider!=='lexical_execution')return null;
 const route=text.provider.slice('lexical_route/'.length);
 if(!['DETERMINISTIC_REJECT','SEND_TO_AI','HUMAN_REVIEW','NO_TEXT_RISK'].includes(route))throw Error('invalid_lexical_audit');
 const execution=JSON.parse(rules.version??'{}');
 if(!['REJECT','HUMAN_REVIEW','CONTINUE_PIPELINE'].includes(execution.execution_decision)||![null,'AI_DISABLED','AI_UNAVAILABLE','AI_PROVIDER_ERROR'].includes(execution.fallback_reason))throw Error('invalid_lexical_audit');
 return {lexical_routing_decision:route as LexicalRouting,...execution as LexicalExecution,lexical_engine_version:text.version?.split(':')[0],normalized_text_hash:text.version?.split(':')[1]};
}
export function lexicalAIStateAfterShadow(status:string):LexicalAIState{
 if(status==='success')return 'READY';if(status==='disabled')return 'DISABLED';
 return ['configuration_missing','content_unavailable','not_eligible','budget_exhausted'].includes(status)?'UNAVAILABLE':'PROVIDER_ERROR';
}
