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

export type LexicalToken={value:string;clause:number;obfuscated:boolean;transliterated:boolean};
const lexicalLookalikes:Record<string,string>={...confusables,v:'в',n:'п',i:'і',s:'ѕ'};
const latinPairs:Record<string,string>={shch:'щ',zh:'ж',sh:'ш',ch:'ч',kh:'х',gh:'ғ',ng:'ң',yo:'е',yu:'ю',ya:'я'};
const latinLetters:Record<string,string>={a:'а',b:'б',c:'ц',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'ж',k:'к',l:'л',m:'м',n:'н',o:'о',p:'п',q:'қ',r:'р',s:'с',t:'т',u:'у',v:'в',w:'в',x:'кс',y:'ы',z:'з','ä':'ә','ö':'ө','ü':'ү','ñ':'ң','ğ':'ғ','ş':'ш','ı':'ы','á':'ә'};
/** Candidate representation only: original listing, provider input and display stay intact. */
export function foldLexicalToken(input:string){
 let word=input.normalize('NFKC').toLowerCase().replace(/ё/g,'е');
 const mixed=/[а-яәғқңөұүһі]/u.test(word)&&/[a-z]/.test(word),latin=/^[a-zäöüñğşıá0-9@]+$/u.test(word)&&/[a-zäöüñğşıá]/u.test(word);
 if(mixed)word=word.replace(/[a-z034@]/g,c=>lexicalLookalikes[c]??c);
 if(latin){word=word.replace(/[01345@]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','@':'a'})[c]!);word=word.replace(/shch|zh|sh|ch|kh|gh|ng|yo|yu|ya/g,c=>latinPairs[c]);word=word.replace(/[a-zäöüñğşıá]/gu,c=>latinLetters[c]??c);}
 word=word.replace(/[йіқғңәөүұ]/gu,c=>({'й':'и','і':'и','қ':'к','ғ':'г','ң':'н','ә':'а','ө':'о','ү':'у','ұ':'у'})[c]!);
 return {value:word,obfuscated:mixed||/[034@]/.test(input),transliterated:latin};
}
export function normalizeLexicalText(text:string){
 if(text.length>100_000)throw new Error('lexical_text_limit');
 const plain=normalizeText(text).plain;
 // Preserve clause boundaries, including newlines, independently of display normalization.
 const raw=text.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/ё/g,'е');
 const words=[...raw.matchAll(/[\p{L}\p{N}@]+/gu)],tokens:LexicalToken[]=[];let previousEnd=0,clause=0;
 for(let i=0;i<words.length;i++){
  let word=words[i][0],end=words[i].index+word.length;const start=words[i].index;let joined=false;
  if(word.length===1&&/\p{L}/u.test(word)){
   let j=i+1,value=word,last=end;
   while(j<words.length&&j-i<16&&words[j][0].length===1&&/\p{L}/u.test(words[j][0])&&/^[ ._·-]{1,4}$/.test(raw.slice(last,words[j].index))){value+=words[j][0];last=words[j].index+1;j++;}
   if(j-i>=3){word=value;end=last;i=j-1;joined=true;}
  }
  if(/[.,;!?\n+]/.test(raw.slice(previousEnd,start))||['и','а','но','және','бірақ'].includes(word))clause++;
  const folded=foldLexicalToken(word);tokens.push({...folded,clause,obfuscated:folded.obfuscated||joined});previousEnd=end;
 }
 return {plain,tokens,normalized:tokens.map(t=>`${t.clause}:${t.value}`).join(' ')};
}
