import assert from "node:assert/strict";
import test from "node:test";
import { createShowcaseClock } from "../lib/showcase-clock.ts";
import { premiumDemoCount } from "../lib/premium-showcase-presentation.ts";

function fixture(start=0) {
  let now=start, visible=true, id=0;
  const timers=new Map(), activity=new Set();
  const environment={
    now:()=>now,
    setTimeout:(callback,delay)=>{const key=++id;timers.set(key,{callback,at:now+delay});assert.ok(timers.size<=1,"At most one boundary timer");return key;},
    clearTimeout:key=>timers.delete(key),
    isVisible:()=>visible,
    subscribeActivity:listener=>{activity.add(listener);return()=>activity.delete(listener);},
  };
  return {
    environment,timers,activity,
    advance(to){while(true){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>to)break;now=entry[1].at;timers.delete(entry[0]);entry[1].callback();}now=to;},
    jump(to){now=to;},
    wake(value=true){visible=value;for(const callback of activity)callback(value);},
    delayed(to){now=to;const entry=[...timers][0];timers.delete(entry[0]);entry[1].callback();},
  };
}
const clock=(f,pageCount,paused=false,scope="city")=>createShowcaseClock({pageCount,paused,scope},f.environment);

test("0/1/2 real use one page without any timer or lifecycle listener",()=>{
  for(const real of [0,1,2]){
    const f=fixture(8400),c=clock(f,(real+premiumDemoCount(real))/2),stop=c.subscribe(()=>{});
    assert.equal(c.getSnapshot(),0);assert.equal(f.timers.size,0);assert.equal(f.activity.size,0);stop();
  }
});
test("3/4/5/15 real automatically traverse every pair and wrap",()=>{
  for(const real of [3,4,5,15]){
    const f=fixture(),count=(real+premiumDemoCount(real))/2,c=clock(f,count);
    const stop=c.subscribe(()=>{}),pages=[c.getSnapshot()];
    for(let i=1;i<=count+2;i++){f.advance(i*3000);pages.push(c.getSnapshot());assert.equal(f.timers.size,1);}
    assert.deepEqual(pages,Array.from({length:count+3},(_,i)=>i%count));stop();assert.equal(f.timers.size,0);
  }
});
test("mid-bucket mount uses absolute page and the remaining 600ms",()=>{
  const f=fixture(8400),c=clock(f,3);
  assert.equal(c.getSnapshot(),2);assert.equal(f.timers.size,0,"Construction is side-effect free");
  const stop=c.subscribe(()=>{});assert.equal([...f.timers.values()][0].at,9000);
  f.advance(8999);assert.equal(c.getSnapshot(),2);f.advance(9000);assert.equal(c.getSnapshot(),0);
  assert.equal([...f.timers.values()][0].at,12000);stop();
});
test("manual next/prev/dots keep the one existing deadline, then return to automatic",()=>{
  const f=fixture(8400),c=clock(f,3),stop=c.subscribe(()=>{}),timer=[...f.timers.keys()][0];
  c.selectPage(3);assert.equal(c.getSnapshot(),0);c.selectPage(-1);assert.equal(c.getSnapshot(),2);
  c.selectPage(1);assert.equal(c.getSnapshot(),1);
  assert.deepEqual([...f.timers.keys()],[timer]);assert.equal([...f.timers.values()][0].at,9000);
  f.advance(9000);assert.equal(c.getSnapshot(),0);assert.equal(f.timers.size,1);stop();
});
test("hidden/resume and same-bucket focus discard manual state without catch-up",()=>{
  const f=fixture(8400),c=clock(f,3);let notifications=0;const stop=c.subscribe(()=>notifications++);
  c.selectPage(0);f.wake();assert.equal(c.getSnapshot(),2,"Focus resets even within same bucket");
  f.wake(false);assert.equal(f.timers.size,0);const before=notifications;
  f.jump(39400);f.wake(true);assert.equal(c.getSnapshot(),1);assert.equal(notifications,before+1);
  assert.equal([...f.timers.values()][0].at,42000);stop();assert.equal(f.activity.size,0);
});
test("throttled callback skips missed buckets and schedules only the next boundary",()=>{
  const f=fixture(8400),c=clock(f,3);let calls=0;const stop=c.subscribe(()=>calls++);
  f.delayed(39400);assert.equal(c.getSnapshot(),1);assert.equal(calls,1);
  assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].at,42000);stop();
});
test("expanded, collapse, page-count changes and remount clean up the old timer",()=>{
  const f=fixture(8400),first=clock(f,3),stop=first.subscribe(()=>{});first.selectPage(1);stop();
  const expanded=clock(f,3,true),stopExpanded=expanded.subscribe(()=>{});
  assert.equal(f.timers.size,0);f.jump(10400);stopExpanded();
  const collapsed=clock(f,3),stopCollapsed=collapsed.subscribe(()=>{});assert.equal(collapsed.getSnapshot(),0);
  stopCollapsed();f.jump(16400);const changed=clock(f,2),stopChanged=changed.subscribe(()=>{});
  assert.equal(changed.getSnapshot(),1);assert.equal(f.timers.size,1);stopChanged();
  assert.equal(f.timers.size,0);assert.equal(f.activity.size,0);
});
test("repeat subscriptions never duplicate scheduling or leave timers after cleanup",()=>{
  const f=fixture(8400),c=clock(f,3);
  const stop1=c.subscribe(()=>{}),stop2=c.subscribe(()=>{});assert.equal(f.timers.size,1);
  stop1();assert.equal(f.timers.size,1);stop2();assert.equal(f.timers.size,0);
  const stop3=c.subscribe(()=>{});assert.equal(f.timers.size,1);assert.equal(f.activity.size,1);stop3();
  assert.equal(f.timers.size,0);assert.equal(f.activity.size,0);
});
