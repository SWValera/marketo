import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SITE_ORIGIN,metadataOrigin,installationOrigin,canonicalRedirect} from '../lib/site-origin.ts';
import {unapprovedLegacyBrand} from '../scripts/lib/brand-contract.mjs';

const read=(path)=>readFile(path,'utf8');
const legacy=new RegExp('mar'+'keto','i');
const manifest=JSON.parse(await read('public/manifest.webmanifest'));
const logo=await readFile('assets/brand/jevu-logo-source.jpg');
sharp.cache(false); sharp.concurrency(1);

test('every own runtime source rejects unapproved old-brand text, including new pages',async()=>{
  for(const directory of ['app','components','lib','public']){
    for(const relative of await readdir(directory,{recursive:true})){
      if(!/\.(tsx?|html|js|json|webmanifest|svg|css)$/.test(relative))continue;
      const path=directory+'/'+relative.replaceAll('\\','/');
      assert.equal(unapprovedLegacyBrand(path,await read(path)),false,path);
    }
  }
  // Mutation witnesses: legacy display names must fail even in approved files.
  assert.equal(unapprovedLegacyBrand('app/layout.tsx','title: "'+['Mar','keto'].join('')+'"'),true);
  assert.equal(unapprovedLegacyBrand('app/layout.tsx','title: "Маркето"'),true);
  assert.equal(unapprovedLegacyBrand('lib/reference-data/master-catalog/jobs-real-estate.ts','Маркетолог'),false);
  assert.equal(unapprovedLegacyBrand('lib/i18n/config.ts','export const LOCALE_COOKIE="'+['mar','keto-locale'].join('')+'"; title="'+['Mar','keto'].join('')+'"'),true);
});

test('official logo and all app icons are exact aspect-preserving derivatives',async()=>{
  assert.equal(createHash('sha256').update(logo).digest('hex'),'b083218bbbe4e95c807c90147cb4ef53c70c04c77e8c5571cf8e9db7cbc5ef3a');
  for(const size of [16,32,180,192,512]){
    const file=size===180?'apple-touch-icon':`jevu-${size}-v1`;
    const actual=await readFile(`public/icons/${file}.png`);
    const expected=await sharp(logo).rotate().resize(size,size,{fit:'contain',background:'#ffffff',withoutEnlargement:true}).png().toBuffer();
    assert.deepEqual(actual,expected,file);
    const info=await sharp(actual).metadata();assert.equal(info.width,size);assert.equal(info.height,size);
  }
  for(const size of [192,512]){
    const inset=Math.round(size*0.68);
    const inner=await sharp(logo).rotate().resize(inset,inset,{fit:'contain',background:'#ffffff',withoutEnlargement:true}).png().toBuffer();
    const expected=await sharp({create:{width:size,height:size,channels:3,background:'#ffffff'}}).composite([{input:inner,gravity:'centre'}]).png().toBuffer();
    assert.deepEqual(await readFile(`public/icons/jevu-maskable-${size}-v1.png`),expected);
  }
  const ico=await readFile('public/favicon.ico');
  assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
  for(const [i,size] of [16,32,48].entries()){
    const at=6+16*i,offset=ico.readUInt32LE(at+12),length=ico.readUInt32LE(at+8);
    const expected=await sharp(logo).resize(size,size,{fit:'contain',background:'#ffffff'}).png().toBuffer();
    assert.deepEqual(ico.subarray(offset,offset+length),expected);
  }
});

test('manifest advertises JEVU while preserving existing same-origin app identity',async()=>{
  for(const key of ['name','short_name'])assert.equal(manifest[key],'JEVU');
  for(const key of ['start_url','scope'])assert.equal(manifest[key],'/');
  assert.equal(manifest.display,'standalone');
  // Identity is intentionally non-visible and immutable for installed app updates.
  assert.equal(manifest.id,'/'+['mar','keto-pwa-v1'].join(''));
  assert.equal(manifest.theme_color,'#16a34a');assert.equal(manifest.background_color,'#ffffff');
  for(const icon of [...manifest.icons,...manifest.shortcuts.flatMap(s=>s.icons)]){
    assert.doesNotMatch(icon.src,legacy);await readFile('public'+icon.src);
  }
  for(const size of [192,512])assert.ok(manifest.icons.some(i=>i.sizes===`${size}x${size}`&&i.purpose==='maskable'));
});

test('no old brand artwork is served or referenced by public brand surfaces',async()=>{
  const files=await readdir('public',{recursive:true});
  assert.ok(files.every(file=>!legacy.test(file)));
  for(const path of ['components/brand.tsx','components/header.tsx','components/city-premium-showcase.tsx','lib/i18n/messages.ts','public/offline.html','supabase/templates/confirmation.html','app/layout.tsx']){
    assert.doesNotMatch(await read(path),legacy,path);
  }
  const offline=await read('public/offline.html');
  assert.match(offline,/data:image\/png;base64,/);assert.match(offline,/JEVU/);
  const image=offline.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)[1];
  assert.deepEqual(Buffer.from(image,'base64'),await readFile('public/icons/jevu-192-v1.png'));
  assert.match(await read('components/brand.tsx'),/jevu-192-v1\.png/);
  assert.match(await read('app/page.tsx'),/<Brand \/>/);
  assert.match(await read('components/header.tsx'),/<Brand \/>/);
  for(const path of ['components/pwa-install.tsx','components/login-content.tsx','components/hero-slider.tsx']){
    const source=await read(path);
    assert.match(source,/<BrandIcon /,path);
    assert.doesNotMatch(source,/>M<\//,path);
  }
});

test('canonical origin cannot be poisoned, WWW redirects without losing navigation state',()=>{
  assert.equal(SITE_ORIGIN,'https://jevu.kz');
  for(const host of ['localhost:5173','www.jevu.kz','hostile.example',null])assert.equal(metadataOrigin(host).origin,SITE_ORIGIN);
  assert.equal(installationOrigin('localhost:5173').origin,'http://localhost:5173');
  assert.equal(installationOrigin('jevu.kz').origin,SITE_ORIGIN);
  assert.equal(canonicalRedirect('https://www.jevu.kz/category/transport?city=a&page=2').href,'https://jevu.kz/category/transport?city=a&page=2');
  assert.equal(canonicalRedirect('http://www.jevu.kz:80/').href,'https://jevu.kz/');
  assert.equal(canonicalRedirect('http://jevu.kz/categories?city=a&page=2').href,'https://jevu.kz/categories?city=a&page=2');
  for(const url of ['https://jevu.kz/','https://www.jevu.kz.attacker.test/','https://hostile.example/'])assert.equal(canonicalRedirect(url),null);
});
