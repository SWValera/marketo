// Isolated browser tests only: never attach to the user's normal Chrome profile.
import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function testBrowser({profile,output='artifacts/browser-tests'}={}){
 await mkdir(output,{recursive:true});
 const candidates=[process.env.JEVU_BROWSER_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
 let executable;for(const path of candidates)if(await access(path).then(()=>true,()=>false)){executable=path;break;}
 assert.ok(executable,'An installed Chromium is required; no download');
 profile=profile?resolve(profile):await mkdtemp(join(resolve(output),'profile-'));
 assert.ok(profile.startsWith(resolve('artifacts')+'/'),'Test profile must be in ignored artifacts');
 await mkdir(profile,{recursive:true});await rm(join(profile,'DevToolsActivePort'),{force:true});
 const child=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-extensions','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket;const pending=new Map(),listeners=new Map();let id=0;
 try{
  let port;for(let i=0;i<100&&!port;i++){port=await readFile(join(profile,'DevToolsActivePort'),'utf8').then(x=>+x.split('\n')[0],()=>0);if(!port)await delay(100);}assert.ok(port,'Browser did not start');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();const target=targets.find(x=>x.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=e=>{const x=JSON.parse(e.data);if(x.id){const p=pending.get(x.id);pending.delete(x.id);clearTimeout(p?.timer);if(x.error)p?.reject(Error(JSON.stringify(x.error)));else p?.resolve(x.result);}else for(const callback of listeners.get(x.method)??[])callback(x.params);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(Error('CDP timeout: '+method));},30000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async(expression,milliseconds=20000)=>{const end=Date.now()+milliseconds;while(Date.now()<end){try{if(await evaluate(`Promise.resolve(${expression}).then(Boolean)`))return;}catch(error){if(!/context.*destroy|Cannot find context/i.test(error.message))throw error;}await delay(50);}throw Error('Browser condition timed out: '+expression);};
  const on=(event,callback)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(callback);return()=>listeners.get(event).delete(callback);};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
  return {send,evaluate,until,on,profile,port,async close(){await send('Browser.close').catch(()=>{});socket.close();child.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}pending.clear();}};
 }catch(error){socket?.close();child.kill();throw error;}
}
