// Explicit opt-in only. CI/build never imports or runs this paid smoke test.
import {writeFile,mkdir} from 'node:fs/promises';
import {OpenAIModerationProvider} from '../lib/moderation/openai-provider.ts';
import {syntheticImage} from '../tests/helpers/moderation-ai-fixtures.mjs';
if(process.env.JEVU_RUN_PAID_AI_SMOKE!=='true')throw new Error('Explicit JEVU_RUN_PAID_AI_SMOKE=true required');
if(!process.env.OPENAI_API_KEY||!process.env.MODERATION_AI_MODEL)throw new Error('OPENAI_API_KEY and MODERATION_AI_MODEL required');
const provider=new OpenAIModerationProvider({key:process.env.OPENAI_API_KEY,model:process.env.MODERATION_AI_MODEL}),reports=[];
for(const kind of ['text','card','car']){
 const input={title:kind==='text'?'Есть одноразки, разные вкусы.':'Телефон / Телефон сатылады',description:'Синтетическое тестовое объявление. Бұл тек сынақ.',category:'Телефоны / Телефондар',attributes:'{}',images:kind==='text'?[]:[{image_index:0,bytes:await syntheticImage(kind),mimeType:'image/jpeg'}]};
 try{const result=await provider.analyzeListing(input,new AbortController().signal);reports.push({scenario:kind,...result.metadata,codes:[...result.observations.text_observations,...result.observations.image_observations].filter(x=>x.present).map(x=>x.code)});}
 catch(error){reports.push({scenario:kind,status:error.code??'failure',...error.metadata});}
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/moderation-real-smoke.json',JSON.stringify(reports,null,2),{mode:0o600});
console.log(JSON.stringify({calls:reports.length,success:reports.filter(x=>x.status==='success').length,metadata_file:'artifacts/moderation-real-smoke.json'}));
if(reports.some(x=>x.status!=='success'))process.exitCode=1;
