import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import * as pagination from '../lib/data/pagination.ts';
import * as filters from '../lib/listings/owner-filters.ts';

const code = await readFile(new URL('../lib/data/supabase/my-listings.ts', import.meta.url), 'utf8');
const modules = {
  '@/lib/data/supabase/authenticated-user': { resolveAuthenticatedUserId: async (_client, id) => { assert.equal(id, 'owner-a'); return id; } },
  '@/lib/data/supabase/listings': {},
  '@/lib/i18n/config': { localeTag: () => 'ru-KZ' },
  '@/lib/media/public-url': { publicMediaUrl: () => null, protectedMediaUrl: () => null },
  '../pagination.ts': pagination,
  '@/lib/listings/owner-filters': filters,
};
const exports = {};
new Function('require', 'exports', ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { assert.ok(name in modules, name); return modules[name]; }, exports);

function fixture({ total = 1, status = 'active', error = null } = {}) {
  const calls = [];
  const rows = total ? [{ id: 'listing-a', slug: 'item', title: 'Test', price_minor: 100, currency_code: 'KZT', status, created_at: '2026-01-01', updated_at: '2026-01-01', published_at: '2026-01-01', expires_at: '2099-01-01', deleted_at: null, categories: { name_ru: 'Категория' }, settlements: { name_ru: 'Город' } }] : [];
  return { calls, client: {
    from(table) {
      const operations = [];
      const query = {};
      for (const method of ['select', 'eq', 'neq', 'is', 'order', 'range', 'or', 'in']) query[method] = (...args) => { operations.push([method, ...args]); return query; };
      query.then = (resolve, reject) => {
        calls.push({ table, operations });
        const select = operations.find(op => op[0] === 'select');
        return Promise.resolve({ data: table === 'listings' ? (select?.[2]?.head ? null : rows) : [], count: select?.[2]?.count ? total : null, error: table === 'listings' ? error : null }).then(resolve, reject);
      };
      return query;
    },
    async rpc(name) { calls.push({ rpc: name }); return { data: [], error: null }; },
  } };
}

test('profile first page loads exact count and scoped rows in one request and skips irrelevant feedback', async () => {
  const f = fixture();
  const result = await exports.listMyListings(f.client, { authenticatedUserId: 'owner-a', tab: 'active' });
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  const queries = f.calls.filter(q => q.table === 'listings');
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].operations.find(op => op[0] === 'select')[2], { count: 'exact' });
  assert.ok(queries[0].operations.some(op => op[0] === 'eq' && op[1] === 'owner_id' && op[2] === 'owner-a'));
  assert.ok(queries[0].operations.some(op => op[0] === 'or' && op[1].includes('status.eq.active')));
  assert.ok(queries[0].operations.some(op => op[0] === 'is' && op[1] === 'deleted_at'));
  assert.equal(f.calls.some(q => q.rpc), false);
});

test('empty profile needs no images or feedback and still returns a correct empty state', async () => {
  const f = fixture({ total: 0 });
  const result = await exports.listMyListings(f.client, { authenticatedUserId: 'owner-a' });
  assert.equal(result.state, 'empty');
  assert.equal(result.totalPages, 0);
  assert.equal(f.calls.length, 1);
});

test('later pages validate the count before selecting rows; hostile page offsets never reach the database', async () => {
  const f = fixture({ total: 30 });
  const result = await exports.listMyListings(f.client, { authenticatedUserId: 'owner-a', page: 2 });
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
  assert.equal(f.calls.filter(q => q.table === 'listings').length, 2);
  const hostile = fixture({ total: 30 });
  const empty = await exports.listMyListings(hostile.client, { authenticatedUserId: 'owner-a', page: Number.MAX_SAFE_INTEGER });
  assert.equal(empty.state, 'out_of_range');
  assert.equal(hostile.calls.length, 1);
  assert.equal(hostile.calls[0].operations.some(op => op[0] === 'range'), false);
});

test('rejected ads retain moderation feedback; database errors are never displayed as an empty account', async () => {
  const f = fixture({ status: 'rejected' });
  await exports.listMyListings(f.client, { authenticatedUserId: 'owner-a' });
  assert.equal(f.calls.filter(q => q.rpc === 'get_my_listing_moderation_feedback').length, 1);
  const bad = fixture({ error: { code: '08006' } });
  await assert.rejects(exports.listMyListings(bad.client, { authenticatedUserId: 'owner-a' }), e => e.code === 'LIST_UNAVAILABLE');
});
