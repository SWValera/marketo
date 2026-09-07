// Controlled hook tests, not browser/PWA or real Turnstile tests.
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const code=ts.transpileModule(await readFile(new URL("../components/listing-phone-button.tsx",import.meta.url),"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness() {
  const slots=[],effects=[],requests=[],challenges=[];let cursor=0,tree;
  const original={window:globalThis.window,fetch:globalThis.fetch};
  const window=new EventTarget();globalThis.window=window;
  globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
  const hooks={useRef:value=>{const i=cursor++;return slots[i]??={current:value};},
    useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],v=>{slots[i]=typeof v==="function"?v(slots[i]):v;}];},
    useEffect:(effect,deps)=>{const i=cursor++;const old=slots[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){
      slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=effect();});}},
  };
  const jsx=(type,props)=>{if(props?.ref)props.ref.current={};return {type,props};};
  const modules={react:hooks,"react/jsx-runtime":{jsx,jsxs:jsx},"lucide-react":{Phone:"svg"},
    "@/components/i18n-provider":{useI18n:()=>({t:key=>key})},
    "@/lib/phone/challenge":{solvePhoneChallenge:async(...args)=>{challenges.push(args);return "dummy-token";}},
  };
  const component={};new Function("require","exports",code)(name=>{assert.ok(name in modules,name);return modules[name];},component);
  function render(listingId="10000000-0000-4000-8000-000000000001"){cursor=0;tree=component.ListingPhoneButton({listingId});for(const effect of effects.splice(0))effect();return tree;}
  const all=(node,predicate)=>node&&typeof node==="object"?[...(predicate(node)?[node]:[]),...([node.props?.children].flat(Infinity)).flatMap(child=>all(child,predicate))]:[];
  const button=()=>all(tree,n=>n.type==="button")[0];
  async function start(){const pending=button().props.onClick();requests.at(-1).resolve(Response.json({siteKey:"dummy-public-key"}));await tick();return {pending,request:requests.at(-1)};}
  function cleanup(){for(const slot of slots)slot?.cleanup?.();globalThis.window=original.window;globalThis.fetch=original.fetch;}
  return {render,requests,challenges,window,cleanup,button,start,phones:()=>all(tree,n=>n.type==="a"&&n.props.href?.startsWith("tel:"))};
}
test("explicit click only, duplicate click single flight, fresh challenge then deliberate tel tap",async()=>{
  const h=harness();try {
    h.render();assert.equal(h.requests.length,0);assert.equal(h.phones().length,0);
    const click=h.button().props.onClick,pending=click();await click();assert.equal(h.requests.length,1);
    h.requests[0].resolve(Response.json({siteKey:"dummy-public-key"}));await tick();
    assert.equal(h.challenges.length,1);assert.equal(h.requests.length,2);
    assert.equal(h.requests[1].options.method,"POST");assert.deepEqual(JSON.parse(h.requests[1].options.body),{token:"dummy-token"});
    h.requests[1].resolve(Response.json({phone:"+77001112233"}));await pending;h.render();
    assert.equal(h.phones()[0].props.href,"tel:+77001112233");
  }finally{h.cleanup();}
});
test("pagehide or listing change clears pending results even if a late response arrives",async()=>{
  for(const event of ["pagehide","navigation"]) {
    const h=harness();try {
      h.render();const {pending,request}=await h.start();
      if(event==="pagehide")h.window.dispatchEvent(new Event("pagehide"));else h.render("20000000-0000-4000-8000-000000000001");
      assert.equal(request.options.signal.aborted,true);request.resolve(Response.json({phone:"+77001112233"}));await pending;h.render();
      assert.equal(h.phones().length,0);assert.equal(h.button().props.disabled,false);
    }finally{h.cleanup();}
  }
});
test("back-forward lifecycle clears opened numbers and pending requests",async()=>{
  const h=harness();try {
    h.render();const first=await h.start();first.request.resolve(Response.json({phone:"+77001112233"}));await first.pending;h.render();
    h.window.dispatchEvent(new Event("pagehide"));h.render();assert.equal(h.phones().length,0);
    const second=await h.start(),event=new Event("pageshow");Object.defineProperty(event,"persisted",{value:true});h.window.dispatchEvent(event);
    second.request.resolve(Response.json({phone:"+77001112233"}));await second.pending;h.render();assert.equal(h.phones().length,0);
  }finally{h.cleanup();}
});
test("failure can retry; quota cooldown prevents another challenge",async()=>{
  const h=harness();try {
    h.render();const first=await h.start();first.request.resolve(Response.json({error:"failed"},{status:503}));await first.pending;h.render();
    assert.equal(h.button().props.disabled,false);assert.equal(h.phones().length,0);
    const second=await h.start();second.request.resolve(Response.json({error:"limited",retryAfter:60},{status:429}));await second.pending;h.render();
    assert.equal(h.button().props.disabled,true);await h.button().props.onClick();assert.equal(h.challenges.length,2);
  }finally{h.cleanup();}
});
