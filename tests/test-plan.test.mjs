import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {pgliteRunScopes} from '../scripts/lib/test-plan.mjs';

test('normal test plan requires both security databases in separate processes without omitting other suites',async()=>{
  assert.deepEqual(pgliteRunScopes('supabase-security.test.mjs'),['current','replay']);
  assert.deepEqual(pgliteRunScopes('supabase-migrations.test.mjs'),[null]);
  assert.deepEqual(pgliteRunScopes('premium-commercial-security.test.mjs'),[null]);
  const runner=await readFile(new URL('../scripts/test.mjs',import.meta.url),'utf8');
  assert.match(runner,/for \(const scope of pgliteRunScopes\(basename\(testFile\)\)\)/);
  assert.match(runner,/delete environment\.MARKETO_DB_AUDIT_SCOPE/);
  assert.match(runner,/environment: scopedEnvironment/);
});
