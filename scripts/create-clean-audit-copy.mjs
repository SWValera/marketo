import {execFileSync} from 'node:child_process';
import {mkdir,copyFile,lstat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
const root=resolve('.');
const target=resolve('artifacts/performance-20260908/clean-install');
await mkdir(target); // refuse reuse, particularly a previous node_modules link
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let count=0;
for(const path of new Set(paths)){
  if(/(^|\/)(?:\.git|\.agents|\.codex|artifacts|dist|node_modules|\.sites-runtime|\.vinext|\.wrangler|outputs|work)(\/|$)/.test(path))continue;
  if(/(^|\/)\.env(?!\.example$)|\.(?:log|pem|key|dump|sqlite|zip|tar)$/.test(path))continue;
  const source=resolve(root,path),destination=resolve(target,path);
  if(!destination.startsWith(target+sep)||!source.startsWith(root+sep))throw new Error('Path outside scoped copy');
  if(!(await lstat(source)).isFile())throw new Error('Non-regular source');
  await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination);count++;
}
console.log(JSON.stringify({target,files:count,dependenciesCopied:false,credentialsCopied:false}));
