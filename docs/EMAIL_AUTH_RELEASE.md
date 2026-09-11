# JEVU email authentication

New signup, resend and recovery requests use `/api/auth/callback`. Both this route and the legacy `/auth/callback` export the same server handler, `handleEmailAuthCallback`. Legacy links remain supported with their original PKCE requirements.

The Service Worker does not call `respondWith` for document navigation. All redirects, including routes outside `/auth`, run natively. Asset caching, versioned reference caching and update lifecycle remain active. Offline document fallback is deliberately removed; optional cached assets do not imply an offline page is available.

## Supabase production configuration

- Site URL: `https://jevu.kz` (verified in dashboard and with invalid-token redirect probes).
- Existing explicit redirect: `https://jevu.kz/auth/callback**`, retained for old links.
- The new API callback, including query parameters, is accepted because it shares the Site URL origin. Tested for signup and recovery. No additional origins or wildcard settings are required.
- Confirm signup template remains unchanged and uses `{{ .ConfirmationURL }}`. The registration bridge returns the PKCE code to the originating browser.
- Reset password body: `supabase/templates/recovery.html`. Only the three URL placeholders are replaced. Subject, Russian text, design, sender and SMTP remain unchanged.

Recovery uses `token_hash` with `type=recovery`. The server verifies this one-use credential through Supabase `verifyOtp`, writes the session in the browser opening the email and redirects to `/auth/update-password`. It does not transfer sessions from Safari into the PWA. This avoids requiring the originating browser's PKCE verifier. The original code-exchange path is preserved for previously sent links.

After a successful password update, local sign-out completes before a native navigation to `/login?password_reset=success`. Signup and duplicate-email responses stay neutral; there is no public account lookup or profile write.

## Release order

1. Validate source, browser fixtures, production build, workerd and dry-run with `MARKETO_IMAGE_PROCESSING=cloudflare`.
2. Commit and push only `stage3-staging`; verify the Cloudflare Builds check and active Worker version correspond to the new commit.
3. Set only the Reset password body to the versioned recovery template. Verify all three links and the unchanged subject/design. The callback route must be live before publishing this template.
4. Read-only live smoke checks must confirm native callback redirects, Russian errors, current SW and exact production/source provenance. Do not send real emails or change users as part of fixtures.

Do not claim a physical iOS/Safari check from Chromium or workerd results.

## Evidence and limitations

WebKit emits the reported error when a Service Worker navigation response has `isRedirected()`. It permits an ordinary opaque manual redirect; thus that response type alone is not proof of the exact iPhone failure path. No `respondWith` for any document removes the entire application SW response path.

- https://github.com/WebKit/WebKit/blob/main/Source/WebCore/workers/service/context/ServiceWorkerFetch.cpp (validateResponse)
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/redirect-urls
