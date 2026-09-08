import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/reference-data/catalog.ts';
import {createSingleFlightTtlLoader} from '../lib/reference-data/cache.ts';

test('actual catalog directory exposes a failed reference read and retries without remount or losing query',async()=>{
  const category={id:'transport',slug:'transport',parentId:null,name:{ru:'Транспорт',kk:'Көлік'},sortOrder:1};
  let calls=0,cursor=0;const state=[],deps=[],effects=[];
  const load=createSingleFlightTtlLoader(async()=>{calls++;if(calls===1)throw new Error('fixture outage');return {status:'ready',data:{categories:[category]}};},1000);
  const require=createRequire(import.meta.url),exports={};
  const source=await readFile(new URL('../components/category-directory.tsx',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,Set,require(name){
    if(name==='react')return {
      useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
      useMemo:fn=>fn(),useDeferredValue:value=>value,
      useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((value,index)=>!Object.is(value,deps[i][index])))effects.push(fn);deps[i]=next;},
    };
    if(name.includes('/reference-data/catalog'))return catalog;
    if(name.includes('/reference-data/browser'))return {loadBrowserCategoryReferences:load};
    if(name.includes('/location-picker'))return {useStoredLocation:()=>''};
    if(name.includes('/i18n-provider'))return {useI18n:()=>({locale:'ru',t:key=>key})};
    if(name.includes('/i18n/config'))return {localize:value=>value?.ru??''};
    if(name.includes('/category-link'))return {CategoryLink:'a'};
    if(name.includes('/category-icon'))return {CategoryIcon:'span'};
    return require(name);
  }});
  const render=()=>{cursor=0;return exports.CategoryDirectory({initialData:{categories:[category]}});};
  const flush=async()=>{for(const effect of effects.splice(0))effect();for(let i=0;i<30;i++)await Promise.resolve();};
  const find=(element,predicate)=>{if(!element)return null;if(predicate(element))return element;for(const child of [element.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}return null;};
  render();await flush();let tree=render();
  const retry=find(tree,node=>node.type==='button'&&node.props.children==='common.retry');
  assert.ok(retry,'reference failure must not leave a permanently root-only catalog with no retry');
  find(tree,node=>node.type==='input').props.onChange({target:{value:'тра'}});
  retry.props.onClick();render();await flush();tree=render();
  assert.equal(calls,2,'retry must issue a fresh reference read after failure eviction');
  assert.equal(find(tree,node=>node.type==='input').props.value,'тра');
  assert.equal(find(tree,node=>node.props?.['data-marketo-error']===true),null);
});
