import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryOptions } from '../lib/catalog-config.ts';
import { resolveCategoryAttributeSchema } from '../lib/reference-data/category-attribute-schemas.ts';
import { auditCatalog } from '../scripts/audit-catalog.mjs';
const schema = slug => resolveCategoryAttributeSchema(slug, categoryOptions.find(c => c.slug === slug).rootSlug);
const get = (slug,key) => schema(slug).attributes.find(a => a.key === key);

test('animal supply leaves have concrete types and only appropriate equipment fields', () => {
  for (const slug of ['pet-bird-cages','pet-rodent-cages','pet-beds-houses','pet-carriers','pet-collars-leashes','pet-toys-training','pet-aquarium-decor']) {
    assert.equal(get(slug,'supply_type').dataType,'select',slug);
    for(const key of ['power','recommended_volume','capacity'])assert.equal(get(slug,key),undefined,slug+'.'+key);
  }
  assert.equal(get('pet-aquariums','capacity').validation.visibleWhen.key,'supply_type');
  assert.equal(get('pet-aquarium-equipment','power').validation.visibleWhen.key,'supply_type');
  assert.equal(get('pet-collars-leashes','brand').options.some(o=>o.value==='royal-canin'),false);
});

test('irrigation, livestock equipment and karts do not inherit tractor or truck identity', () => {
  for(const slug of ['agro-irrigation','agro-livestock'])for(const key of ['working_width','required_power','attachment_mount','compatible_tractor'])assert.equal(get(slug,key),undefined,slug+'.'+key);
  assert.ok(get('agro-irrigation','brand').options.some(o=>o.value==='netafim'));
  assert.ok(get('agro-livestock','brand').options.some(o=>o.value==='delaval'));
  assert.ok(get('go-karts','brand').options.some(o=>o.value==='birel-art'));
  assert.equal(get('go-karts','brand').options.some(o=>o.value==='kamaz'),false);
});

test('wearable and console models depend on their own stable manufacturer keys in RU and KK', () => {
  for(const [slug,key,brand,needle] of [['smart-watches','watch_model','apple','Series 9'],['smart-watches','watch_model','samsung','Galaxy Watch4'],['game-consoles','model','sony','PlayStation 5'],['game-consoles','model','nintendo','Switch']]) {
    const field=get(slug,key);assert.equal(field.dataType,'select');assert.equal(field.dependsOnKey,'brand');
    assert.ok(field.options.some(o=>o.parentValue===brand&&o.label.ru.includes(needle)&&o.label.kk===o.label.ru));
    assert.ok(get(slug,key+'_other').validation.requiredWhen.values.includes('other-model'));
  }
  assert.equal(get('smart-watches','brand').options.some(o=>o.value==='infinix'),false);
  assert.ok(get('video-games','game_title'));
  assert.equal(get('video-games','model'),undefined);
});

test('permanent audit detects the rejected inherited animal profile', () => {
  const category=categoryOptions.find(c=>c.slug==='pet-collars-leashes');
  const result=auditCatalog({categories:[category],schema:()=>({profileNames:['animalSupply'],attributes:[{key:'power',dataType:'number',label:{ru:'Мощность',kk:'Қуаты'}}]})});
  assert.ok(result.findings.some(f=>f.code==='wrong_subject_profile'));
  assert.ok(result.findings.some(f=>f.code==='foreign_aquarium_field'));
});

test('tablet processors and motherboard chipsets use finite dictionaries and conditional Other', () => {
  const cpu=get('tablets','cpu'); assert.equal(cpu.dataType,'select');
  assert.ok(cpu.options.some(o=>o.value==='apple-m4'));
  assert.ok(cpu.options.some(o=>o.value==='mediatek-dimensity-9300-plus'));
  assert.equal(cpu.options.some(o=>/Xeon|Threadripper|Ultra/.test(o.label.ru)),false);
  assert.equal(get('tablets','cpu_other').validation.requiredWhen.key,'cpu');
  const component=categoryOptions.find(c=>schema(c.slug).attributes.some(a=>a.key==='chipset'));
  const chipset=get(component.slug,'chipset'); assert.equal(chipset.dataType,'select');
  assert.ok(chipset.options.some(o=>o.value==='intel-b760'));
  assert.deepEqual(chipset.validation.visibleWhen,{key:'component_type',values:['motherboard']});
  assert.equal(get(component.slug,'chipset_other').validation.requiredWhen.key,'chipset');
  for(const field of [cpu,chipset]){assert.equal(new Set(field.options.map(o=>o.value)).size,field.options.length);assert.ok(field.options.every(o=>o.label.ru===o.label.kk||o.value.startsWith('other-')));}
});
