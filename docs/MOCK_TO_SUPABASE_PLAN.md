# Marketo: current runtime cutover map

Status after recovery on 2026-08-28. This document records actual code
boundaries; it is not evidence that production credentials or remote services
were exercised.

| Domain | Runtime source | Status |
|---|---|---|
| Geography/catalog | Supabase public adapters; typed source retained for deterministic seed generation | DONE |
| Public listing cards/detail/search | PostgreSQL RPC/PostgREST with typed attribute hydration | DONE |
| Registration/session/profile | Supabase email/password Auth, callback cookies and account-profile RPCs | DONE in code; live external Auth NOT VERIFIED |
| Publish | Authenticated atomic draft RPC → verified R2 images → submit_listing (pending) | DONE in code; live external R2/Auth NOT VERIFIED |
| Photo preview/recovery | object URLs for preview only; localStorage contains recovery metadata, never authoritative listing data | DONE |
| City Premium Showcase | city-scoped active placement RPC plus limited branded fallback cards | DONE |
| Favorites | existing device-local behavior | Separate future domain cutover |
| Chat/notifications/moderation UI | safe repository boundaries and database/RLS foundation | Separate future domain cutovers |

## Completed flow contracts

### Auth/profile

Register → callback/session → protected profile/publish → logout → login again;
password recovery/update and RU/KK loading/error states are implemented. Profile
updates are bound to auth.uid() and combine public/private fields atomically.

### Listing and photos

The browser creates a draft through create_listing_draft, uploads files to an
authenticated server route, and submits only after successful verified-image
metadata persistence. The route checks real file signatures, dimensions, MIME,
size and SHA-256 before writing to R2; database metadata is inserted only after
R2 confirms the object. Compensation removes objects/metadata when a batch
fails. Public media reads require an active parent listing under RLS.

### Buyer discovery

Text, category, city, price and dynamic category filters execute in PostgreSQL
across the public listing set. The isolated security suite verifies a User A
draft/photo/submission, moderator approval and User B discovery with seller,
city, price, image and attributes, plus non-owner denial.

## Remaining external verification

Use a disposable Supabase project/branch and non-production Cloudflare R2
binding to exercise actual email delivery, callback cookies, logout/login,
password recovery, multipart upload and public media delivery. This recovery
workspace intentionally did not connect to production.
