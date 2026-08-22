import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !publishableKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before running this read-only check.");
}
if (/^(?:sb_secret_|service_role)/i.test(publishableKey)) {
  throw new Error("Refusing to run: the public key variable contains an elevated Supabase key.");
}

const client = createClient(url.replace(/\/$/, ""), publishableKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const expectedMinimums = {
  countries: 1,
  regions: 20,
  settlements: 90,
  categories: 1,
  category_attributes: 1,
  category_attribute_options: 1,
};

for (const [table, minimum] of Object.entries(expectedMinimums)) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw new Error(`${table}: ${error.code || "query_failed"}`);
  if ((count ?? 0) < minimum) throw new Error(`${table}: expected at least ${minimum} public rows, received ${count ?? 0}`);
  process.stdout.write(`${table}: ${count}\n`);
}

const { data: sampleCategories, error: categoryError } = await client
  .from("categories")
  .select("id, slug, name_ru, name_kk")
  .in("slug", ["cars-suv", "smartphones", "jobs", "services"]);
if (categoryError) throw new Error(`category sample: ${categoryError.code || "query_failed"}`);
if (!sampleCategories?.length || sampleCategories.some((item) => !item.name_ru?.trim() || !item.name_kk?.trim())) {
  throw new Error("Category RU/KK sample is incomplete.");
}

process.stdout.write("Supabase reference data: read-only verification passed.\n");
