import {readFile,open,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
// Local isolated evaluation only. Production's separate DB budget is untouched.
// External production AI must remain OFF; imports account for other known calls.
export async function readLedger(directory){
 await mkdir(directory,{recursive:true});
 try{return JSON.parse(await readFile(join(directory,'budget.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {version:1,prior:[],reservations:[]};}
}
export function reserve(ledger,{id,date,runId,rerun,digest}){
 const old=ledger.reservations;
 if(old.some(r=>r.digest!==digest))throw Error('Frozen benchmark digest changed');
 if(old.length>=40)throw Error('Campaign maximum 40 calls reserved');
 if(old.filter(r=>Boolean(r.rerun)===Boolean(rerun)).length>=(rerun?10:30))throw Error('Initial/rerun call budget exhausted');
 const same=old.filter(r=>r.id===id);
 if(same.length>=2||same.length&&!rerun||rerun&&!same.length)throw Error('Case requires a controlled defect rerun, at most two calls');
 const day=old.filter(r=>r.date===date).length+ledger.prior.filter(r=>r.date===date).reduce((n,r)=>n+r.calls,0);
 if(day>=50)throw Error('Daily maximum 50 calls reserved');
 old.push({id,date,runId,rerun:rerun??null,digest});return ledger;
}
export async function saveLedger(directory,ledger){
 const temporary=join(directory,'budget.tmp');const handle=await open(temporary,'w',0o600);
 try{await handle.writeFile(JSON.stringify(ledger,null,2)+'\n');await handle.sync();}finally{await handle.close();}
 await rename(temporary,join(directory,'budget.json'));
}
