import { modelCodePolicy } from "../lib/reference-data/model-code-policy.ts";
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryOptions, getCategoryPath } from '../lib/catalog-config.ts';
import { resolveCategoryAttributeSchema } from '../lib/reference-data/category-attribute-schemas.ts';
import { validateMasterCatalog } from './validate-master-catalog.mjs';

// Read-only audit. Counts are not a claim of semantic approval or database parity.
export function auditCatalog({ categories = categoryOptions, schema = resolveCategoryAttributeSchema, databaseCategories } = {}) {
  const findings = [];
  const finding = (severity, code, category, key, detail) => findings.push({ severity, code, category, key, detail });
  const brandProfiles = new Set(['goodsBrand','laptop','computer','component','display','tv','audio','camera','videoCamera','lens','gaming','appliance','tool','furniture','kidsClothing','toy','stroller','carSeat','bicycle','sportsGoods','outdoorGear','fishingGear','huntingGear','animalSupply','bags','jewelry','clothing','shoes','instrument']);
  const automotiveKeys = new Set(['engine_volume','mileage','transmission','fuel','drive','steering','customs_cleared','registration_status','vin_available']);
  const electronicKeys = new Set(['cpu','gpu','ram','storage_capacity','screen_resolution','display_type']);
  const normalizedKeys = new Set(['brand','model','cpu','gpu','generation','compatible_brand','compatible_model','watch_model']);
  const inappropriateProfiles = {
    'kids-sledges': 'bicycle', 'kids-scooters': 'bicycle', 'kids-electric-cars': 'bicycle',
    'wedding-decor-goods': 'clothing', 'workwear-footwear': 'clothing',
    'agro-irrigation': 'agriculturalAttachment', 'agro-livestock': 'agriculturalAttachment', 'go-karts': 'transportSimple',
    ...Object.fromEntries(['pet-bird-cages','pet-rodent-cages','pet-beds-houses','pet-carriers','pet-collars-leashes','pet-toys-training','pet-grooming-hygiene','pet-veterinary-goods','pet-aquariums','pet-aquarium-equipment','pet-aquarium-decor','pet-terrariums'].map(slug => [slug,'animalSupply'])),
  };
  const leaves = categories.filter(c => !c.hasChildren).map(category => {
    const { profileNames, attributes } = schema(category.slug, category.rootSlug);
    const path = getCategoryPath(category.slug).map(n => ({ slug: n.slug, name: n.name }));
    const keys = new Set(attributes.map(a => a.key));
    if ((keys.has('model') || keys.has('watch_model')) && !keys.has('brand')) finding('error','model_without_brand',category.slug,'model','Model has no manufacturer context');
    if (['pet-bird-cages','pet-rodent-cages','pet-beds-houses','pet-carriers','pet-collars-leashes','pet-toys-training','pet-aquarium-decor'].includes(category.slug) && ['power','recommended_volume','capacity'].some(key=>keys.has(key))) finding('error','foreign_aquarium_field',category.slug,null,'Passive animal supplies inherit aquarium equipment fields');
    if (!attributes.length) finding('error','empty_schema',category.slug,null,'Leaf has no attributes');
    if (keys.size !== attributes.length) finding('error','duplicate_key',category.slug,null,'Repeated effective attribute key');
    if (profileNames.some(p=>brandProfiles.has(p)) && !keys.has('brand')) finding('error','missing_brand',category.slug,'brand','Branded-goods profile has no manufacturer attribute');
    if (inappropriateProfiles[category.slug] && profileNames.includes(inappropriateProfiles[category.slug])) finding('error','wrong_subject_profile',category.slug,null,`Inappropriate inherited profile: ${inappropriateProfiles[category.slug]}`);
    if (path.some(n=>n.slug==='kids-shoes') && profileNames.includes('kidsClothing')) finding('error','shoe_clothing_schema',category.slug,'size','Footwear inherits clothing size schema');
    const fields = attributes.map(attribute => {
      const options = attribute.options ?? [];
      const optionKeys = new Set(options.map(o=>o.value));
      const parent = attribute.dependsOnKey ? attributes.find(a=>a.key===attribute.dependsOnKey) : undefined;
      const optionBacked = ['select','multiselect'].includes(attribute.dataType);
      if (optionBacked && !options.length) finding('error','empty_options',category.slug,attribute.key,'Select has no options');
      if (optionKeys.size !== options.length) finding('error','duplicate_option_key',category.slug,attribute.key,'Repeated stable option key');
      if (attribute.dependsOnKey && !parent) finding('error','missing_dependency',category.slug,attribute.key,attribute.dependsOnKey);
      if (parent) {
        const parentValues = new Set(parent.options?.map(o=>o.value));
        for(const option of options) if(option.parentValue && !parentValues.has(option.parentValue)) finding('error','orphan_parent_option',category.slug,attribute.key,option.value);
        if(optionBacked && parent.optionsLoadMode==='deferred') finding('info','deferred_parent_chain',category.slug,attribute.key,'Deferred parent resolved by stable key; all chains covered by catalog-normalization tests');
      }
      const visited=new Set([attribute.key]); let next=parent;
      while(next){if(visited.has(next.key)){finding('error','dependency_cycle',category.slug,attribute.key,next.key);break;}visited.add(next.key);next=attributes.find(a=>a.key===next.dependsOnKey);}
      if (category.rootSlug==='electronics' && automotiveKeys.has(attribute.key)) finding('error','foreign_automotive_field',category.slug,attribute.key,'Vehicle-specific field on electronics');
      if (['personal','real-estate','animals','services'].includes(category.rootSlug) && electronicKeys.has(attribute.key)) finding('error','foreign_electronics_field',category.slug,attribute.key,'Computing field on unrelated domain');
      if (['real-estate','services'].includes(category.rootSlug) && ['brand','model','generation'].includes(attribute.key)) finding('error','foreign_goods_field',category.slug,attribute.key,'Goods identity on property/service');
      const reviewedModelCode = attribute.key==='model' && attribute.dataType==='text' && attribute.dependsOnKey==='brand' && attribute.validation?.inputPurpose==='manufacturer-model-code' && attribute.validation?.reviewPolicy===modelCodePolicy(profileNames) && Boolean(modelCodePolicy(profileNames));
      if (normalizedKeys.has(attribute.key) && attribute.dataType==='text' && !reviewedModelCode) finding('review','dictionary_missing',category.slug,attribute.key,'Free text; needs domain dictionary and legacy-value mapping');
      if (attribute.key==='dimensions' && profileNames.includes('furniture')) finding('error','unstructured_dimensions',category.slug,attribute.key,'Furniture dimensions are not width/height/depth');
      if (attribute.dataType==='text' && !attribute.validation?.placeholder) finding('review','free_text_example_missing',category.slug,attribute.key,'No localized field example in attribute metadata');
      return {key:attribute.key,label:attribute.label,type:attribute.dataType,required:!!attribute.required,requiredWhen:attribute.validation?.requiredWhen??null,filterable:!!attribute.filterable,searchable:!!attribute.searchable,filterMode:attribute.filterMode??(attribute.filterable?'exact':null),reviewPolicy: reviewedModelCode ? attribute.validation.reviewPolicy : null,source:reviewedModelCode?'manufacturer model code':optionBacked?(attribute.dependsOnKey?'dependent dictionary':'static options'):attribute.dataType==='text'?'free text':'typed input',dictionary:optionBacked?`${category.slug}.${attribute.key}`:null,optionsLoadMode:attribute.optionsLoadMode??'eager',dependsOnKey:attribute.dependsOnKey??null,optionsCount:options.length,visibleWhen:attribute.validation?.visibleWhen??null};
    });
    return {slug:category.slug,path,root:category.rootSlug,profiles:profileNames,fields};
  });
  let database = {verified:false};
  if(databaseCategories){
    const liveById=new Map(databaseCategories.map(c=>[c.id,c]));
    const liveBySlug=new Map(databaseCategories.map(c=>[c.slug,c]));
    for(const category of categories){
      const live=liveBySlug.get(category.slug);
      if(!live||!live.is_active) finding('error','db_category_missing',category.slug,null,'Canonical category is absent/inactive');
      else if((liveById.get(live.parent_id)?.slug??null)!==(category.parentSlug??null)) finding('error','db_parent_mismatch',category.slug,null,'Parent differs from canonical tree');
    }
    for(const live of databaseCategories){
      if(live.parent_id&&!liveById.has(live.parent_id))finding('error','db_orphan_category',live.slug,null,'Parent ID does not exist');
      if(live.is_active&&!categories.some(c=>c.slug===live.slug))finding('error','db_extra_category',live.slug,null,'Active database category is missing in source');
    }
    database={verified:true,scope:'category IDs, active slugs and parent relationships only',rows:databaseCategories.length};
  }
  const byCode={};for(const f of findings)byCode[f.code]=(byCode[f.code]??0)+1;
  return {summary:{categories:categories.length,leaves:leaves.length,attributes:leaves.reduce((n,c)=>n+c.fields.length,0),errors:findings.filter(f=>f.severity==='error').length,review:findings.filter(f=>f.severity==='review').length,byCode,database},leaves,findings};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outputIndex=process.argv.indexOf('--output');
  const output=resolve(outputIndex>=0?process.argv[outputIndex+1]:'artifacts/catalog/audit');
  const snapshotIndex=process.argv.indexOf('--database-categories');
  const databaseCategories=snapshotIndex>=0?JSON.parse(readFileSync(process.argv[snapshotIndex+1],'utf8')):undefined;
  const result=auditCatalog({databaseCategories});
  result.structuralValidation=validateMasterCatalog();
  mkdirSync(output,{recursive:true});
  writeFileSync(resolve(output,'audit.json'),JSON.stringify(result,null,2));
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const rows=[['category','path_ru','key','label_ru','label_kk','type','required','filterable','searchable','source','dictionary','depends_on','options_count']];
  for(const c of result.leaves)for(const a of c.fields)rows.push([c.slug,c.path.map(n=>n.name.ru).join(' / '),a.key,a.label.ru,a.label.kk,a.type,a.required,a.filterable,a.searchable,a.source,a.dictionary,a.dependsOnKey,a.optionsCount]);
  writeFileSync(resolve(output,'leaf-attributes.csv'),'\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\n'));
  console.log(JSON.stringify(result.summary,null,2));
  if(process.argv.includes('--strict')&&(result.summary.errors||result.summary.review||!result.structuralValidation.ok))process.exitCode=1;
}
