import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer,get} from 'node:http';
import {build} from 'esbuild';
const root=resolve('.'),out=resolve(process.env.JEVU_CHAT_OUTPUT||'artifacts/jevu-chat-20260913');await mkdir(out,{recursive:true});
const candidates=[process.env.JEVU_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].filter(Boolean);
let browser;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){browser=path;break;}assert.ok(browser,'An installed Chromium is required');
const mocks={
 'lucide-react':`export {default as MoreHorizontal} from "./node_modules/lucide-react/dist/esm/icons/ellipsis.mjs";export {default as Home} from "./node_modules/lucide-react/dist/esm/icons/house.mjs";export {default as UserRound} from "./node_modules/lucide-react/dist/esm/icons/user-round.mjs";export {default as CheckCheck} from "./node_modules/lucide-react/dist/esm/icons/check-check.mjs";export {default as Check} from "./node_modules/lucide-react/dist/esm/icons/check.mjs";export {default as ChevronDown} from "./node_modules/lucide-react/dist/esm/icons/chevron-down.mjs";export {default as ChevronLeft} from "./node_modules/lucide-react/dist/esm/icons/chevron-left.mjs";export {default as Heart} from "./node_modules/lucide-react/dist/esm/icons/heart.mjs";export {default as MessageCircle} from "./node_modules/lucide-react/dist/esm/icons/message-circle.mjs";export {default as Pencil} from "./node_modules/lucide-react/dist/esm/icons/pencil.mjs";export {default as Plus} from "./node_modules/lucide-react/dist/esm/icons/plus.mjs";export {default as Send} from "./node_modules/lucide-react/dist/esm/icons/send.mjs";export {default as Trash2} from "./node_modules/lucide-react/dist/esm/icons/trash-2.mjs";export {default as X} from "./node_modules/lucide-react/dist/esm/icons/x.mjs";`,
 'next/navigation':`export const usePathname=()=>'/messages/test';export const useRouter=()=>({back:()=>{},replace:()=>{}});`,
 '@/components/app-link':`import React from 'react';export const AppLink=({prefetch,children,...props})=><a {...props}>{children}</a>;`,
 '@/components/i18n-provider':`import {translate} from './lib/i18n/messages';export const useI18n=()=>({t:(key)=>translate('ru',key),locale:'ru'});`,
 '@/lib/supabase/browser':`export const getSupabaseBrowserClient=()=>window.client;`,
 '@/lib/data/supabase/chat':`
 const wait=async kind=>{if(window.delayAction)await new Promise(r=>setTimeout(r,window.delayAction));if(window.fail===kind)throw Error('synthetic transport failure');};
 export const sendTextMessage=async(c,cid,uid,body,id)=>{await wait('send');const row={id,body,sender_id:uid,created_at:new Date().toISOString()};window.rows.push(row);window.lastMutation={kind:'send',row};return row;};
 export const editTextMessage=async(c,cid,id,body)=>{await wait('edit');const row={...window.rows.find(r=>r.id===id),body,edited_at:new Date().toISOString()};window.rows=window.rows.map(r=>r.id===id?row:r);window.lastMutation={kind:'edit',row};return row;};
 export const deleteTextMessage=async(c,cid,id)=>{await wait('delete');const row={...window.rows.find(r=>r.id===id),body:'[deleted]',deleted_at:new Date().toISOString()};window.rows=window.rows.map(r=>r.id===id?row:r);window.lastMutation={kind:'delete',row};return row;};
 export const syncMessageChanges=async(c,cid,known)=>window.rows.filter(r=>known.some(k=>k.id===r.id&&(k.editedAt!==r.edited_at||k.deletedAt!==r.deleted_at)));
 export const markConversationRead=async()=>{};
 export const readMessagePage=async(c,cid,{before,after}={})=>{const list=window.rows.filter(r=>before?r.created_at<before.sentAt:after?r.created_at>after.sentAt:true);return {rows:after?list.slice(0,100):list.slice(-100),hasMore:list.length>100};};`
};
// Real production components and CSS; only Auth/network/router boundaries are fixtures.
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {UserRound,ChevronLeft} from 'lucide-react';import {ConversationThread} from './components/conversation-thread';import {ChatShell} from './components/chat-shell';import {MobileNav} from './components/mobile-nav';
window.rows=Array.from({length:Number(new URLSearchParams(location.search).get("count")??150)},(_,i)=>({id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),body:i===148?'URL https://jevu.kz/'+('длинное'.repeat(25))+' 😀\\nВторая строка':'Сообщение '+i,sender_id:i%2===0?'a':'b',created_at:new Date(Date.UTC(2026,8,1,0,i)).toISOString()}));
window.events={};window.client={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{const q={select:()=>q,eq:()=>q,abortSignal:()=>q,maybeSingle:async()=>({data:{last_read_at:'2026-09-02'},error:null})};return q;},channel:()=>{const ch={on:(type,filter,cb)=>{window.events[filter.event]=cb;return ch},subscribe:cb=>{window.subscribed=cb;cb('SUBSCRIBED');return ch}};return ch;},removeChannel:async()=>{}};
const conversation={id:'test',peerId:'b',peerName:'Собеседник',canSend:true,hasOlderMessages:window.rows.length>100,messages:window.rows.slice(-100).map(r=>({id:r.id,body:r.body,sentAt:r.created_at,own:r.sender_id==='a',read:true}))};
window.remoteChange=(kind,row)=>{window.rows=window.rows.some(r=>r.id===row.id)?window.rows.map(r=>r.id===row.id?row:r):[...window.rows,row];window.events[kind]?.({new:row});};
function App(){return <ChatShell><header className="site-header"><div className="header-inner">JEVU</div></header><main className="conversation-page"><section className="conversation conversation-standalone"><header className="conversation-header"><button className="chat-back" aria-label="Назад"><ChevronLeft size={21}/></button><span className="chat-avatar"><UserRound size={21}/></span><div className="conversation-peer"><h1>Собеседник</h1><small>Объявление — длинное название</small></div></header><ConversationThread conversation={conversation} currentUserId="a"/></section></main><MobileNav/></ChatShell>};createRoot(document.getElementById('app')).render(<App/>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'chat-test-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
const css=(await readFile('app/globals.css','utf8')).replace('@import "tailwindcss";','');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':req.url==='/test.css'?'text/css':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].contents:req.url==='/test.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/test.css"><div id="app"></div><script src="/test.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(out,'chat-browser-')),child=spawn(browser,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));const json=url=>new Promise((r,j)=>get(url,res=>{let s='';res.on('data',x=>s+=x);res.on('end',()=>r(JSON.parse(s)));}).on('error',j));let socket;
try{
 let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>+x.split('\n')[0],()=>0);if(!port)await delay(100);}assert.ok(port);
 const page=(await json('http://127.0.0.1:'+port+'/json/list')).find(p=>p.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});let id=0;const pending=new Map(),errors=[],results=[];
 socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout: '+method))},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression);};
 await send('Page.enable');await send('Runtime.enable');
 

 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const text=async value=>{await evaluate(`document.querySelector('textarea').focus()`);await send('Input.insertText',{text:value});};

 if(process.env.JEVU_CHAT_MENU_CHECK==='1') {
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:origin});await until(`document.querySelectorAll('.message-bubble').length===100`);
  await evaluate(`window.remoteChange('INSERT',{id:'last-own',body:'Последнее собственное сообщение',sender_id:'a',created_at:'2026-10-01T00:00:00Z'})`);
  await until(`document.querySelectorAll('.message-bubble').length===101`);await click('.chat-message-row:last-child .chat-message-more');await until(`!!document.querySelector('[role=menu]')`);
  const geometry=await evaluate(`({menuBottom:document.querySelector('[role=menu]').getBoundingClientRect().bottom,viewportBottom:document.querySelector('.chat-live-thread').getBoundingClientRect().bottom})`);
  console.log(JSON.stringify(geometry));assert.ok(geometry.menuBottom<=geometry.viewportBottom+1,'Actions on the last message must remain visible');
  await send('Browser.close').catch(()=>{});
 } else {
 for(const [width,height,mobile] of [[390,844,true],[360,800,true],[430,932,true],[1280,900,false]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
   await send('Page.navigate',{url:origin});await until(`document.querySelectorAll('.message-bubble').length===100`);
   const geometry=await evaluate(`(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {x:x.x,y:x.y,w:x.width,h:x.height,b:x.bottom}};return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight,horizontal:document.documentElement.scrollWidth,composer:r('.chat-composer-wrap'),nav:r('.mobile-bottom-nav'),avatar:r('.chat-avatar'),icon:r('.chat-avatar svg'),input:r('textarea'),send:r('.send-button'),thread:r('.chat-live-thread')}})()`);
   assert.equal(geometry.horizontal,width);assert.ok(geometry.scroll<=height+1);assert.equal(geometry.avatar.w,44);assert.equal(geometry.avatar.h,44);
   assert.ok(Math.abs(geometry.icon.x+geometry.icon.w/2-geometry.avatar.x-22)<1);assert.ok(Math.abs(geometry.icon.y+geometry.icon.h/2-geometry.avatar.y-22)<1);
   assert.equal(geometry.input.h,48);assert.equal(geometry.send.w,48);assert.ok(geometry.composer.b<=height+1);
   if(mobile)assert.ok(geometry.composer.b<=geometry.nav.y+1);
   const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'chat-'+width+'.png'),Buffer.from(shot.data,'base64'));
   await click('.chat-history-button');await until(`document.querySelectorAll('.message-bubble').length===150`);
   assert.equal(await evaluate(`document.documentElement.scrollHeight`),height);
   await text('Строка\n'.repeat(14));assert.ok(await evaluate(`document.querySelector('textarea').clientHeight<=144&&getComputedStyle(document.querySelector('textarea')).overflowY==='auto'`));
   results.push({width,height,geometry,history150:'PASS',autosize:'PASS'});
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:origin});await until(`document.querySelectorAll('.message-bubble').length===100`);
 assert.equal(await evaluate(`document.querySelectorAll('.is-peer .chat-message-more').length`),0);
 // Composer errors preserve the draft; slow retries do not duplicate a send.
 await text('Черновик до редактирования');await evaluate(`window.fail='send'`);await click('.send-button');await until(`document.querySelector('.composer-status')?.textContent.includes('Не удалось')`);
 assert.equal(await evaluate(`document.querySelector('textarea').value`),'Черновик до редактирования');
 await evaluate(`window.fail=null`);
 await click('.is-own:last-of-type .chat-message-more').catch(()=>click('.is-own .chat-message-more'));
 await until(`!!document.querySelector('[role=menuitem]')`);await click('[role=menuitem]');await until(`!!document.querySelector('.chat-edit-banner')`);
 await click('.chat-edit-banner button');assert.equal(await evaluate(`document.querySelector('textarea').value`),'Черновик до редактирования');
 await click('.is-own .chat-message-more');await click('[role=menuitem]');await text(' — исправлено');await evaluate(`window.fail='edit'`);await click('.send-button');await until(`document.querySelector('.composer-status')?.textContent.includes('Не удалось сохранить')`);
 assert.ok(await evaluate(`document.querySelector('textarea').value.includes('исправлено')`));
 await evaluate(`window.fail=null`);await click('.send-button');await until(`!document.querySelector('.chat-edit-banner')`);
 assert.equal(await evaluate(`window.lastMutation.kind`),'edit');assert.ok(await evaluate(`Array.from(document.querySelectorAll('.chat-message-meta')).some(x=>x.textContent.includes('изменено'))`));
 // Realtime UPDATE, then stale history cannot restore the old text.
 await evaluate(`window.remoteChange('UPDATE',{...window.rows[148],body:'Remote edit',edited_at:'2026-10-01T00:00:00Z'})`);await until(`document.body.textContent.includes('Remote edit')`);
 await evaluate(`window.remoteChange('UPDATE',{...window.rows[148],body:'[deleted]',deleted_at:'2026-10-02T00:00:00Z'})`);await until(`document.body.textContent.includes('Сообщение удалено')&&!document.body.textContent.includes('Remote edit')`);
 // Touch swipe reveals only; a separate click is required to delete.
 await evaluate(`document.querySelector('.chat-live-thread').scrollTop=0`);
 const touch=async(dx,dy)=>{const p=await evaluate(`(()=>{const r=document.querySelector('.is-own .message-bubble').getBoundingClientRect();return {x:r.right-15,y:r.top+12}})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});for(let i=1;i<=5;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx*i/5,y:p.y+dy*i/5}]});await delay(25);}await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await touch(-70,2);await until(`!!document.querySelector('.chat-trash-action')`);assert.equal(await evaluate(`window.lastMutation.kind`),'edit');
 await evaluate(`window.fail='delete'`);await click('.chat-trash-action');await until(`document.querySelector('[role=alert]')?.textContent.includes('Не удалось удалить')`);assert.ok(await evaluate(`!!document.querySelector('.chat-trash-action')`));
 await evaluate(`window.fail=null`);await click('.chat-trash-action');await until(`!document.querySelector('.chat-trash-action')`);assert.equal(await evaluate(`window.lastMutation.kind`),'delete');
 await touch(-4,80);assert.equal(await evaluate(`!!document.querySelector('.chat-trash-action')`),false);
 // Reconnection reconciles a change without an event and does not duplicate history.
 await evaluate(`window.rows[146]={...window.rows[146],body:'Recovered after reconnect',edited_at:'2026-10-03T00:00:00Z'};window.subscribed('SUBSCRIBED');dispatchEvent(new Event('online'))`);
 await until(`document.body.textContent.includes('Recovered after reconnect')`);

 // Empty and single-message conversations retain a usable composer.
 for(const count of [0,1]){
   await send('Page.navigate',{url:origin+'/?count='+count});await until(`!!document.querySelector('textarea')`);
   assert.equal(await evaluate(`document.querySelectorAll('.message-bubble').length`),count);
   assert.equal(await evaluate(`!!document.querySelector('.chat-history-button')`),false);
   await text('Проверка 😀');await evaluate(`window.delayAction=300`);await click('.send-button');await click('.send-button');
   await until(`document.querySelectorAll('.message-bubble').length===${count+1}`);
   assert.equal(await evaluate(`window.rows.length`),count+1);
 }
 // A reduced mobile visual area remains bounded while typing (not a physical OS keyboard test).
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:500,deviceScaleFactor:1,mobile:true});
 await text('Клавиатура');await delay(100);
 assert.ok(await evaluate(`document.querySelector('.chat-composer-wrap').getBoundingClientRect().bottom<=document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top+1`));
 assert.equal(await evaluate(`document.documentElement.scrollHeight`),500);
 const keyboard=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'chat-reduced-viewport.png'),Buffer.from(keyboard.data,'base64'));
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'chat-browser-results.json'),JSON.stringify({environment:'local Chromium; actual production components/CSS with isolated transport fixtures; not a physical iPhone or production Supabase test',results,edit:'PASS',delete:'PASS',swipe:'PASS',verticalScroll:'PASS',errorsPreserveDraft:'PASS',realtimeMerge:'PASS',reconnect:'PASS',errors},null,2));
 console.log(JSON.stringify({status:'PASS',viewports:results.length,edit:true,delete:true,swipe:true,reconnect:true,errors:[]}));await send('Browser.close').catch(()=>{});
}
}finally{socket?.close();child.kill();server.close();}
