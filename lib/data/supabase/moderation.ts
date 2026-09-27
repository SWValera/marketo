import type { JevuSupabaseClient } from "@/lib/data/supabase/client";
import type {
  ModerationDecision,
  ModerationListingDetail,
  ModerationQueueItem,
  NumberedPageResult,
} from "@/lib/data/types";
import { listingNumber, listingDate } from "@/lib/i18n/listing-formatters";
import type { Locale } from "@/lib/i18n/messages";
import type { ModerationRejectionReason } from "@/lib/moderation/policy";
import { normalizePageSize, normalizePositivePage, pageWindow } from "../pagination.ts";
import {
  ModerationDataError,
  moderationMediaUrl,
} from "./moderation-core.ts";

export { ModerationDataError, moderationMediaUrl, normalizeModerationQueueQueryResult } from "./moderation-core.ts";

const MAX_QUEUE_PAGE_SIZE = 50;

function priceLabel(priceMinor: number | null, currencyCode: string, locale: Locale) {
  if (priceMinor === null) return locale === "kk" ? "Келісімді" : "Договорная";
  const exponent = currencyCode === "KZT" ? 0 : 2;
  const amount = priceMinor / (10 ** exponent);
  const symbol = currencyCode === "KZT" ? "₸" : currencyCode;
  return `${listingNumber(amount, locale, exponent)} ${symbol}`;
}

function dateLabel(value: string, locale: Locale) {
  return listingDate(value, locale, "moderation");
}

type QueueRow={effective_state:string;label_code:string;id:string;title:string;price_minor:number|null;currency_code:string;status:string;owner_id:string|null;created_at:string;category_ru:string;category_kk:string;city_ru:string;city_kk:string;seller_name:string|null;image_key:string|null;decision:string|null;manual_decision:string|null;overridden:boolean};
export async function listModerationQueue(client:JevuSupabaseClient,options:{page?:number;pageSize?:number;locale?:Locale;filter?:string}={}):Promise<NumberedPageResult<ModerationQueueItem>>{
 const page=normalizePositivePage(options.page),pageSize=normalizePageSize(options.pageSize,24,MAX_QUEUE_PAGE_SIZE),locale=options.locale??'ru';
 const {data,error}=await client.rpc('moderation_dashboard',{selected_filter:options.filter??'all',requested_page:page,page_size:pageSize});
 if(error||!data)throw new ModerationDataError('QUEUE_UNAVAILABLE',error);
 const result=data as unknown as {items:QueueRow[];total:number;counts:Record<string,number>};const pagination=pageWindow(result.total,page,pageSize);
 return {items:result.items.map(row=>({effectiveState:row.effective_state,labelCode:row.label_code,id:row.id,title:row.title,priceLabel:priceLabel(row.price_minor,row.currency_code,locale),currencyCode:row.currency_code,cityLabel:locale==='kk'?row.city_kk:row.city_ru,categoryLabel:locale==='kk'?row.category_kk:row.category_ru,createdAt:row.created_at,createdLabel:dateLabel(row.created_at,locale),sellerId:row.owner_id,sellerName:row.seller_name??(locale==='kk'?'Сатушы':'Продавец'),imageUrl:moderationMediaUrl(row.image_key),status:row.status,automaticDecision:row.decision,manualDecision:row.manual_decision,overridden:row.overridden})),total:result.total,counts:result.counts,page,totalPages:pagination.totalPages,nextCursor:page<pagination.totalPages?String(page+1):null,state:pagination.outOfRange?'out_of_range':result.total?'ready':'empty'};
}
type CaseRow={id:string;title:string;description:string;price_minor:number|null;currency_code:string;status:ModerationListingDetail['status'];created_at:string;owner_id:string|null;seller_name:string|null;city_ru:string;city_kk:string;category_path:{ru:string;kk:string}[];images:{id:string;storage_key:string;sort_order:number}[];summary:ModerationListingDetail['summary'];attributes:{key:string;ru:string;kk:string;unit_ru:string|null;unit_kk:string|null;values:{ru?:string;kk?:string;text?:string;number?:number;boolean?:boolean;date?:string;min?:number;max?:number}[]}[]};
export async function getModerationListingDetail(client:JevuSupabaseClient,listingId:string,locale:Locale='ru'):Promise<ModerationListingDetail|null>{
 const {data,error}=await client.rpc('moderation_case',{target_listing_id:listingId});if(error)throw new ModerationDataError('DETAIL_UNAVAILABLE',error);if(!data)return null;
 const r=data as unknown as CaseRow,kk=locale==='kk';
 return {id:r.id,title:r.title,description:r.description,priceMinor:r.price_minor,priceLabel:priceLabel(r.price_minor,r.currency_code,locale),currencyCode:r.currency_code,status:r.status,createdAt:r.created_at,createdLabel:dateLabel(r.created_at,locale),sellerId:r.owner_id,sellerName:r.seller_name??(kk?'Сатушы':'Продавец'),cityLabel:kk?r.city_kk:r.city_ru,categoryPath:r.category_path.map(c=>kk?c.kk:c.ru),images:r.images.map(i=>({id:i.id,url:moderationMediaUrl(i.storage_key)??'',sortOrder:i.sort_order})),summary:r.summary,attributes:r.attributes.map(a=>({key:a.key,label:kk?a.kk:a.ru,value:a.values.map(v=>v.ru?(kk?v.kk:v.ru):v.text??v.number??(typeof v.boolean==='boolean'?(v.boolean?(kk?'Иә':'Да'):(kk?'Жоқ':'Нет')):v.date??(v.min!=null&&v.max!=null?`${v.min}–${v.max}`:''))).join(', ')+((kk?a.unit_kk:a.unit_ru)?` ${kk?a.unit_kk:a.unit_ru}`:'')}))};
}

export async function moderateListing(
  client: JevuSupabaseClient,
  listingId: string,
  decision: ModerationDecision,
  reasonCode?: ModerationRejectionReason,
  note?: string,
  receipt?: {revision:string;requestId:string},
) {
  const args = {
    target_listing_id: listingId,
    decision,
    reason_code: decision !== "approve" ? reasonCode ?? null : null,
    note: note?.trim() || null,
  };
  if(!receipt)throw new Error("revision_required");
  const {data,error}=await client.rpc("moderate_listing_checked",{...args,expected_revision:receipt.revision,request_id:receipt.requestId});
  if (error) throw error;
  return data;
}

export async function createReport(
  client: JevuSupabaseClient,
  input: { reporterId: string; listingId?: string; reportedUserId?: string; reasonCode: string; details?: string },
) {
  if (!input.listingId) throw new Error("listing_report_required");
  const { data, error } = await client.rpc("report_listing", {
    target_listing_id: input.listingId, reason: input.reasonCode, details: input.details ?? null,
  });
  if (error) throw error;
  return data;
}
