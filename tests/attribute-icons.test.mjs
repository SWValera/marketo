import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {categoryOptions,attributeSets} from '../lib/catalog-config.ts';
import {categorySchemaProfiles,resolveCategoryAttributeSchema} from '../lib/reference-data/category-attribute-schemas.ts';
import {resolveAttributeIcon} from '../lib/attribute-icons.ts';
import {renderAttributeIconContexts} from '../scripts/generate-attribute-icon-contexts.mjs';
const examples={
 'cars-sedan':{brand:'Car',model:'Car',year:'CalendarDays',mileage:'Gauge',transmission:'Settings2',fuel:'Fuel',drive:'GitFork',engine_volume:'Cog',steering:'CircleDot',color:'Palette',condition:'ClipboardCheck'},
 tablets:{brand:'Tag',model:'Tablet',model_other:'Tablet',storage:'HardDrive',ram:'MemoryStick',connectivity:'Wifi',condition:'ClipboardCheck',warranty:'ShieldCheck',display_type:'Monitor',device_form:'Tablet',charging_connector:'Cable'},
 smartphones:{brand:'Tag',model:'Smartphone',storage:'HardDrive',network_generation:'Network',warranty:'ShieldCheck'},
 televisions:{brand:'Tag',model:'Tv',screen_size:'Monitor',resolution:'Monitor',smart_tv:'Wifi'},
 'flats-sale':{total_area:'SquareDashed',rooms:'DoorOpen',floor:'Building2',floors_total:'Building2',year:'CalendarDays',building_type:'House',renovation:'Wrench',bathroom:'Bath',furnished:'Sofa',kitchen_area:'SquareDashed'},
 'women-clothing':{brand:'Tag',size:'Ruler',color:'Palette',material:'Layers',condition:'ClipboardCheck',audience:'UserRound',season:'SunSnow'},
 laptops:{model:'Laptop',cpu:'CircuitBoard',ram:'MemoryStick',storage:'HardDrive'},
 'washing-machines':{model:'WashingMachine',load_capacity:'Scale',warranty:'ShieldCheck'},
 'refrigerators':{model:'Refrigerator',total_volume:'Droplets',no_frost:'Snowflake'},
 'plumbing-services':{work_type:'Wrench',home_visit:'Route',service_guarantee:'ShieldCheck'},
 cats:{breed:'PawPrint',gender:'UserRound',age_months:'CalendarDays',vaccinated:'BadgeCheck'},
 'car-parts':{part_type:'Box',compatible_brand:'Tag',condition:'ClipboardCheck'},
 'garden-tools':{tool_type:'Drill',power:'Zap',condition:'ClipboardCheck'},
};
for(const [category,expected]of Object.entries(examples))test('semantic icons: '+category,()=>{for(const[key,icon]of Object.entries(expected))assert.equal(resolveAttributeIcon(key,category),icon,category+'/'+key)});
test('all Master Catalog profiles and legacy IDs have an explicit semantic mapping',()=>{
 const keys=[...new Set(Object.values(categorySchemaProfiles).flat().map(a=>a.key).concat(Object.values(attributeSets).flat().map(a=>a.id)))];
 assert.ok(keys.length>=472);for(const key of keys)assert.notEqual(resolveAttributeIcon(key),'SlidersHorizontal',key);
});
test('every effective category schema is covered in RU and KK without label or value input',()=>{
 let assignments=0;for(const category of categoryOptions){const schema=resolveCategoryAttributeSchema(category.slug,category.rootSlug);for(const attribute of schema.attributes){
  const icons=['ru','kk'].map(locale=>{const translated={...attribute,label:attribute.label[locale]};return resolveAttributeIcon(translated.key,category.slug)});assert.equal(icons[0],icons[1]);assert.notEqual(icons[0],'SlidersHorizontal',category.slug+'/'+attribute.key);if(!schema.profileNames.some(p=>p.startsWith('passengerCar')))assert.notEqual(icons[0],'Car',category.slug+'/'+attribute.key);assignments++;
 }}assert.equal(categoryOptions.length,1358);console.log('Icon coverage: '+assignments+' category/attribute assignments across '+categoryOptions.length+' categories');
});
test('category metadata is current, generated only from stable catalog profiles',async()=>{assert.equal(await readFile('lib/reference-data/attribute-icon-contexts.ts','utf8'),renderAttributeIconContexts())});
test('category affects ambiguous model/brand only; unknown fields stay neutral everywhere',()=>{
 for(const category of [...Object.keys(examples),'unknown-category','constructor','__proto__',undefined]){
  for(const key of ['future_attribute','Редкая характеристика','constructor','__proto__'])assert.equal(resolveAttributeIcon(key,category),'SlidersHorizontal');
  assert.equal(resolveAttributeIcon('color',category),'Palette');assert.equal(resolveAttributeIcon('charging_connector',category),'Cable');
 }assert.equal(resolveAttributeIcon('brand','unknown-category'),'Tag');assert.equal(resolveAttributeIcon('model','unknown-category'),'Box');assert.equal(resolveAttributeIcon('model_code','cars-sedan'),'Tag');
 for(const key of ['partType','deviceType','propertyType','priceType','payPeriod','animalType'])assert.notEqual(resolveAttributeIcon(key),'SlidersHorizontal');
});
test('actual shared component renders the chosen Lucide SVG, including neutral fallback',async()=>{
 const dir=resolve('artifacts/jevu-attribute-icons-20260912');await mkdir(dir,{recursive:true});const output=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {AttributeIcon} from './components/attribute-icon';export const render=(key,category)=>renderToStaticMarkup(<AttributeIcon attributeKey={key} categorySlug={category} size={14} className="characteristic-icon"/>);`,loader:'tsx',resolveDir:resolve('.')},bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic'});const file=resolve(dir,'icon-render-test.mjs');await writeFile(file,output.outputFiles[0].contents);const {render}=await import(pathToFileURL(file));
 for(const [key,category,name]of [['brand','tablets','tag'],['model','tablets','tablet'],['model','cars-sedan','car'],['model','smartphones','smartphone'],['model','televisions','tv'],['future_attribute','tablets','sliders-horizontal']]){const html=render(key,category);assert.ok(html.includes('lucide-'+name),html);assert.ok(html.includes('aria-hidden="true"'));assert.ok(html.includes('width="14"'));}
});
