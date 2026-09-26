import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {loadRules} from '../scripts/moderation-benchmark.mjs';import {withLexicalRules,lexicalInventory,LEXICAL_RULESET_VERSION} from '../lib/moderation/rulesets/lexical-v1.ts';
import {compileLexicalRules,evaluateLexical,semanticCallRequired} from '../lib/moderation/lexical.ts';import {lexicalConfigSchema} from '../lib/moderation/lexical-contract.ts';
import {normalizeLexicalText} from '../lib/moderation/normalize.ts';import {moderate} from '../lib/moderation/engine.ts';import {UnavailableAIProvider,UnavailableOCRProvider} from '../lib/moderation/providers.ts';import {enforceShadowDecision} from '../lib/moderation/shadow.ts';
import {runOfflineBenchmark} from '../scripts/moderation-lexical-benchmark.mjs';
const rules=withLexicalRules(await loadRules()),compiled=compileLexicalRules(rules);const check=(text,aiAvailable=true)=>evaluateLexical(text,compiled,{aiAvailable});
for(const text of ['Продам вейп','Вейпы оптом','Одноразки сегодня новые в наличии','Жидкость для вейпа','Продажа электронных сигарет','Продам в е й п','Продам в.е.й.п','Продам в-е-й-п','Продам vейп','Продам вейn','Продам V4PE','Продам в\u200bейп','Вейп сатамын','Электронды темекі сатылады','Temeki satamyn','Продам вейп, қорабы ашылмаған'])test('hard RU/KK/mixed/Latin/obfuscation: '+text,async()=>assert.equal((await check(text)).routing_decision,'DETERMINISTIC_REJECT'));
for(const text of ['Книга о вреде вейпов','Не продаю вейпы, продаю книгу','Ствол дерева для поделок','Игрушечный пистолет для ребёнка','Ойыншық қару сатылады','Продам карту памяти','Сценический макет документа','Продаю учебник: продам вейп — пример фразы'])test('bounded safe or conflicting context: '+text,async()=>assert.notEqual((await check(text)).routing_decision,'DETERMINISTIC_REJECT'));
for(const text of ['Продам боевой пистолет','Сделаю поддельный паспорт','Продам украденные карты','Ұрланған карта деректерін сатамын','Игрушка + продам настоящие патроны'])test('existing policy combination: '+text,async()=>assert.equal((await check(text)).routing_decision,'DETERMINISTIC_REJECT'));
test('suspicious-only, ambiguous hard + prop, unavailable AI fallback; no whole-text offer window',async()=>{
 assert.equal((await check('Есть одноразка')).routing_decision,'SEND_TO_AI');assert.equal((await check('Есть одноразка',false)).routing_decision,'HUMAN_REVIEW');assert.equal((await check('Продам макет боевого пистолета')).routing_decision,'SEND_TO_AI');
 assert.notEqual((await check('Вейп '+Array(20).fill('текст').join(' ')+' продам')).routing_decision,'DETERMINISTIC_REJECT');
 assert.notEqual((await check('Продам телефон. Вейп в комплект не входит')).routing_decision,'DETERMINISTIC_REJECT');
 assert.notEqual((await check('Продам телефон\nВейп обсуждается отдельно')).routing_decision,'DETERMINISTIC_REJECT');
});
test('compiled contract validates codes, versions, safe regex; rule disabled or non-policy cannot hard block',async()=>{
 assert.equal(lexicalInventory().matcher_types.length,8);
 const invalid=structuredClone(rules);invalid[0].config.lexical.rule_code='unknown_code';assert.throws(()=>compileLexicalRules(invalid));
 const mismatch=structuredClone(rules);mismatch[0].ruleset_version='different-version';assert.throws(()=>compileLexicalRules(mismatch));
 const regex=structuredClone(rules[0].config.lexical);regex.patterns=[{code:'evil_regex',type:'regex_safe',level:'suspicious',languages:['ru'],regex:'^(a+)+$'}];assert.equal(lexicalConfigSchema.safeParse(regex).success,false);
 const disabled=rules.map(r=>({...r,enabled:false}));assert.equal((await evaluateLexical('Продам вейп',compileLexicalRules(disabled))).routing_decision,'NO_TEXT_RISK');
 const notPolicy=rules.map(r=>({...r,legal_status:'LEGAL_REVIEW_REQUIRED'}));assert.equal((await evaluateLexical('Продам вейп',compileLexicalRules(notPolicy))).routing_decision,'SEND_TO_AI');
 assert.deepEqual(rules.map(r=>r.ruleset_version),Array(13).fill(LEXICAL_RULESET_VERSION));
});
test('NO_TEXT_RISK is not approval, no fake client lexical result; hard match skips semantic text provider',async()=>{
 const jpeg=await readFile('tests/moderation/benchmark/v1/images/phone.jpg');const snapshot={title:'Телефон',description:'Телефон работает',category_path:[{slug:'phones',ru:'Телефоны',kk:'Телефондар'}],attributes:[{matched_rule:true,ai_safe:true}],images:[{storage_key:'fixture.jpg',width:600,height:380,byte_size:jpeg.length,mime_type:'image/jpeg'}]};
 const base={snapshot,rules,ai:new UnavailableAIProvider(),ocr:new UnavailableOCRProvider(),loadImage:async()=>jpeg,allowExternal:false,fraud:{recent_submissions:0,prior_rejections:0,confirmed_reports:0,duplicate_content:0,reused_images:0},lexical:{routing_decision:'DETERMINISTIC_REJECT'}};
 const clean=await moderate(base);assert.equal(clean.lexical.routing_decision,'NO_TEXT_RISK');assert.equal(enforceShadowDecision(clean).decision,'HUMAN_REVIEW');assert.equal(semanticCallRequired(clean.lexical,true),true);
 let textCalls=0;const hard=await moderate({...base,snapshot:{...snapshot,title:'Продам вейп'},ai:{name:'guard',version:'test',locality:'KZ',supportsRUandKK:true,analyzeText:async()=>{textCalls++;throw Error('must not call');},analyzeImage:async()=>{throw Error('image fixture');}}});
 assert.equal(textCalls,0);assert.equal(hard.decision,'REJECTED');assert.equal(semanticCallRequired(hard.lexical,true),false);assert.equal(hard.findings.find(f=>f.recommended_action==='REJECTED').confidence,1);assert.match(hard.findings[0].user_reason_ru,/правилами JEVU/);
 const hostile=await moderate({...base,snapshot:{...snapshot,title:'Есть одноразка',lexical:{routing_decision:'NO_TEXT_RISK'}}});assert.equal(hostile.lexical.routing_decision,'HUMAN_REVIEW');
 assert.equal(semanticCallRequired(undefined,true),true);
});
test('normalization preserves original meaning input, fixed hash, no sensitive text in result; bounded repeated input',async()=>{
 const text='Продам вейп';const a=await check(text),b=await check(text);assert.equal(a.normalized_text_hash,b.normalized_text_hash);assert.equal(a.normalized_text_hash.length,64);assert.equal(normalizeLexicalText('Обычный телефон').plain,'обычный телефон');assert.ok(!JSON.stringify(a).includes('Продам'));
 await assert.rejects(check('вейп '.repeat(300)),/lexical_match_limit/);
});
test('300-case immutable offline benchmark, no fetch/OpenAI, exact routing strata, known contexts',async()=>{
 const previous=globalThis.fetch;let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('NO_NETWORK');};
 try{const {summary,rows}=await runOfflineBenchmark();assert.equal(rows.length,300);assert.equal(summary.real_openai_calls,0);assert.equal(networkCalls,0);assert.equal(summary.false_hard_rejects.count,0);assert.ok(summary.safe_context.cases>0);assert.equal(Object.values(summary.routes).reduce((a,b)=>a+b,0),300);
 for(const id of ['BENCH-0059','BENCH-0100','BENCH-0128','BENCH-0269'])assert.notEqual(rows.find(r=>r.case_id===id).local.routing_decision,'DETERMINISTIC_REJECT');
 assert.equal(summary.cases_sha256,'17c17356a777740f929a0612f48f7bf7000f37de751b3be57c5b0d37195dec64');
 }finally{globalThis.fetch=previous;}
});
