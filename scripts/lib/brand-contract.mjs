// Compatibility identifiers are not display names. Restrict exceptions to the
// exact file and token so new public legacy branding fails the normal build.
const old = 'mar'+'keto';
export const brandCompatibility = {
 'app/api/account/delete/route.ts':[`__Host-${old}-account-deletion`],
 'app/profile/delete/page.tsx':[`__Host-${old}-account-deletion`],
 'app/api/reference/attributes/[id]/options/route.ts':[`x-${old}-reference-version`],
 'app/api/reference/categories/[id]/attributes/route.ts':[`x-${old}-reference-version`],
 'app/api/reference/categories/route.ts':[`x-${old}-reference-version`,`${old}-categories-`],
 'app/api/reference/geography/route.ts':[`x-${old}-reference-version`,`${old}-geography-`],
 'app/error.tsx':[`data-${old}-error`],
 'app/page.tsx':[`data-${old}-error`],
 'components/category-directory.tsx':[`data-${old}-error`],
 'components/empty-state.tsx':[`data-${old}-error`],
 'components/category-link.tsx':[`https://${old}.invalid`],
 'components/location-picker.tsx':[`${old}-location`,`${old}:location-change`],
 'components/navigation-feedback.tsx':[`${old}:navigation-start`],
 'components/navigation-history.tsx':[`${old}:current-route`,`${old}:previous-route`],
 'lib/auth/events.ts':[`${old}-auth-events-v1`,`${old}:auth:event`,`${old}:auth:pending-email`,`${old}:auth:pending-flow`],
 'lib/auth/redirect.ts':[`https://${old}.local`],
 'lib/auth/registration-handoff.ts':[`${old}-registration-proof`],
 'lib/i18n/config.ts':[`${old}-locale`],
 'lib/media/bucket.ts':[`${old.toUpperCase()}_MEDIA`],
 'lib/media/photo-service.ts':[`${old.toUpperCase()}_IMAGES`],
 'lib/navigation/page-read.ts':[`${old}:page-read`,`https://${old}.invalid`,`data-${old}-error`],
 'lib/phone/protection.ts':[`__Host-${old}-phone`,`${old}-phone-cookie:`,`${old}-phone-quota:`],
 'lib/publish/recovery.ts':[`${old}-listing-draft:`],
 'lib/site-origin.ts':[`https://${old}-staging.arshavin-ivan-mail-ru.workers.dev`],
 'public/manifest.webmanifest':[`/${old}-pwa-v1`],
 'public/sw.js':[`${old}-static-`,`x-${old}-reference-version`],
};

export function unapprovedLegacyBrand(path, text){
 for(const token of brandCompatibility[path]??[])text=text.replaceAll(token,'');
 return new RegExp(old+'|маркето(?![а-яё])','i').test(text);
}
