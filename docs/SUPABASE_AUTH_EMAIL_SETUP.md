# Supabase Auth email setup — Marketo v1.0

Status: **NOT VERIFIED in the external Supabase Dashboard**. This repository
contains no Dashboard access, SMTP credentials or production secrets. Apply and
verify the settings below in a disposable/staging project before production.

## 1. Redirect URL allowlist

The application creates callback URLs from the current same-origin address and
always routes through `/auth/callback`. Add only origins that Marketo actually
uses. Do not add an unrelated domain and do not place a user-controlled full URL
in `redirectTo`.

| Environment | Allowed callback URL |
|---|---|
| Local Next/Vinext | `http://localhost:3000/auth/callback` |
| Local Vite, when used | `http://localhost:5173/auth/callback` |
| Local loopback equivalent, when used | `http://127.0.0.1:3000/auth/callback` |
| Automated test/preview | `<exact-test-origin>/auth/callback` |
| Staging | `https://<exact-staging-host>/auth/callback` |
| Production canonical host | `https://<exact-production-host>/auth/callback` |

Keep the Supabase **Site URL** on the canonical production origin. Add preview
and staging origins as explicit additional redirect URLs. Remove obsolete URLs
after each environment is retired.

## 2. Confirmation email — RU

Subject:

```text
Подтвердите регистрацию в Marketo
```

Body:

```html
<h2>Подтвердите email</h2>
<p>Вы создали аккаунт в Marketo.</p>
<p><a href="{{ .ConfirmationURL }}">Подтвердить регистрацию</a></p>
<p>Если вы не создавали аккаунт, просто проигнорируйте это письмо.</p>
```

## 3. Confirmation email — KK

Subject:

```text
Marketo-да тіркелуді растаңыз
```

Body:

```html
<h2>Email мекенжайын растаңыз</h2>
<p>Сіз Marketo-да аккаунт жасадыңыз.</p>
<p><a href="{{ .ConfirmationURL }}">Тіркелуді растау</a></p>
<p>Егер аккаунтты сіз жасамаған болсаңыз, бұл хатты елемеңіз.</p>
```

If the selected Supabase plan/Dashboard exposes only one template per email
type, use one bilingual RU/KK template or select the language through a reviewed
server-side sending flow later. Do not create a second Marketo user database to
solve email localization.

## 4. Password recovery email — RU

Subject:

```text
Восстановление пароля Marketo
```

Body:

```html
<h2>Установите новый пароль</h2>
<p>Мы получили запрос на восстановление пароля Marketo.</p>
<p><a href="{{ .ConfirmationURL }}">Продолжить восстановление</a></p>
<p>Если вы не запрашивали восстановление, проигнорируйте письмо.</p>
```

## 5. Password recovery email — KK

Subject:

```text
Marketo құпиясөзін қалпына келтіру
```

Body:

```html
<h2>Жаңа құпиясөз орнатыңыз</h2>
<p>Marketo құпиясөзін қалпына келтіру сұрауын алдық.</p>
<p><a href="{{ .ConfirmationURL }}">Қалпына келтіруді жалғастыру</a></p>
<p>Егер бұл сұрауды сіз жібермеген болсаңыз, хатты елемеңіз.</p>
```

## 6. Sender branding checklist

- Sender name is `Marketo` (or the final reviewed marketplace brand).
- From-address uses a verified domain, for example `no-reply@<brand-domain>`.
- Reply-To points to a monitored support mailbox.
- SPF, DKIM and DMARC pass for the sending domain.
- RU and KK subjects do not look like password requests from another service.
- Email contains no password, OTP database value, service-role key or session.
- Link text clearly states confirmation or recovery; it is not a generic
  “click here”.
- Test delivery to major providers and check the Spam folder/rate limits.

## 7. Callback checklist

- Signup uses `/auth/callback?...&flow=signup`.
- Recovery uses `/auth/callback?...&flow=recovery`.
- The callback accepts a Supabase `code` or reviewed `token_hash` + `type`.
- `next` is reduced to a same-origin internal path; `//host`, external URLs and
  backslashes are rejected.
- Successful signup opens `/auth/result`, notifies the original same-origin tab
  through BroadcastChannel/storage event and shows return/close actions.
- Successful recovery opens `/auth/update-password`, requires the recovery
  session, updates the password, signs out locally and returns to normal login.
- Invalid and expired links show separate user-safe messages and no raw SQL or
  provider error.
- Confirmation on another device does not transfer a session to the original
  device; the original screen keeps the manual “confirmed — sign in” path.
- No infinite polling, automatic password loop or production secret is used.

## 8. Required external verification

In staging, verify all four flows in RU and KK: same-device signup, cross-device
signup, same-device recovery and cross-device recovery. Then inspect Supabase
Auth logs, rate-limit behavior, Redirect URL settings, SMTP status and Security
Advisor. Until that is done, external email delivery remains **NOT VERIFIED**.
