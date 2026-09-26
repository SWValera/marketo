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
const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex');
// Approved assets from 9121172, not output regenerated on the current machine.
// JPEG decode/resize rounding and PNG encoding are not portable byte contracts.
// Changing these hashes requires an explicit brand-asset review.
const approvedIcons=[
  ['apple-touch-icon.png',180,'88d0536102a6287e2738c32e299ac10b6a1c2b5dfed8c695dca4d67ca9a24e7f'],
  ['jevu-16-v1.png',16,'b81fe939f860c98e05eee08cbe1b60a2624b40853bdb7d789e7c602a0c8ff531'],
  ['jevu-32-v1.png',32,'5d824c8e84a4139c54a5f43664e2723095b1ba8113c03bccde4d9f8ef6115636'],
  ['jevu-192-v1.png',192,'9b307f384910d148a907b82a96c0625c0951d34c4d77894a3247d71eb19177d5'],
  ['jevu-512-v1.png',512,'f1f47fad1a15942965766891224ed3eef12966c3072121bf66bf0408a37f54d4'],
  ['jevu-maskable-192-v1.png',192,'29152e9e75ce7c2b81d4c1468e38842c1d0ca84f4b2a8f59fda70c3020f2fa92'],
  ['jevu-maskable-512-v1.png',512,'25e3000c4d8e3c641912b412c2d62c4ba47b153adcf483f01ef759e5509c2dd6'],
];

async function assertImageSize(bytes,format,width,height,label){
  const info=await sharp(bytes).metadata();
  assert.deepEqual({format:info.format,width:info.width,height:info.height},{format,width,height},label);
}

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

test('official logo and approved app icons retain their exact hashes and dimensions',async()=>{
  assert.equal(sha256(logo),'b083218bbbe4e95c807c90147cb4ef53c70c04c77e8c5571cf8e9db7cbc5ef3a','official JPEG source');
  await assertImageSize(logo,'jpeg',951,896,'official JPEG source');
  assert.deepEqual((await readdir('public/icons')).sort(),approvedIcons.map(([file])=>file).sort());
  for(const [file,size,hash] of approvedIcons){
    const actual=await readFile(`public/icons/${file}`);
    // Compare compact hashes so a corrupt asset fails without a huge Buffer diff.
    assert.equal(sha256(actual),hash,file);
    await assertImageSize(actual,'png',size,size,file);
  }
  const ico=await readFile('public/favicon.ico');
  assert.equal(sha256(ico),'0e8630bfffd2e91f4cfb306edd5739b915823ea4e550fca3ac22cddb3d375649','favicon.ico');
  assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
  for(const [i,size] of [16,32,48].entries()){
    const at=6+16*i,offset=ico.readUInt32LE(at+12),length=ico.readUInt32LE(at+8);
    assert.equal(ico[at],size);assert.equal(ico[at+1],size);
    assert.ok(offset>=54&&length>0&&offset+length<=ico.length,'ICO entry bounds');
    await assertImageSize(ico.subarray(offset,offset+length),'png',size,size,`favicon entry ${size}`);
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
  assert.deepEqual(manifest.icons,[
    {src:'/icons/jevu-192-v1.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icons/jevu-512-v1.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/icons/jevu-maskable-192-v1.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
    {src:'/icons/jevu-maskable-512-v1.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
  ]);
  assert.deepEqual(manifest.shortcuts.map(({url,icons})=>({url,icons})),['/search','/publish'].map(url=>({
    url,icons:[{src:'/icons/jevu-192-v1.png',sizes:'192x192',type:'image/png'}],
  })));
});

test('no old brand artwork is served or referenced by public brand surfaces',async()=>{
  const files=await readdir('public',{recursive:true});
  assert.ok(files.every(file=>!legacy.test(file)));
  for(const path of ['components/brand.tsx','components/header.tsx','components/city-premium-showcase.tsx','lib/i18n/messages.ts','public/offline.html','supabase/templates/confirmation.html','app/layout.tsx']){
    assert.doesNotMatch(await read(path),legacy,path);
  }
  const offline=await read('public/offline.html');
  assert.match(offline,/data:image\/png;base64,/);assert.match(offline,/JEVU/);
  const images=[...offline.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(images.length,1,'offline page has exactly one embedded brand icon');
  assert.ok(Buffer.from(images[0][1],'base64').equals(await readFile('public/icons/jevu-192-v1.png')),'offline icon exactly matches approved PNG');
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
