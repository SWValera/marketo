import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
/** Fail even when a provider catches the blocked network exception internally. */
export async function withOfflineNetworkGuard(operation){
 let attempts=0;const block=()=>{attempts++;throw Error('NETWORK_FORBIDDEN_IN_OFFLINE_BENCHMARK');};
 const originals={fetch:globalThis.fetch,httpGet:http.get,httpRequest:http.request,httpsGet:https.get,httpsRequest:https.request};
 globalThis.fetch=async()=>block();http.get=block;http.request=block;https.get=block;https.request=block;syncBuiltinESMExports();
 try{return await operation();}
 finally{globalThis.fetch=originals.fetch;http.get=originals.httpGet;http.request=originals.httpRequest;https.get=originals.httpsGet;https.request=originals.httpsRequest;syncBuiltinESMExports();if(attempts)throw Error('OFFLINE_NETWORK_ATTEMPT:'+attempts);}
}
