// Controlled hooks: intentionally no browser, credentials or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
export const tick=()=>new Promise(resolve=>setImmediate(resolve));
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const find=(n,p)=>n&&typeof n==='object'?[...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>find(c,p))]:[];
const text=n=>n==null||n===false?'':typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(' '):String(n);
export async function hooks(file,name,extra={}) {
  const code=ts.transpileModule(await readFile(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const slots=[],effects=[],timers=new Map(),navigations=[];let cursor=0,tree,mounted=true,lateWrites=0,timerId=0;
  const react={useRef:v=>{const i=cursor++;return slots[i]??={current:v};},
    useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{if(!mounted)lateWrites++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useEffect:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
  const jsx=(type,props)=>({type,props}),modules={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'lucide-react':{MessageCircle:'svg',LogOut:'svg'},
    '@/components/app-link':{AppLink:'a'},'@/components/listing-phone-button':{ListingPhoneButton:'phone'},'@/components/i18n-provider':{useI18n:()=>({t:k=>k})},...extra};
  const api={};new Function('require','exports','setTimeout','clearTimeout','window',code)(key=>{assert.ok(key in modules,key);return modules[key];},api,
    (fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},key=>timers.delete(key),{location:{assign:h=>navigations.push(h),replace:h=>navigations.push(h)}});
  return {render(props={listingId:'10000000-0000-4000-8000-000000000001'}){cursor=0;tree=api[name](props);for(const f of effects.splice(0))f();return tree;},
    nodes:p=>find(tree,p),button:()=>find(tree,n=>n.type==='button')[0],text:()=>text(tree),timers,navigations,get lateWrites(){return lateWrites;},
    fire(ms=12000){for(const [k,t] of [...timers])if(t.ms===ms){timers.delete(k);t.fn();}},unmount(){mounted=false;for(const s of slots)s?.cleanup?.();}};
}
