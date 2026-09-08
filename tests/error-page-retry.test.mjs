import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

test('the real error screen retry requests fresh RSC, preserving city and filters',async()=>{
  const calls=[];let reset=0;
  const window={location:new URL('https://test.invalid/search?city=fixture&q=car'),__VINEXT_RSC_NAVIGATE__:(...args)=>{calls.push(args);return Promise.resolve();}};
  const require=createRequire(import.meta.url);
  let RetryPage;
  const evaluate=async path=>{
    const source=await readFile(path,'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const exports={};
    vm.runInNewContext(compiled,{exports,window,URL,require(name){
      if(name==='next/navigation')return {usePathname:()=>window.location.pathname,useRouter:()=>({refresh(){calls.push(['fallback']);}})};
      if(name==='@/components/i18n-provider')return {useI18n:()=>({t:key=>key})};
      if(name==='@/components/retry-page')return {RetryPage};
      return require(name);
    }});return exports;
  };
  ({RetryPage}=await evaluate(resolve('components/retry-page.tsx')));
  const {default:ErrorPage}=await evaluate(resolve(process.env.MARKETO_AUDIT_WORKER_ROOT??'.','app/error.tsx'));
  function button(element){
    if(!element)return;
    if(element.type==='button')return element;
    if(element.type===RetryPage)return RetryPage(element.props);
    for(const child of [element.props?.children].flat(Infinity)){const found=button(child);if(found)return found;}
  }
  button(ErrorPage({error:new Error('fixture'),reset(){reset++;}})).props.onClick();
  assert.equal(calls.length,1,'resetting the same rejected React tree is not a data retry');
  assert.deepEqual(Array.from(calls[0]).slice(0,6),[window.location.href,0,'refresh','replace',undefined,false]);
  assert.equal(reset,0);
  calls[0][6]();
  assert.equal(reset,1,'reset follows fresh payload, rather than repeating the rejected tree');
  RetryPage({href:'/search?city=next&q=phone',preserveCurrentQuery:false,children:'retry'}).props.onClick();
  assert.equal(calls.at(-1)[0],'https://test.invalid/search?city=next&q=phone','failed next-query navigation must not retry the previous URL');
  RetryPage({href:'/search',preserveCurrentQuery:false,children:'retry'}).props.onClick();
  assert.equal(calls.at(-1)[0],'https://test.invalid/search','an explicitly cleared query must stay cleared');
});
