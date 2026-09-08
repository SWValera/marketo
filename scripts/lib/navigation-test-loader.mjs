import {transformNavigationRead} from '../../build/navigation-read-guard.ts';
export async function load(url, context, nextLoad) {
  const result=await nextLoad(url,context);
  if(!url.includes('/vinext/dist/'))return result;
  const source=Buffer.from(result.source).toString();
  const transformed=transformNavigationRead(source,decodeURI(url));
  if(transformed===null)return result;
  const runtime=new URL('../../lib/navigation/page-read.ts',import.meta.url).href;
  return {...result,source:transformed.replaceAll('"/lib/navigation/page-read.ts"',JSON.stringify(runtime))};
}
