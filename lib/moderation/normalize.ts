/** Fold only for candidate detection; never treat a folded keyword as a verdict. */
const confusables:Record<string,string>={a:'а',c:'с',e:'е',o:'о',p:'р',x:'х',y:'у',k:'к',m:'м',t:'т',b:'в',h:'н','0':'о','3':'з','4':'ч','@':'а'};
export function normalizeText(text:string){
  const plain=text.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  const folded=plain.replace(/[aceopxykmtbh034@]/g,c=>confusables[c]);
  return {plain,folded,compact:folded.replace(/[\s.\-_·]+/g,'')};
}
export function containsCandidate(text:string,term:string){
  const a=normalizeText(text),b=normalizeText(term);
  return a.folded.includes(b.folded)||a.compact.includes(b.compact);
}
export function detectPersonalData(text:string){
  const codes=new Set<string>();
  for(const match of text.matchAll(/(?<!\d)(?:\d[ -]?){12,19}(?!\d)/g)){
    const digits=match[0].replace(/\D/g,'');
    if(digits.length===12&&/^(?:\d{2})(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-6]\d{5}$/.test(digits))codes.add('personal_id');
    if(digits.length>=13&&digits.length<=19){let sum=0;for(let i=digits.length-1,n=0;i>=0;i--,n++){let v=Number(digits[i]);if(n%2){v*=2;if(v>9)v-=9}sum+=v}if(sum%10===0&&!/^(.)\1+$/.test(digits))codes.add('payment_card')}
  }
  if(/(?:иин|жсн|iin|паспорт|passport|удостоверени[ея]|жеке\s*куәлік)[\s:№#-]*[a-zа-я0-9-]{5,}/iu.test(text))codes.add('personal_id');
  return [...codes];
}
/** Provider input never contains account metadata; mask contact/identifier data in content too. */
export function redactText(text:string){return text.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[EMAIL]').replace(/(?:\+?\d[\s()-]?){7,19}/g,'[IDENTIFIER]').replace(/((?:паспорт|жсн|иин|удостоверение|жеке\s*куәлік)\s*[:№#-]?\s*)[\p{L}\d-]+/giu,'$1[IDENTIFIER]');}
