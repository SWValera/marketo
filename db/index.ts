// Runtime database access goes through the Supabase HTTP clients in
// lib/supabase. Drizzle is retained as the typed PostgreSQL schema model and
// migration-drift tool; it is never initialized against Cloudflare D1.
export * from "./schema";
