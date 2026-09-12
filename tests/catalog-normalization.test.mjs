import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import * as jsxRuntime from 'react/jsx-runtime';
import {categoryOptions} from '../lib/catalog-config.ts';
import {resolveCategoryAttributeSchema as schema} from '../lib/reference-data/category-attribute-schemas.ts';
import {processorOptions,graphicsOptions} from '../lib/reference-data/hardware-options.ts';
import {clearDependentValues,getDependentParentValue,isAttributeVisible,isAttributeRequired} from '../lib/reference-data/attributes.ts';
import {listAttributeOptions,resolveAttributeOptionParent} from '../lib/data/supabase/categories.ts';
const attrs=slug=>schema(slug,categoryOptions.find(c=>c.slug===slug).rootSlug).attributes;
const field=(slug,key)=>attrs(slug).find(a=>a.key===key);
const runtime=values=>values.map((a,i)=>({...a,id:a.key,visible:true,sortOrder:i,required:!!a.required,options:(a.options??[]).map(o=>({...o,id:o.value,parentOptionId:o.parentValue??null}))}));

test('every effective dependency is saved after its parent, including mixed devices and vehicle generation',()=>{
 for(const c of categoryOptions){const a=attrs(c.slug);for(const [i,x] of a.entries())for(const p of [x.dependsOnKey,x.validation?.visibleWhen?.key,x.validation?.requiredWhen?.key].filter(Boolean))assert.ok(a.findIndex(y=>y.key===p)>=0&&a.findIndex(y=>y.key===p)<i,`${c.slug}.${x.key} before ${p}`);}
});
test('vehicle generation is model-scoped, localized, metadata-backed and distinct from year',()=>{
 for(const model of ['toyota:camry','bmw:3-series','mercedes-benz:e-class','volkswagen:golf']){
  const g=field(model==='volkswagen:golf'?'cars-hatchback':'cars-sedan','generation');const choices=g.options.filter(o=>o.parentValue===model);
  assert.ok(choices.length>=6,model);for(const c of choices){assert.ok(c.metadata.generation_code);assert.ok(c.metadata.generation_name);assert.ok(c.metadata.year_from>=1900);assert.ok(c.label.ru&&c.label.kk);}
 }
 assert.equal(field('cars-sedan','generation').dependsOnKey,'model');assert.equal(field('cars-sedan','year').dataType,'number');
 const car=runtime(attrs('cars-sedan')),g=car.find(a=>a.key==='generation');const selected={brand:'toyota',model:'toyota:camry'};
 assert.equal(isAttributeRequired(g,selected,'2026-09-01T00:00:00Z'),false);assert.equal(isAttributeRequired(g,selected),true);
 assert.equal(getDependentParentValue({...g,options:[]},selected),'toyota:camry');
 const changed=clearDependentValues('brand','bmw',car,{...selected,generation:g.options.find(o=>o.parentValue===selected.model).value,generation_other:'legacy'});
 assert.equal(changed.model,undefined);assert.equal(changed.generation,undefined);assert.equal(changed.generation_other,undefined);
});
test('phones, tablets, notebooks and mixed leaves use corresponding manufacturer model dictionaries',()=>{
 for(const slug of ['smartphones','tablets','laptops']){
  const model=field(slug,'model');assert.equal(model.dependsOnKey,'brand');assert.equal(model.optionsLoadMode,'deferred');assert.ok(model.options.some(o=>o.parentValue==='apple'));
 }
 assert.ok(field('laptops','model').options.some(o=>o.parentValue==='lenovo'&&o.label.ru==='ThinkPad'));
 const mixed=field('exchange-phones','model');assert.ok(mixed.options.some(o=>o.parentValue==='phone:apple'));assert.ok(mixed.options.some(o=>o.parentValue==='tablet:apple'));
 assert.equal(field('exchange-phones','brand').dependsOnKey,'mobile_device_type');
});
test('actual hardware dictionaries contain common verified families and separate mobile and desktop variants',()=>{
 const cpu=processorOptions('laptop').map(o=>o.label.ru),gpu=graphicsOptions('laptop').map(o=>o.label.ru);
 for(const family of ['Intel Core Ultra','Intel Core i7','Intel Xeon','Intel Celeron','Intel Pentium','Intel Atom','AMD Ryzen','Apple M1','Apple M5','Qualcomm Snapdragon','MediaTek Kompanio'])assert.ok(cpu.some(n=>n.startsWith(family)),family);
 assert.ok(gpu.some(n=>/NVIDIA.*Laptop/.test(n)));assert.ok(gpu.some(n=>/AMD Radeon/.test(n)));assert.ok(gpu.some(n=>/Intel Arc.*M$/.test(n)));
 assert.ok(processorOptions('desktop').some(o=>/Threadripper/.test(o.label.ru)));
 for(const platform of ['laptop','desktop'])for(const choices of [processorOptions(platform),graphicsOptions(platform)]){assert.equal(new Set(choices.map(o=>o.value)).size,choices.length);assert.ok(choices.every(o=>/^[a-z0-9][a-z0-9-]{0,99}$/.test(o.value)));}
});
test('clothing and shoe sizes, properties, living subjects and sports have distinct fields',()=>{
 const clothes=categoryOptions.find(c=>!c.hasChildren&&schema(c.slug,c.rootSlug).profileNames.includes('clothing'));
 assert.ok(field(clothes.slug,'size').options.some(o=>o.value==='int-m'));
 const shoe=categoryOptions.find(c=>!c.hasChildren&&schema(c.slug,c.rootSlug).profileNames.includes('kidsShoes'));
 assert.ok(field(shoe.slug,'size').options.some(o=>o.value==='22.5'));
 assert.equal(field('flats-sale','brand'),undefined);assert.ok(field('flats-sale','total_area'));
 assert.equal(field('home-live-plants','brand'),undefined);assert.equal(field('home-live-plants','condition'),undefined);
 assert.ok(field('sports-fitness-equipment','max_user_weight'));assert.ok(field('sports-winter','boot_size'));assert.equal(field('sports-winter','max_user_weight'),undefined);
 assert.equal(field('water-outboard-engines','hull_material'),undefined);assert.equal(field('business-restaurant-furniture','power'),undefined);
});
test('multiselect custom field visibility and recursive clearing respect all selected values',()=>{
 const definitions=runtime([{key:'material',dataType:'multiselect'},{key:'material_other',dataType:'text',validation:{visibleWhen:{key:'material',values:['other']},requiredWhen:{key:'material',values:['other']}}}]);
 assert.equal(isAttributeVisible(definitions[1],{material:['cotton','other']}),true);
 assert.equal(isAttributeRequired(definitions[1],{material:['cotton','other']}),true);
 assert.equal(clearDependentValues('material',['cotton'],definitions,{material:['cotton','other'],material_other:'custom'}).material_other,undefined);
});

function mockClient(responses){const calls=[];return {calls,from(table){const request={table,filters:[]};calls.push(request);const builder={};for(const method of ['select','eq','in','is','or','order','range'])builder[method]=(...args)=>{request.filters.push([method,...args]);return builder;};builder.maybeSingle=()=>Promise.resolve({data:responses.shift(),error:null});builder.then=(resolve,reject)=>Promise.resolve({data:responses.shift()??[],error:null}).then(resolve,reject);return builder;}};}
test('large dictionary query starts at requested page and retains parent and search predicates',async()=>{
 const client=mockClient([Array.from({length:61},(_,i)=>({id:i}))]);const r=await listAttributeOptions(client,['child'],{parentOptionId:'parent',query:'Ryzen 7',offset:120,limit:61});
 assert.equal(r.length,61);assert.deepEqual(client.calls[0].filters.find(f=>f[0]==='range'),['range',120,180]);assert.equal(client.calls[0].filters.filter(f=>f[0]==='or').length,2);
 const selected=mockClient([[{id:'chosen'}]]);await listAttributeOptions(selected,['child'],{parentOptionId:'parent',values:['late-option'],limit:1});assert.ok(selected.calls[0].filters.some(f=>f[0]==='in'&&f[1]==='value'&&f[2][0]==='late-option'));
});
test('deferred grandparent resolution is scoped to the actual category and attribute key',async()=>{
 const client=mockClient([{category_id:'cars',depends_on_key:'model'},{id:'camry-option'}]);assert.equal(await resolveAttributeOptionParent(client,'generation','toyota:camry'),'camry-option');
 assert.ok(client.calls[1].filters.some(f=>f[0]==='select' && f[1].includes('category_attribute_options_attribute_id_fkey!inner')));
 assert.ok(client.calls[1].filters.some(f=>f[0]==='eq'&&f[1]==='category_attributes.category_id'&&f[2]==='cars'));
 assert.ok(client.calls[1].filters.some(f=>f[0]==='eq'&&f[1]==='category_attributes.key'&&f[2]==='model'));
});

test('actual ReferenceSelect filters a multiselect field with one value and retains publication multiselect',()=>{
 const source=ts.transpileModule(readFileSync(new URL('../components/reference-select.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 function render(emptyMode,onChange,onMultipleChange){let state=0;const exports={};const context=vm.createContext({exports,Map,Set,URLSearchParams,document:{body:{}},require(id){if(id==='react/jsx-runtime')return jsxRuntime;if(id==='react')return{useEffect(){},useMemo:fn=>fn(),useRef:()=>({current:null}),useState:initial=>[state++===0?true:initial,()=>{}]};if(id==='react-dom')return{createPortal:node=>node};if(id.includes('i18n-provider'))return{useI18n:()=>({locale:'ru',t:x=>x})};if(id.includes('i18n/config'))return{localize:(x,l)=>x[l]};if(id.includes('release'))return{CATEGORY_REFERENCE_VERSION:'test'};if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});return{};}});vm.runInContext(source,context);return exports.ReferenceSelect({attribute:{id:'fabric',dataType:'multiselect',label:{ru:'Материал',kk:'Материал'},options:[{id:'cotton',value:'cotton',label:{ru:'Хлопок',kk:'Мақта'}}]},value:'',multipleValues:[],emptyMode,onChange,onMultipleChange});}
 function find(node,predicate){if(!node)return;if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}return;}if(typeof node!=='object')return;if(predicate(node))return node;return find(node.props?.children,predicate);}
 let selected;const filter=render('filter',value=>selected=value,()=>assert.fail('filter invoked multiple callback'));find(filter,n=>n.type==='button'&&find(n.props.children,c=>c.type==='span'&&c.props.children==='Хлопок')).props.onClick();assert.equal(selected,'cotton');
 let multiple;const publish=render('select',()=>assert.fail('publication invoked single callback'),value=>multiple=value);find(publish,n=>n.type==='button'&&find(n.props.children,c=>c.type==='span'&&c.props.children==='Хлопок')).props.onClick();assert.deepEqual(Array.from(multiple),['cotton']);
});


test('factory model codes remain explicit, brand-contextual and reset when manufacturer changes',()=>{
 const fields=runtime(attrs('refrigerators'));const model=fields.find(a=>a.key==='model');
 assert.equal(model.dataType,'text');assert.equal(model.validation.inputPurpose,'manufacturer-model-code');
 assert.equal(model.dependsOnKey,'brand');assert.ok(model.validation.placeholder.ru);assert.ok(model.validation.placeholder.kk);
 assert.equal(isAttributeVisible(model,{}),false);assert.equal(isAttributeVisible(model,{brand:'samsung'}),true);
 const next=clearDependentValues('brand','lg',fields,{brand:'samsung',model:'FACTORY-CODE'});assert.equal(next.model,undefined);
 assert.equal(field('laptops','model').dataType,'select');
});

test('every deferred parent chain resolves stable values after reload and clears descendants on change', () => {
 let chains=0;
 for(const c of categoryOptions.filter(c=>!c.hasChildren)){
  const definitions=attrs(c.slug);
  for(const child of definitions.filter(a=>['select','multiselect'].includes(a.dataType)&&a.dependsOnKey)){
   const parent=definitions.find(a=>a.key===child.dependsOnKey);if(parent?.optionsLoadMode!=='deferred')continue;
   const related=child.options.find(o=>o.parentValue);
   const fallback=child.options.find(o=>o.value===child.validation?.fallbackOption);
   const parentValue=related?.parentValue??parent.options.find(o=>o.value!=='other-model')?.value??parent.options[0]?.value;
   assert.ok(related||fallback,c.slug+'.'+child.key);assert.ok(parentValue,c.slug+'.'+child.key);
   const first={...(related??fallback),parentValue};
   const restored=runtime(definitions).map(a=>a.optionsLoadMode==='deferred'?{...a,options:[]}:a);
   const current={[parent.key]:first.parentValue,[child.key]:first.value};
   assert.equal(getDependentParentValue(restored.find(a=>a.key===child.key),current),first.parentValue);
   assert.equal(clearDependentValues(parent.key,'other-model',restored,current)[child.key],undefined);
   chains++;
  }
 }
 assert.equal(chains,61);
});
