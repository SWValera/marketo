import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasIgnoredSourceSegment } from "./lib/source-paths.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationDir = resolve(root, "supabase/migrations");
const expectedMigrations = [
  "0001_extensions_and_helpers.sql",
  "0002_geography.sql",
  "0003_profiles_and_roles.sql",
  "0004_categories_and_attributes.sql",
  "0005_listings.sql",
  "0006_favorites.sql",
  "0007_chat.sql",
  "0008_notifications.sql",
  "0009_reports_moderation_and_audit.sql",
  "0010_rls_and_grants.sql",
  "0011_indexes_and_search.sql",
  "0012_realtime.sql",
  "0013_passenger_vehicle_reference.sql",
  "0014_category_attribute_metadata.sql",
  "0015_category_attribute_normalization.sql",
  "0016_listing_attribute_roundtrip.sql",
  "0017_master_catalog.sql",
  "0018_auth_profile_flow.sql",
  "0019_city_premium_showcase.sql",
  "0020_targeted_catalog_and_premium_foundation.sql",
  "0021_auth_role_rpc_hardening.sql",
  "0022_active_staff_moderation_hardening.sql",
  "0023_owner_listing_draft_lifecycle.sql",
  "0024_catalog_completeness.sql",
  "0025_security_boundary_repair.sql",
];

const immutableMigrationHashes = {
  "0001_extensions_and_helpers.sql": "7dcab9ccf19dcd177cdf983cd08cd33dc2b70777b5b30d5211214d789daa2794",
  "0002_geography.sql": "a593251fdd0949b274bbd4273896b317d9605c5e8ccbc291693c729082445279",
  "0003_profiles_and_roles.sql": "5c1fb78ae4673ee5f7447eb6d4540ca8117c252aa017c6b35a2c9bd604eaccf3",
  "0004_categories_and_attributes.sql": "258cc44c6fcab6b4b36e0c8f38b0c9345a775b534567f3392576e36df4f22481",
  "0005_listings.sql": "3f0f76aee09e3e17b7b591f9abe8ac5eb52ddcb8b3e1eba2ddc008132b207cad",
  "0006_favorites.sql": "603228c772df46ff426834b0f7cea9d04c849dd5461ee7d24b655929d649c05e",
  "0007_chat.sql": "992fb539a58b9d94a3c174b0bbc37cb381a447023571cdd92c1286b6ca890761",
  "0008_notifications.sql": "3d77b3ee01748a2a840b2ceb96e3d2eaf02c5dbaab295a55766bcce12dd6676e",
  "0009_reports_moderation_and_audit.sql": "90097872d3db866efdf2b5afde048ff539bb835e715759df87d48bd313cb449f",
  "0010_rls_and_grants.sql": "f5ea5ba7bc18f38aa1682c3e0f94f42f80391a240a88791b2ffb43359efd27a9",
  "0011_indexes_and_search.sql": "f7fafd8b55e1eef2f8294ade5dc2fff99cfc0b4df82089c31990f9719a5d6867",
  "0012_realtime.sql": "5f1734796bc10b1240c8757448d24123e4da6fcbd97d18460124ae25718683b2",
  "0013_passenger_vehicle_reference.sql": "68f61cb60b8513b82fdb93a9aa449120df669e5810ef66978203f18a7bc7da52",
  "0014_category_attribute_metadata.sql": "74089f52f979c0b3bfdc103b39f35c1cea68c05187692e3fd2167ba110ccccc9",
  "0015_category_attribute_normalization.sql": "b04773a20e2ac8fa6e58f7231a37104b5cc49767fb77e4dcb44ea173ed0599af",
  "0016_listing_attribute_roundtrip.sql": "54b739c3103648f5e3349ba74c82afab4cd72de4c2b350af333af14ec0152b5e",
  "0017_master_catalog.sql": "8db55b8f9489bf3a2f6789c852c99a1097db46355a10487e9747787ee3027566",
  "0018_auth_profile_flow.sql": "116669344b23e2674d4181b7aee976c1a7608f2500245be21d93764841e008a2",
  "0019_city_premium_showcase.sql": "61381f5e84b7d67ce2e4223f2fcb7f8266850294ad383413be212dd714885df4",
  "0020_targeted_catalog_and_premium_foundation.sql": "aefcd0e8b0a1386fa0d637eb52b83f6c9e905e407ec820fe2957ef67eb51a757",
  "0021_auth_role_rpc_hardening.sql": "c26bd4b8730b669d2ef2964e5912dc41b2fc057e4b06204d4164426dfb5048a3",
  "0022_active_staff_moderation_hardening.sql": "9bb9b82b96e5668125e636643449409a840b1df82d5e17cfc8e4fefdc6d9be91",
};

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
check(JSON.stringify(files) === JSON.stringify(expectedMigrations), "Migration filenames/order do not match the reviewed sequence.");

const migrations = new Map();
for (const file of files) migrations.set(file, await readFile(resolve(migrationDir, file), "utf8"));
for (const [file, expectedHash] of Object.entries(immutableMigrationHashes)) {
  const actualHash = createHash("sha256").update(migrations.get(file) ?? "").digest("hex");
  check(actualHash === expectedHash, `Immutable migration changed: ${file}.`);
}
const allSql = [...migrations.values()].join("\n");
for (const [file, sql] of migrations) {
  check(/^\s*--[\s\S]*?\bbegin;/i.test(sql), `${file} must start a transaction.`);
  check(/commit;\s*$/i.test(sql), `${file} must commit its transaction.`);
}

const createdTables = [...allSql.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]);
const rlsSql = [...migrations.values()].join("\n");
const rlsTables = [...rlsSql.matchAll(/alter table public\.([a-z_]+) enable row level security/gi)].map((match) => match[1]);
check(new Set(createdTables).size === createdTables.length, "A public table is created more than once.");
check(
  JSON.stringify([...new Set(createdTables)].sort()) === JSON.stringify([...new Set(rlsTables)].sort()),
  "Every public table must have RLS enabled exactly in the reviewed policy migration.",
);
check(!/\b(?:using|with check)\s*\(\s*true\s*\)/i.test(rlsSql), "Unrestricted RLS policy found.");

for (const match of allSql.matchAll(/security definer/gi)) {
  const nearby = allSql.slice(match.index, match.index + 220);
  check(/set search_path\s*=\s*''/i.test(nearby), `SECURITY DEFINER near offset ${match.index} has no empty search_path.`);
}
check(/grant select \(id, display_name, avatar_path, bio, settlement_id, verified_at, created_at\)[\s\S]*?to anon, authenticated;/i.test(rlsSql), "Authenticated public profile access must remain column-limited.");
check(!/grant select on table[\s\S]{0,500}public\.profiles[\s\S]{0,500}to authenticated;/i.test(rlsSql), "Authenticated role has table-wide profile SELECT access.");
check(!/grant select on table[\s\S]{0,500}public\.profile_private[\s\S]{0,80}to anon;/i.test(rlsSql), "Private profile data is exposed to anon.");
check(/get_my_profile\(\)/.test(allSql), "Self-profile RPC is missing.");
check(/get_profile_for_staff\(target_profile_id uuid\)/.test(allSql), "Staff profile RPC is missing.");
check(/message_type = 'text'/.test(rlsSql), "Direct authenticated chat inserts must be text-only.");
check(!/grant\s+(?:insert|update|delete)[\s\S]{0,240}on public\.listing_images to authenticated/i.test(rlsSql), "Browser role can mutate unverified R2 image metadata.");
check(!/create policy listing_images_owner_(?:insert|update|delete)/i.test(rlsSql), "R2 image metadata has a client mutation policy.");
for (const table of ["listing_attribute_values", "listing_attribute_option_values", "listing_images"]) {
  const escaped = table.replaceAll("_", "_");
  check(
    new RegExp(`create policy [a-z_]+_anon_active_read[\\s\\S]{0,900}on public\\.${escaped}[\\s\\S]{0,900}listings\\.status = 'active'[\\s\\S]{0,500}listings\\.deleted_at is null`, "i").test(rlsSql),
    `${table} has no explicit active-parent anonymous SELECT policy.`,
  );
  check(
    new RegExp(`create policy [a-z_]+_authenticated_read[\\s\\S]{0,1500}on public\\.${escaped}[\\s\\S]{0,1500}listings\\.owner_id = \\(select auth\\.uid\\(\\)\\)`, "i").test(rlsSql),
    `${table} has no explicit owner-aware authenticated SELECT policy.`,
  );
}

const moderationSql = migrations.get("0009_reports_moderation_and_audit.sql") ?? "";
for (const transition of [
  "decision = 'approve' and old_status = 'pending'",
  "decision = 'reject' and old_status = 'pending'",
  "decision = 'hide' and old_status = 'active'",
  "decision = 'restore' and old_status = 'archived'",
]) check(moderationSql.includes(transition), `Moderation transition is missing: ${transition}.`);
check(/next_status is null[\s\S]{0,240}not allowed/i.test(moderationSql), "Moderation function does not reject an invalid transition.");

const profileSql = migrations.get("0003_profiles_and_roles.sql") ?? "";
check((profileSql.match(/on conflict \((?:id|user_id)\) do nothing/gi) ?? []).length >= 2, "Auth profile trigger is not idempotent for both profile tables.");
check(!/raw_user_meta_data\s*->>\s*'(?:status|role|verified_at|is_verified|admin)'/i.test(profileSql), "Auth signup metadata can influence a protected profile field.");

const seed = await readFile(resolve(root, "supabase/seeds/001_marketo_reference.sql"), "utf8");
check(/Contains no users, listings, chats/.test(seed), "Reference seed provenance header is missing.");
check(/reviewed Marketo v1\.0 reference taxonomy/i.test(seed), "Reference seed must identify the category taxonomy as reviewed.");
check(/90-city bootstrap/i.test(seed), "Reference seed must identify geography as a 90-city bootstrap.");
check(!/insert into public\.(?:profiles|profile_private|listings|favorites|conversations|messages|notifications|reports)\b/i.test(seed), "Reference seed contains product/user data.");
check((seed.match(/insert into public\.categories \(/g) ?? []).length === 1356, "Reference seed category count drifted from the Master Catalog contract.");
check((seed.match(/insert into public\.settlements \(/g) ?? []).length === 90, "Reviewed city baseline must contain exactly 90 cities.");
check(/filter_mode text not null default 'exact'/.test(allSql), "Category filter-mode metadata is missing.");
check(/parent_option_id uuid/.test(allSql), "Dependent option parent relation is missing.");
check(/create or replace function public\.create_listing_draft/.test(allSql), "Atomic listing draft roundtrip RPC is missing.");
check(/create_listing_draft[\s\S]{0,900}security invoker/i.test(migrations.get("0016_listing_attribute_roundtrip.sql") ?? ""), "Listing draft RPC must remain SECURITY INVOKER.");
const masterCatalogSql = migrations.get("0017_master_catalog.sql") ?? "";
check(/create or replace function public\.search_catalog_listing_cards/.test(masterCatalogSql), "Master Catalog buyer-filter RPC is missing.");
check(/search_catalog_listing_cards[\s\S]{0,900}security invoker/i.test(masterCatalogSql), "Master Catalog buyer-filter RPC must remain SECURITY INVOKER.");
check(/attribute\.is_filterable/.test(masterCatalogSql), "Master Catalog RPC does not enforce filterable seller metadata.");
const authProfileSql = migrations.get("0018_auth_profile_flow.sql") ?? "";
check(/create or replace function public\.get_my_account_profile/.test(authProfileSql), "Authenticated account-profile read RPC is missing.");
check(/create or replace function public\.update_my_account_profile/.test(authProfileSql), "Atomic account-profile update RPC is missing.");
check(/update_my_account_profile[\s\S]{0,5000}actor_id uuid := \(select auth\.uid\(\)\)[\s\S]{0,5000}where profile\.id = actor_id/.test(authProfileSql), "Profile update is not bound to auth.uid().");
const premiumSql = migrations.get("0019_city_premium_showcase.sql") ?? "";
check(/capacity smallint not null default 15/.test(premiumSql), "City Premium default capacity is not 15.");
check(/city premium capacity exceeded/.test(premiumSql), "City Premium capacity guard is missing.");
check(/create or replace function public\.get_city_premium_placements/.test(premiumSql), "City Premium active-placement RPC is missing.");
check(/get_city_premium_placements[\s\S]{0,1500}security invoker/i.test(premiumSql), "City Premium public RPC must remain SECURITY INVOKER.");
const targetedCorrectionSql = migrations.get("0020_targeted_catalog_and_premium_foundation.sql") ?? "";
check(/catalog_count <> 1356/.test(targetedCorrectionSql), "Targeted migration has no 1356-category shrink guard.");
check(/search_placeholder_ru = resolved\.search_ru/.test(targetedCorrectionSql), "Contextual RU/KK catalog metadata update is missing.");
check(/create table public\.city_premium_accounts/.test(targetedCorrectionSql), "Premium account ownership foundation is missing.");
check(/create table public\.city_premium_orders/.test(targetedCorrectionSql), "Payment-neutral Premium order foundation is missing.");
check(/payment_status text not null default 'unbilled'/.test(targetedCorrectionSql), "Payment-neutral status field is missing.");
check(/priority smallint not null default 0/.test(targetedCorrectionSql), "Premium priority metadata is missing.");
check(/rotation_weight numeric\(8,4\) not null default 1\.0000/.test(targetedCorrectionSql), "Premium rotation weight metadata is missing.");
check(/create table public\.city_premium_events/.test(targetedCorrectionSql), "Raw Premium analytics events are missing.");
check(/event_type in \('impression', 'click'\)/.test(targetedCorrectionSql), "Premium impression/click event contract is missing.");
check(/create table public\.city_premium_daily_metrics/.test(targetedCorrectionSql), "Premium daily aggregate foundation is missing.");
check(/city_premium_events_account_owner_read/.test(targetedCorrectionSql) && /city_premium_daily_metrics_account_owner_read/.test(targetedCorrectionSql), "Premium analytics RLS is not account-scoped.");
check(!/10[ _]?000/.test(targetedCorrectionSql), "Premium correction hardcodes a commercial price.");
check(!/insert into public\.city_premium_placements/i.test(targetedCorrectionSql), "Targeted correction creates fake Premium placements.");
const authRpcHardeningSql = migrations.get("0021_auth_role_rpc_hardening.sql") ?? "";
check(/revoke execute on all functions in schema public from public, anon/i.test(authRpcHardeningSql), "Public RPC EXECUTE defaults are not revoked from PUBLIC and anon.");
check(/revoke execute on all functions in schema private from public, anon/i.test(authRpcHardeningSql), "Private RPC EXECUTE defaults are not revoked from PUBLIC and anon.");
for (const signature of [
  "public.get_my_account_profile()",
  "public.update_my_account_profile(text, text, varchar, uuid, text)",
]) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check(new RegExp(`revoke execute on function ${escaped} from public, anon`, "i").test(authRpcHardeningSql), `${signature} is not explicitly revoked from PUBLIC and anon.`);
  check(new RegExp(`grant execute on function ${escaped} to authenticated`, "i").test(authRpcHardeningSql), `${signature} is not explicitly authenticated-only.`);
}
check(/grant execute on function public\.search_catalog_listing_cards[\s\S]{0,240}to anon, authenticated, service_role/i.test(authRpcHardeningSql), "Catalog search is missing from the anonymous RPC allowlist.");
check(/grant execute on function public\.get_city_premium_placements[\s\S]{0,180}to anon, authenticated, service_role/i.test(authRpcHardeningSql), "City Premium read is missing from the anonymous RPC allowlist.");
const moderationHardeningSql = migrations.get("0022_active_staff_moderation_hardening.sql") ?? "";
check(/join public\.profiles as profile on profile\.id = role_row\.user_id[\s\S]{0,300}profile\.status = 'active'/i.test(moderationHardeningSql), "Staff roles are not bound to an active profile.");
for (const policy of [
  "listings_authenticated_read",
  "listing_attribute_values_authenticated_read",
  "listing_attribute_options_authenticated_read",
  "listing_images_authenticated_read",
]) {
  check(new RegExp(`drop policy if exists ${policy}[\\s\\S]{0,2200}private\\.has_any_role\\(array\\['moderator', 'admin'\\]\\)`, "i").test(moderationHardeningSql), `${policy} is not restricted to moderation staff.`);
}
check(/normalized_reason not in \([\s\S]{0,500}'other'/i.test(moderationHardeningSql), "Moderation reason codes have no stable allowlist.");
check(/char_length\(normalized_note\) > 2000/i.test(moderationHardeningSql), "Moderation notes have no bounded length.");
check(/revoke execute on function public\.moderate_listing\(uuid, text, text, text\) from public, anon/i.test(moderationHardeningSql), "Moderation RPC is not revoked from PUBLIC and anon.");
check(/grant execute on function public\.moderate_listing\(uuid, text, text, text\) to authenticated/i.test(moderationHardeningSql), "Moderation RPC is not granted to authenticated sessions.");
const ownerLifecycleSql = migrations.get("0023_owner_listing_draft_lifecycle.sql") ?? "";
check(/create or replace function public\.update_listing_draft\(/i.test(ownerLifecycleSql), "Atomic owner draft update RPC is missing.");
check(/update_listing_draft[\s\S]{0,1200}security invoker/i.test(ownerLifecycleSql), "Owner draft update RPC must remain SECURITY INVOKER.");
check(/listing\.owner_id = actor_id[\s\S]{0,180}listing\.status in \('draft', 'rejected'\)[\s\S]{0,180}for update/i.test(ownerLifecycleSql), "Owner draft update is not owner-bound, state-bound and row-locked.");
check(/delete from public\.listing_attribute_option_values[\s\S]{0,300}delete from public\.listing_attribute_values/i.test(ownerLifecycleSql), "Owner draft update does not replace old typed attributes atomically.");
check(/revoke all on function public\.update_listing_draft[\s\S]{0,300}from public, anon, service_role/i.test(ownerLifecycleSql), "Owner draft update privileges are not explicitly revoked.");
check(/grant execute on function public\.update_listing_draft[\s\S]{0,300}to authenticated/i.test(ownerLifecycleSql), "Owner draft update is not authenticated-only.");
check(/create or replace function public\.get_my_listing_moderation_feedback/i.test(ownerLifecycleSql), "Safe owner rejection-feedback RPC is missing.");
check(/get_my_listing_moderation_feedback[\s\S]{0,900}security definer[\s\S]{0,200}set search_path = ''/i.test(ownerLifecycleSql), "Owner feedback RPC must have a fixed empty search path.");
check(!/returns table\([^)]*(?:moderator_id|note|metadata)/i.test(ownerLifecycleSql), "Owner feedback RPC exposes staff-only moderation data.");
check(/revoke all on function public\.get_my_listing_moderation_feedback\(uuid\)[\s\S]{0,120}from public, anon, service_role/i.test(ownerLifecycleSql), "Owner feedback RPC privileges are not explicitly revoked.");
check(/grant execute on function public\.get_my_listing_moderation_feedback\(uuid\)\s*to authenticated/i.test(ownerLifecycleSql), "Owner feedback RPC is not authenticated-only.");

const catalogCompletenessSql = migrations.get("0024_catalog_completeness.sql") ?? "";
check(/source category count mismatch: expected 1356/i.test(catalogCompletenessSql), "Catalog completeness migration has no exact 1356-category source preflight.");
check(/source attribute count mismatch: expected 14310/i.test(catalogCompletenessSql), "Catalog completeness migration has no exact active-attribute source preflight.");
check(/source option count mismatch: expected 84490/i.test(catalogCompletenessSql), "Catalog completeness migration has no exact active-option source preflight.");
check(/active attribute count mismatch: expected 14310/i.test(catalogCompletenessSql), "Catalog completeness migration has no exact active-attribute postflight.");
check(/active option count mismatch: expected 84490/i.test(catalogCompletenessSql), "Catalog completeness migration has no exact active-option postflight.");
check(/existing\.data_type <> target\.data_type[\s\S]{0,240}refuses to change the data type/i.test(catalogCompletenessSql), "Catalog completeness migration can silently change a stable attribute type.");
check(/listing_attribute_values[\s\S]{0,400}listing_attribute_option_values[\s\S]{0,400}refuses to deactivate an attribute referenced by a listing/i.test(catalogCompletenessSql), "Catalog completeness migration has no referenced-attribute deactivation guard.");
check(/listing_attribute_option_values[\s\S]{0,500}refuses to deactivate an option referenced by a listing/i.test(catalogCompletenessSql), "Catalog completeness migration has no referenced-option deactivation guard.");
check(/set is_required = target\.is_required\s+and coalesce\([\s\S]{0,800}select existing\.is_required[\s\S]{0,600}\), false\)/i.test(catalogCompletenessSql), "Catalog completeness rollout does not preserve optionality for new or newly-required fields.");
check((catalogCompletenessSql.match(/greatest\s*\(/gi) ?? []).length >= 4, "Catalog completeness sort staging is not dynamically bounded.");
check((catalogCompletenessSql.match(/row_number\s*\(\)\s*over/gi) ?? []).length >= 4, "Catalog completeness sort staging is not deterministic.");
check((catalogCompletenessSql.match(/2147483647/g) ?? []).length >= 2, "Catalog completeness sort staging has no integer-overflow preflight.");
check(!/set\s+sort_order\s*=\s*1000000\b/i.test(catalogCompletenessSql), "Catalog completeness sort staging uses the legacy fixed offset.");
check(/option\.is_active and not attribute\.is_active[\s\S]{0,180}active option owned by an inactive attribute/i.test(catalogCompletenessSql), "Catalog completeness postflight permits active options on inactive attributes.");
check(/actual\.validation is distinct from target\.validation/i.test(catalogCompletenessSql), "Catalog completeness postflight does not verify persisted conditional metadata.");
check(/create or replace function private\.validate_listing_leaf_category\(\)[\s\S]{0,500}security invoker/i.test(catalogCompletenessSql), "Leaf-category guard must remain SECURITY INVOKER.");
check(/where category\.id = new\.category_id[\s\S]{0,400}category\.is_active[\s\S]{0,400}child\.parent_id = category\.id and child\.is_active/i.test(catalogCompletenessSql), "Leaf-category guard does not require an active category without active children.");
check(/revoke all on function private\.validate_listing_leaf_category\(\)[\s\S]{0,120}from public, anon, authenticated, service_role/i.test(catalogCompletenessSql), "Leaf-category guard function privileges are not explicitly revoked.");
check(/create trigger listings_validate_leaf_category\s+before insert or update of category_id on public\.listings/i.test(catalogCompletenessSql), "Leaf-category guard is not attached to direct listing writes.");

const securityBoundaryRepairSql = migrations.get("0025_security_boundary_repair.sql") ?? "";
check(
  /set local search_path = pg_catalog, pg_temp, public/i.test(securityBoundaryRepairSql),
  "Security repair does not stabilize catalog rendering with a fixed local search_path.",
);
check(
  /alter default privileges revoke execute on functions\s+from public, anon, authenticated, service_role/i.test(securityBoundaryRepairSql),
  "Security repair does not revoke global default function EXECUTE from every API role.",
);
check(
  /alter default privileges in schema public, private\s+revoke execute on functions\s+from public, anon, authenticated, service_role/i.test(securityBoundaryRepairSql),
  "Security repair does not remove explicit public/private schema default EXECUTE grants.",
);
check(
  /marketo_security_0025_functions[\s\S]{0,9000}to_regprocedure\(function_inventory\.signature\)[\s\S]{0,3000}refuses unreviewed public\/private function/i.test(securityBoundaryRepairSql),
  "Security repair has no fail-closed function inventory preflight.",
);
check(
  /marketo_security_0025_function_contracts[\s\S]{0,16000}canonical_fingerprint[\s\S]{0,16000}refuses drifted reviewed callable function contract/i.test(securityBoundaryRepairSql)
    && /postflight callable function contract mismatch/i.test(securityBoundaryRepairSql),
  "Security repair does not verify callable function bodies and metadata before and after repair.",
);
check(
  (securityBoundaryRepairSql.match(/'[0-9a-f]{32}'/g) ?? []).length === 21,
  "Security repair must pin exactly 21 callable function fingerprints.",
);
check(
  (securityBoundaryRepairSql.match(/pg_get_expr\(procedure\.proargdefaults, 0, false\)/g) ?? []).length === 2,
  "Security repair fingerprints must include function default expressions before and after repair.",
);
check(
  /marketo_security_0025_policies[\s\S]{0,9000}refuses unreviewed RLS policy/i.test(securityBoundaryRepairSql),
  "Security repair has no fail-closed RLS policy inventory preflight.",
);
check(
  /requires the migration role to own every managed function/i.test(securityBoundaryRepairSql),
  "Security repair does not verify the function owner boundary.",
);
check(
  /lock table[\s\S]{0,500}public\.profiles[\s\S]{0,100}in access exclusive mode/i.test(securityBoundaryRepairSql),
  "Security repair does not acquire its policy-table locks deterministically.",
);
for (const table of [
  "profiles",
  "listings",
  "listing_attribute_values",
  "listing_attribute_option_values",
  "listing_images",
]) {
  check(
    new RegExp(`alter table public\\.${table} enable row level security`, "i").test(securityBoundaryRepairSql),
    `Security repair does not restore RLS on public.${table}.`,
  );
}
check(
  /revoke execute on all functions in schema public[\s\S]{0,120}from public, anon, authenticated, service_role/i.test(securityBoundaryRepairSql)
    && /revoke execute on all functions in schema private[\s\S]{0,120}from public, anon, authenticated, service_role/i.test(securityBoundaryRepairSql),
  "Security repair does not reset all API-role function grants.",
);
check(
  /create or replace function private\.has_any_role[\s\S]{0,900}profile\.status = 'active'/i.test(securityBoundaryRepairSql),
  "Security repair does not restore the active-staff role guard.",
);
check(
  /create or replace function public\.moderate_listing[\s\S]{0,5000}invalid moderation reason_code[\s\S]{0,1000}moderation note is too long/i.test(securityBoundaryRepairSql),
  "Security repair does not restore bounded moderation input.",
);
for (const policy of [
  "profiles_anon_public_read",
  "profiles_authenticated_read",
  "profiles_owner_update",
  "listings_anon_active_read",
  "listings_authenticated_read",
  "listings_owner_insert_draft",
  "listings_owner_update_editable",
  "listing_attribute_values_anon_active_read",
  "listing_attribute_values_authenticated_read",
  "listing_attribute_values_owner_insert",
  "listing_attribute_values_owner_update",
  "listing_attribute_values_owner_delete",
  "listing_attribute_options_anon_active_read",
  "listing_attribute_options_authenticated_read",
  "listing_attribute_options_owner_insert",
  "listing_attribute_options_owner_delete",
  "listing_images_anon_active_read",
  "listing_images_authenticated_read",
  "profiles_moderation_staff_read",
]) {
  check(
    new RegExp(`drop policy if exists ${policy}[\\s\\S]{0,120}create policy ${policy}`, "i").test(securityBoundaryRepairSql),
    `Security repair does not deterministically replace ${policy}.`,
  );
}
check(
  /create or replace function public\.update_listing_draft\([\s\S]{0,9000}security invoker[\s\S]{0,300}set search_path = ''/i.test(securityBoundaryRepairSql),
  "Security repair does not restore the complete owner draft RPC contract.",
);
check(
  /create or replace function public\.get_my_listing_moderation_feedback\([\s\S]{0,1200}stable[\s\S]{0,200}security definer[\s\S]{0,200}set search_path = ''/i.test(securityBoundaryRepairSql),
  "Security repair does not restore the safe owner feedback RPC contract.",
);
check(
  /aclexplode\([\s\S]{0,200}coalesce\(procedure\.proacl, acldefault\('f', procedure\.proowner\)\)[\s\S]{0,500}privilege\.grantee = 0[\s\S]{0,300}direct PUBLIC (?:function )?EXECUTE/i.test(securityBoundaryRepairSql),
  "Security repair does not reject direct PUBLIC function EXECUTE.",
);
check(
  /grant usage on schema private[\s\S]{0,80}service_role/i.test(securityBoundaryRepairSql)
    && /has_schema_privilege\('service_role', 'private', 'USAGE'\)/i.test(securityBoundaryRepairSql),
  "Security repair does not make its reviewed private service helpers callable.",
);
for (const signature of [
  "public.update_listing_draft(uuid,uuid,uuid,text,text,bigint,character,text,text,boolean,jsonb)",
  "public.get_my_listing_moderation_feedback(uuid)",
]) {
  check(
    securityBoundaryRepairSql.includes(`('${signature}', false, true, false)`),
    `Security repair ACL inventory is missing authenticated-only RPC ${signature}.`,
  );
}
check(
  /marketo_security_0025_postflight[\s\S]{0,9000}function grant mismatch[\s\S]{0,9000}canonical RLS policy metadata mismatch/i.test(securityBoundaryRepairSql),
  "Security repair has no complete RPC/RLS postflight.",
);
check(
  !/\b(?:insert into|update|delete from)\s+public\.(?:categories|category_attributes|category_attribute_options)\b/i.test(securityBoundaryRepairSql),
  "Security repair must not mutate catalog reference data.",
);

const drizzleConfig = await readFile(resolve(root, "drizzle.config.ts"), "utf8");
const databaseTypes = await readFile(resolve(root, "lib/supabase/database.types.ts"), "utf8");
check(/dialect:\s*"postgresql"/.test(drizzleConfig), "Drizzle is not configured for PostgreSQL.");
check(!/dialect:\s*"sqlite"/.test(drizzleConfig), "Legacy SQLite/D1 Drizzle config remains active.");
check(/dbColumnNames:\s*true/.test(databaseTypes), "PostgREST types must use database column names.");

const wrangler = await readFile(resolve(root, "wrangler.jsonc"), "utf8");
const vite = await readFile(resolve(root, "vite.config.ts"), "utf8");
check((wrangler.match(/nodejs_compat/g) ?? []).length === 1, "wrangler.jsonc must contain one nodejs_compat flag.");
check(!/nodejs_compat|compatibility_flags/.test(vite), "vite.config.ts duplicates Cloudflare compatibility flags.");
check(!/d1_databases|D1Database/.test(vite), "Legacy D1 binding remains in the active Vite runtime.");

const browserFiles = [
  "lib/supabase/browser.ts",
  "lib/supabase/public-env.ts",
].map((file) => [file, null]);
for (const item of browserFiles) item[1] = await readFile(resolve(root, item[0]), "utf8");
for (const [file, source] of browserFiles) {
  check(!/SERVICE_ROLE|SECRET_KEY|DATABASE_URL|POSTGRES_PASSWORD/.test(source), `${file} references a server secret.`);
}
for (const directory of ["app", "components"]) {
  const names = await readdir(resolve(root, directory), { recursive: true });
  for (const name of names.filter((item) => /\.(?:ts|tsx)$/.test(item))) {
    const file = `${directory}/${name}`;
    const source = await readFile(resolve(root, file), "utf8");
    check(!/@\/lib\/(?:catalog-config|geography)/.test(source), `${file} still imports a seed-only reference module.`);
  }
}
for (const file of [
  "lib/reference-data/server.ts",
  "lib/data/supabase/geography.ts",
  "lib/data/supabase/categories.ts",
  "app/api/reference/categories/[id]/attributes/route.ts",
]) {
  const source = await readFile(resolve(root, file), "utf8");
  check(!/SERVICE_ROLE|SUPABASE_SECRET_KEY|createSupabaseAdminClient/.test(source), `${file} references an elevated Supabase client.`);
}
for (const directory of ["app", "components", "lib"]) {
  const names = await readdir(resolve(root, directory), { recursive: true });
  for (const name of names.filter((item) => /\.(?:ts|tsx)$/.test(item))) {
    const file = `${directory}/${name}`;
    const source = await readFile(resolve(root, file), "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    check(!/lib\/supabase\/(?:admin|server|server-env)/.test(source), `${file} imports a server Supabase module.`);
    check(!/SERVICE_ROLE|SUPABASE_SECRET_KEY|DATABASE_URL|POSTGRES_PASSWORD/.test(source), `${file} references a server credential name.`);
  }
}

const credentialPatterns = [
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const ignoredSourceSegments = new Set([".git", ".next", ".sites-runtime", ".vinext", ".wrangler", "dist", "node_modules"]);
const sourceNames = (await readdir(root, { recursive: true }))
  .filter((name) => !hasIgnoredSourceSegment(name, ignoredSourceSegments))
  .filter((name) => /(?:^|\/)(?:\.env\.example|[^/]+\.(?:ts|tsx|js|mjs|cjs|json|jsonc|sql|md|sh|yml|yaml))$/.test(name));
for (const name of sourceNames) {
  const source = await readFile(resolve(root, name), "utf8").catch(() => "");
  check(!credentialPatterns.some((pattern) => pattern.test(source)), `${name} contains a credential-like value.`);
}
const envExample = await readFile(resolve(root, ".env.example"), "utf8").catch(() => "");
check(Boolean(envExample), ".env.example is missing.");
check(!/^NEXT_PUBLIC_.*(?:SERVICE|SECRET|DATABASE|PASSWORD)/m.test(envExample), "A secret-like variable is marked NEXT_PUBLIC.");
check(!/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(envExample), ".env.example contains a value that resembles a real credential.");

const checksumFile = await readFile(resolve(root, "supabase/CHECKSUMS.sha256"), "utf8").catch(() => "");
const checksumEntries = checksumFile.trim().split("\n").filter(Boolean);
const reviewedSqlPaths = [
  ...files.map((name) => `migrations/${name}`),
  ...(await readdir(resolve(root, "supabase/seeds"))).filter((name) => name.endsWith(".sql")).sort().map((name) => `seeds/${name}`),
];
check(checksumEntries.length === reviewedSqlPaths.length, "Supabase SQL checksum manifest is missing or incomplete.");
for (const relativePath of reviewedSqlPaths) {
  const bytes = await readFile(resolve(root, "supabase", relativePath));
  const expected = createHash("sha256").update(bytes).digest("hex");
  check(checksumEntries.includes(`${expected}  ${relativePath}`), `Checksum mismatch for supabase/${relativePath}.`);
}

if (failures.length) {
  process.stderr.write(`Supabase foundation validation failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Supabase foundation validation passed: ${createdTables.length} RLS tables, ${files.length} migrations, deterministic reference seed.\n`);
}
