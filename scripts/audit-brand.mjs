import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('.'), target=resolve('artifacts/jevu-rebrand-20260909');
const mode=process.argv[2];
if(!['before','after'].includes(mode))throw Error('Use before or after');
await mkdir(target,{recursive:true});
const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].sort();
const inventory=[], occurrences=[];
for(const path of paths){
  let stat;try{stat=await lstat(path);}catch{continue;}
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Nonregular source: '+path);
  const bytes=await readFile(path), hash=createHash('sha256').update(bytes).digest('hex');
  const binary=bytes.includes(0);
  inventory.push({path,bytes:bytes.length,sha256:hash,binary});
  if(mode==='before'){
    const dest=resolve(target,'before',path);await mkdir(dirname(dest),{recursive:true});await copyFile(path,dest);
  }
  if(binary)continue;
  for(const [i,line] of bytes.toString('utf8').split(/\r?\n/).entries()){
    for(const match of line.matchAll(new RegExp('mar'+'keto','ig'))){
      occurrences.push({path,line:i+1,column:match.index+1,value:match[0],context:line.slice(Math.max(0,match.index-70),match.index+140)});
    }
  }
}
await writeFile(resolve(target,mode+'.json'),JSON.stringify({scope:'git tracked and nonignored worktree files; generated/dependency/private/history areas separately excluded',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),inventory,occurrences},null,2));
console.log(JSON.stringify({mode,files:inventory.length,binaryFiles:inventory.filter(x=>x.binary).length,occurrences:occurrences.length,matchingFiles:new Set(occurrences.map(x=>x.path)).size}));
