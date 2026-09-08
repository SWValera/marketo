import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const directory='artifacts/performance-20260908';
mkdirSync(directory,{recursive:true});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const paths=[...new Set(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean))];
const reviews=JSON.parse(readFileSync('docs/page-loading-review-scope.json','utf8'));
const files=[];const routes=[];const functions=[];
for(const path of paths){
  if(!existsSync(path))continue;
  const buffer=readFileSync(path);const text=buffer.includes(0)?null:buffer.toString('utf8');
  const row={path,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),lines:text?.split('\n').length??null,
    kind:text===null?'binary':/database.types|package-lock|CHECKSUMS|seeds|releases/.test(path)?'generated-or-reference-data':'own-text',
    review:reviews[path]?.level??'metadata-only',notes:reviews[path]?.notes??''};
  if(text!==null&&/\.[cm]?[jt]sx?$/.test(path)){
    const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,/tsx$/.test(path)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const imports=[];let awaits=0,calls=0;
    function visit(node){if(ts.isImportDeclaration(node))imports.push(node.moduleSpecifier.text);if(ts.isAwaitExpression(node))awaits++;if(ts.isCallExpression(node))calls++;ts.forEachChild(node,visit);}
    visit(source);Object.assign(row,{imports,awaits,calls,parseErrors:source.parseDiagnostics.length});
    if(!reviews[path])row.review='automatic-syntax-and-structure';
  }
  if(text!==null&&path.endsWith('.sql')){
    for(const match of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."']+)\s*\(/gi))functions.push({file:path,name:match[1],line:text.slice(0,match.index).split('\n').length});
    row.review=reviews[path]?.level??'automatic-sql-definition-index';
  }
  if(/^app\/.*(?:page|route)\.tsx?$/.test(path))routes.push({file:path,path:path.replace(/^app\//,'/').replace(/\/(page|route)\.tsx?$/,'')||'/',type:path.endsWith('route.ts')?'endpoint':'page',methods:text?[...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)].map(m=>m[1]):[]});
  files.push(row);
}
const versions={};for(const name of ['vinext','react','@supabase/ssr','@supabase/supabase-js','@supabase/auth-js','@supabase/postgrest-js','vite','wrangler'])versions[name]=JSON.parse(readFileSync('node_modules/'+name+'/package.json')).version;
const result={head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),status:git('status','--short'),versions,files,routes,functions,
  generatedAndThirdParty:'dist/.vinext: build validation, not manual review; node_modules: installed versions plus explicitly reviewed runtime files; ignored real environment/credentials/logs are not read.',
  browser:'NOT VERIFIED: CUA and Computer Use Node kernels fail with Windows apply deny-read ACLs before startup.'};
writeFileSync(directory+'/inventory.json',JSON.stringify(result,null,2));
writeFileSync(directory+'/routes.json',JSON.stringify(routes,null,2));
console.log(JSON.stringify({head:result.head,branch:result.branch,files:files.length,routes:routes.length,sqlDefinitions:functions.length,versions}));
