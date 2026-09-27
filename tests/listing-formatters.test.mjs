import test from 'node:test';
import assert from 'node:assert/strict';
import {listingNumber,listingDate} from '../lib/i18n/listing-formatters.ts';

test('reused RU/KK formatters preserve exact price, rounding, publication and Almaty owner date labels',()=>{
 for(const locale of ['ru','kk']){
  const tag=locale==='kk'?'kk-KZ':'ru-KZ';
  for(const precision of [0,2])for(const value of [0,1,1.999,1234567.89,12900000])
   assert.equal(listingNumber(value,locale,precision),value.toLocaleString(tag,{maximumFractionDigits:precision}));
  const date={day:'numeric',month:'short',year:'numeric'};
  for(const value of ['2026-09-27T23:50:00Z','2026-01-01T00:00:00Z'])for(const [kind,options] of Object.entries({published:date,moderation:{...date,hour:'2-digit',minute:'2-digit'},owner:{...date,timeZone:'Asia/Almaty',timeZoneName:'short',hour:'2-digit',minute:'2-digit'}}))
   assert.equal(listingDate(value,locale,kind),new Intl.DateTimeFormat(tag,options).format(new Date(value)));
 }
});
