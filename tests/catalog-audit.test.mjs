import assert from 'node:assert/strict';
import test from 'node:test';
import { auditCatalog } from '../scripts/audit-catalog.mjs';
import { categoryOptions } from '../lib/catalog-config.ts';

const category={slug:'audit-fixture',rootSlug:'electronics',hasChildren:false,parentSlug:null};
const label={ru:'Параметр',kk:'Параметр'};
const run=(attributes,databaseCategories)=>auditCatalog({categories:[category],schema:()=>({profileNames:[],attributes}),databaseCategories});

test('audit inventories every actual leaf and both localized labels',()=>{
 const result=auditCatalog();
 assert.deepEqual(new Set(result.leaves.map(c=>c.slug)),new Set(categoryOptions.filter(c=>!c.hasChildren).map(c=>c.slug)));
 assert.ok(result.leaves.every(c=>c.path.length&&c.fields.length&&c.fields.every(f=>f.label.ru&&f.label.kk)));
});
test('audit detects missing options, broken parent and dependency cycle',()=>{
 const result=run([
  {key:'empty',label,dataType:'select',options:[]},
  {key:'orphan',label,dataType:'select',dependsOnKey:'absent',options:[{value:'one',label}]},
  {key:'a',label,dataType:'select',dependsOnKey:'b',options:[{value:'one',label,parentValue:'one'}]},
  {key:'b',label,dataType:'select',dependsOnKey:'a',options:[{value:'one',label,parentValue:'one'}]},
 ]);
 for(const code of ['empty_options','missing_dependency','dependency_cycle'])assert.ok(result.findings.some(f=>f.code===code),code);
});
test('audit detects duplicate options and vehicle fields on electronics',()=>{
 const result=run([{key:'fuel',label,dataType:'select',options:[{value:'one',label},{value:'one',label}]}]);
 for(const code of ['duplicate_option_key','foreign_automotive_field'])assert.ok(result.findings.some(f=>f.code===code),code);
});
test('database tree validation distinguishes missing, extra and orphan categories',()=>{
 const result=run([],[{id:'one',slug:'extra',parent_id:'missing',is_active:true}]);
 for(const code of ['db_category_missing','db_orphan_category','db_extra_category'])assert.ok(result.findings.some(f=>f.code===code),code);
});


test('unreviewed model text cannot masquerade as an audited factory code',()=>{
 const result=run([{key:'brand',label,dataType:'select',options:[{value:'one',label}]},{key:'model',label,dataType:'text',dependsOnKey:'brand',validation:{inputPurpose:'manufacturer-model-code',reviewPolicy:'made-up',placeholder:label}}]);
 assert.ok(result.findings.some(f=>f.code==='dictionary_missing'&&f.key==='model'));
});
