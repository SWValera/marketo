// Synthetic vector drawings only. Never downloads or reads production images.
import sharp from 'sharp';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const output=resolve(process.argv[2]??'artifacts/benchmark-image-candidate');
try{await access(join(output,'manifest.json'));throw Error('Existing immutable fixture manifest: generate into a NEW directory and review a new version');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const shapes={
 car:'<path d="M70 235V165H135L180 100H335L395 165H485V235Z" fill="#4477aa"/><path d="M160 162L194 118H268V162ZM285 118H327L368 162H285Z" fill="#cce5ed"/><circle cx="165" cy="238" r="34" fill="#222"/><circle cx="398" cy="238" r="34" fill="#222"/>',
 phone:'<rect x="205" y="35" width="160" height="280" rx="22" fill="#30343b"/><rect x="218" y="58" width="134" height="224" rx="8" fill="#71a9c6"/><circle cx="285" cy="299" r="9" fill="#aaa"/>',
 laptop:'<rect x="135" y="65" width="310" height="190" rx="8" fill="#333"/><rect x="149" y="79" width="282" height="162" fill="#76b6c9"/><path d="M135 255H445L500 285H80Z" fill="#888"/><path d="M232 264H345L363 277H216Z" fill="#ddd"/>',
 sofa:'<rect x="105" y="100" width="375" height="165" rx="25" fill="#b68b60"/><rect x="80" y="177" width="50" height="105" rx="15" fill="#84613d"/><rect x="455" y="177" width="50" height="105" rx="15" fill="#84613d"/><path d="M137 211H450M286 117V248" stroke="#705237" stroke-width="7"/><path d="M125 268V298M470 268V298" stroke="#333" stroke-width="13"/>',
 tv:'<rect x="85" y="65" width="420" height="230" rx="10" fill="#252525"/><rect x="101" y="81" width="388" height="197" fill="#75a1c4"/><path d="M240 310H350M295 292V308" stroke="#333" stroke-width="12"/>',
 washer:'<rect x="177" y="40" width="245" height="292" rx="12" fill="#ddd" stroke="#555" stroke-width="5"/><path d="M182 101H417" stroke="#999" stroke-width="5"/><circle cx="300" cy="213" r="86" fill="#777"/><circle cx="300" cy="213" r="62" fill="#acd0e4"/><circle cx="367" cy="73" r="15" fill="#555"/>',
 house:'<path d="M115 170L300 35L490 170Z" fill="#976449"/><rect x="150" y="162" width="300" height="174" fill="#ded4af"/><rect x="273" y="228" width="60" height="108" fill="#765c44"/><path d="M177 186H247V251H177ZM357 186H427V251H357Z" fill="#82b5d2"/>',
 package:'<path d="M140 105L335 70L465 150V300L270 339L140 265Z" fill="#c69a66" stroke="#76542e" stroke-width="4"/><path d="M140 105L270 188L465 150M270 188V339M238 89L366 170V321" fill="none" stroke="#f0d6a8" stroke-width="12"/>',
 book:'<rect x="175" y="50" width="250" height="285" rx="8" fill="#569977"/><path d="M196 60V323M210 313H410" stroke="#e8e8cc" stroke-width="10"/><text x="237" y="150" font-size="30" fill="white">BOOK</text>',
 toy:'<path d="M130 145H424V189H291L276 276H215L232 189H130Z" fill="#26c3d4"/><rect x="400" y="145" width="32" height="44" fill="#ff9b2f"/><text x="205" y="90" font-size="32">TOY</text>',
 tools:'<path d="M210 95L235 70L440 275L415 300Z" fill="#87633b"/><path d="M133 55L183 20L287 110L253 150Z" fill="#777"/><path d="M128 300L220 204" stroke="#777" stroke-width="22"/>',
 shoes:'<path d="M96 195L165 155L240 205L326 244H490V302H89Z" fill="#795e48"/><path d="M100 282H490M180 194L252 223M207 180L279 230" stroke="white" stroke-width="10"/>',
 jacket:'<path d="M210 65L132 116L85 265L148 287L190 196V331H397V196L439 285L505 260L454 110L372 65L310 100Z" fill="#618675"/><path d="M303 110V321M228 264H271M335 264H378" stroke="#ddd" stroke-width="8"/>',
 stroller:'<path d="M170 106Q265 20 350 106L379 221H169Z" fill="#8195b3"/><path d="M174 220H378L421 95H473M190 225L230 298M340 224L368 298" fill="none" stroke="#555" stroke-width="14"/><circle cx="229" cy="310" r="25"/><circle cx="374" cy="310" r="25"/>',
 wheel:'<circle cx="300" cy="191" r="145" fill="#252525"/><circle cx="300" cy="191" r="90" fill="#aaa"/><circle cx="300" cy="191" r="23" fill="#333"/><path d="M300 105V164M385 191H325M300 219V277M215 191H272" stroke="#444" stroke-width="20"/>',
 lamp:'<path d="M243 47H353L409 181H186Z" fill="#e2bd69"/><path d="M296 183V310M236 315H355" stroke="#666" stroke-width="16"/>',
};
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380"><rect width="600" height="380" fill="#f6f5f0"/>${body}</svg>`;
const manifest={version:'moderation-benchmark-v1',origin:'programmatic synthetic vectors; no real photographs',fixtures:{}};
async function save(name,buffer,extra={}){const meta=await sharp(buffer).metadata();await writeFile(join(output,name+'.jpg'),buffer);manifest.fixtures[name]={file:'images/'+name+'.jpg',sha256:createHash('sha256').update(buffer).digest('hex'),width:meta.width,height:meta.height,...extra};}
for(const [name,shape] of Object.entries(shapes)){
 const source=Buffer.from(svg(shape));await writeFile(join(output,name+'.svg'),source);
 const base=await sharp(source).jpeg({quality:90}).toBuffer();await save(name,base,{kind:'object'});
 if(['car','phone','laptop','sofa','tv'].includes(name)){
  await save(name+'-resized',await sharp(base).resize(450,285).jpeg({quality:90}).toBuffer(),{kind:'duplicate_variant',reference:name,transform:'resize'});
  await save(name+'-bright',await sharp(base).modulate({brightness:1.04}).jpeg({quality:90}).toBuffer(),{kind:'duplicate_variant',reference:name,transform:'brightness'});
  await save(name+'-compressed',await sharp(base).jpeg({quality:70}).toBuffer(),{kind:'duplicate_variant',reference:name,transform:'compression'});
 }
}
const texts={
 'ocr-card':['TEST CARD','4242 4242 4242 4242','SYNTHETIC FIXTURE'],
 'ocr-document':['TEST PERSON','TEST DOCUMENT','TEST-ID-123456'],
 'ocr-ru':['УЧЕБНЫЙ МАКЕТ','ПАСПОРТ TEST-ID-123456','НЕ НАСТОЯЩИЙ ДОКУМЕНТ'],
 'ocr-kk':['СЫНАҚ ҮЛГІСІ','ЖЕКЕ КУӘЛІК TEST-ID-123456','НАҚТЫ ҚҰЖАТ ЕМЕС'],
 'ocr-mixed':['ТЕСТ / СЫНАҚ','TEST CARD 4242 4242 4242 4242','ЖЕКЕ ДЕРЕК ЕМЕС'],
 'ocr-safe':['BOOK / КІТАП','SYNTHETIC FIXTURE','ОҚУ МАТЕРИАЛЫ'],
 'ocr-vape':['DISPOSABLE VAPE','MANGO / MINT','SYNTHETIC LABEL'],
};
for(const [name,lines] of Object.entries(texts)){
 const body='<rect x="22" y="26" width="556" height="326" rx="14" fill="#eee" stroke="#aaa"/>'+lines.map((t,i)=>`<text x="40" y="${114+i*85}" font-family="DejaVu Sans,sans-serif" font-size="${t.length>30?23:29}" fill="#222">${t}</text>`).join('');
 const source=Buffer.from(svg(body));await writeFile(join(output,name+'.svg'),source);const base=await sharp(source).jpeg({quality:92}).toBuffer();await save(name,base,{kind:'ocr',synthetic_identifiers:true});
 if(name!=='ocr-safe'&&name!=='ocr-vape'){
  await save(name+'-rotated',await sharp(base).rotate(12,{background:'#f6f5f0'}).resize(600,380,{fit:'contain',background:'#f6f5f0'}).jpeg({quality:88}).toBuffer(),{kind:'ocr',synthetic_identifiers:true,transform:'rotation'});
  await save(name+'-small',await sharp(base).resize(360,228).jpeg({quality:84}).toBuffer(),{kind:'ocr',synthetic_identifiers:true,transform:'small_text'});
 }
}
for(const name of ['package','toy','car']){
 const base=await sharp(Buffer.from(svg(shapes[name]))).resize(64,40).blur(3).resize(600,380).jpeg({quality:45}).toBuffer();await save(name+'-unclear',base,{kind:'ambiguous',transform:'blur_and_low_resolution'});
}
const low=Buffer.from(svg('<rect x="25" y="30" width="550" height="320" fill="#ddd"/><text x="40" y="160" font-size="30" fill="#cecece">TEST DOCUMENT</text><text x="40" y="230" font-size="27" fill="#cecece">TEST-ID-123456</text>'));
await save('ocr-low-contrast',await sharp(low).jpeg({quality:65}).toBuffer(),{kind:'ocr',synthetic_identifiers:true,transform:'low_contrast'});
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({fixtures:Object.keys(manifest.fixtures).length,output}));
