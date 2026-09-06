import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const sheet = postcss.parse(css);

function declarations(selector, property, media = null) {
  const values = [];
  sheet.walkRules(selector, (rule) => {
    const parentMedia = rule.parent.type === "atrule" ? rule.parent.params : null;
    if (parentMedia !== media) return;
    rule.walkDecls(property, (decl) => values.push(decl.value));
  });
  return values;
}

function declarationAtWidth(selector, property, width) {
  let value;
  sheet.walkRules(selector, (rule) => {
    if (rule.parent.type === "atrule") {
      const bound = rule.parent.params.match(/^\(max-width: (\d+)px\)$/);
      if (!bound || width > Number(bound[1])) return;
    }
    rule.walkDecls(property, (decl) => { value = decl.value; });
  });
  return value;
}

test("header search reserves its own row on phones, tablets and compact desktop widths", () => {
  for (const width of [320, 360, 390, 640, 641, 726, 900, 901, 1180, 1181, 1440]) {
    assert.equal(declarationAtWidth(".header-inner", "flex-wrap", width), "wrap", String(width));
    assert.equal(declarationAtWidth(".header-search", "flex", width), "1 0 100%", String(width));
    assert.equal(declarationAtWidth(".header-search", "width", width), "100%", String(width));
    assert.equal(declarationAtWidth(".header-search", "max-width", width), "none", String(width));
    assert.equal(declarationAtWidth(".header-search", "order", width), "3", String(width));
    assert.equal(declarationAtWidth(".header-search", "min-height", width), "48px", String(width));
    assert.equal(declarationAtWidth(".header-search", "height", width), undefined, String(width));
  }
  for (const width of [1441, 1920]) {
    assert.equal(declarationAtWidth(".header-inner", "flex-wrap", width), "wrap");
    assert.equal(declarationAtWidth(".header-search", "min-width", width), "min(100%, 20rem)");
  }
});

test("header search keeps text, icon and submit button visible without styling hidden filters", async () => {
  const input = '.header-search input[type="search"]';
  assert.equal(declarations(input, "flex").at(-1), "1 1 0%");
  assert.equal(declarations(input, "color").at(-1), "var(--ink)");
  assert.equal(declarations(input, "caret-color").at(-1), "var(--ink)");
  assert.equal(declarations(input, "font-size").at(-1), "var(--font-ui)");
  assert.equal(declarations(".header-search > svg", "flex").at(-1), "0 0 18px");
  assert.equal(declarations(".header-search button", "flex").at(-1), "0 0 auto");
  assert.equal(declarations(".header-search input", "flex").length, 0);
  assert.equal(declarations(".header-search:focus-within", "outline").at(-1), "2px solid var(--green)");
  const source = await readFile(new URL("components/header.tsx", root), "utf8");
  assert.match(source, /<form className="header-search" action="\/search" role="search">/);
  assert.match(source, /<input type="search" name="q" aria-label=/);
  assert.match(source, /type="hidden" name="category" value=\{categorySlug\}/);
  assert.match(source, /type="hidden" name="city" value=\{storedLocation\}/);
  assert.match(source, /<button type="submit">/);
});

test("shared text uses scalable readable sizes, with no legacy tiny pixel labels", () => {
  assert.equal(declarations(":root", "--font-ui").at(-1), "1rem");
  assert.equal(declarations("body", "font-size").at(-1), "var(--font-body)");
  assert.doesNotMatch(css, /font-size:\s*(?:[1-9]|1[0-5])px\b/);
  assert.equal(declarations("small", "font-size").at(-1), "var(--font-ui)");
});

test("compact profile pages do not leave an empty navigation frame for signed-out visitors", async () => {
  assert.equal(declarations(".dashboard-sidebar-no-links", "display", "(max-width: 900px)").at(-1), "none");
  assert.equal(declarations(".dashboard-sidebar-no-links", "display").length, 0);
  const source = await readFile(new URL("components/dashboard-shell.tsx", root), "utf8");
  assert.match(source, /dashboardLinks\.length \? "" : " dashboard-sidebar-no-links"/);
});

test("secondary controls center text and allow wrapped labels to grow", () => {
  const selector = ".secondary-button, .text-button";
  assert.equal(declarations(selector, "display").at(-1), "inline-flex");
  assert.equal(declarations(selector, "align-items").at(-1), "center");
  assert.equal(declarations(selector, "justify-content").at(-1), "center");
  assert.equal(declarations(selector, "height").length, 0);
  assert.equal(declarations(".secondary-button", "padding").at(-1), "10px 17px");
  assert.equal(declarations(".profile-listing-tabs .secondary-button", "min-width").at(-1), "0");
});

test("larger search text clears its icon and long select hints wrap", () => {
  assert.equal(declarations(".filter-search input", "padding-left").at(-1), "44px");
  assert.equal(declarations(".filter-search > svg", "margin-left").at(-1), "0");
  assert.equal(declarations(".reference-select-trigger > span, .category-picker-trigger small", "white-space").at(-1), "normal");
  assert.match(css, /\.filters-panel input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
});

test("characteristics use three readable columns and adapt to narrow viewports", async () => {
  assert.equal(declarations(".characteristics-grid", "grid-template-columns").at(-1), "repeat(3, minmax(0, 1fr))");
  assert.equal(declarations(".characteristics-grid", "grid-template-columns", "(max-width: 640px)").at(-1), "repeat(2, minmax(0, 1fr))");
  assert.equal(declarations(".characteristics-grid", "grid-template-columns", "(max-width: 360px)").at(-1), "minmax(0, 1fr)");
  const detail = await readFile(new URL("app/listing/[slug]/page.tsx", root), "utf8");
  assert.ok(detail.indexOf('t("listing.characteristics")') < detail.indexOf('t("listing.description")'));
});

test("the full showcase is city-scoped, uses all paid entries and never hides its third card", async () => {
  const source = await readFile(new URL("components/city-premium-showcase.tsx", root), "utf8");
  assert.match(source, /aria-expanded=\{viewAll\} aria-controls="city-premium-items"/);
  assert.match(source, /const displayed = viewAll \? paid\.map\(/);
  assert.match(source, /displayed\.map\(/);
  assert.match(source, /<LocationPicker allowAll=\{false\} \/>/);
  assert.match(source, /viewAll && paidLoading/);
  assert.match(source, /paid\.length \? "showcase\.total" : "showcase\.empty"/);
  assert.match(css, /\.showcase-grid:not\(\.showcase-grid-all\) > \.showcase-card:nth-child\(3\)/);
  assert.doesNotMatch(css, /(?:^|\n)\s*\.showcase-card:nth-child\(3\)/);
});

test("compact showcase keeps city and full-list button side by side with readable wrapping", () => {
  assert.equal(declarations(".showcase-heading", "display").at(-1), "grid");
  assert.equal(declarations(".showcase-city-row", "display").at(-1), "grid");
  assert.equal(declarations(".showcase-city-row", "grid-template-columns").at(-1), "minmax(0, 1fr) auto");
  assert.equal(declarations(".showcase-city-row", "grid-template-columns", "(max-width: 640px)").at(-1), "minmax(0, 1fr) minmax(0, 1.35fr)");
  assert.equal(declarations(".showcase-city-row .showcase-view-all", "font-size").at(-1), "var(--font-ui)");
  assert.equal(declarations(".showcase-city-row .showcase-view-all", "white-space").at(-1), "normal");
  assert.equal(declarations(".showcase-city-row .showcase-view-all", "min-height").at(-1), "44px");
  assert.equal(declarations(".showcase-heading p", "overflow-wrap").at(-1), "anywhere");
  assert.doesNotMatch(css, /showcase-controls|showcase-heading-actions/);
});

test("compact showcase reduces the gap before categories without fixing text heights", () => {
  assert.equal(declarations(".home-showcase-shell.page-shell", "padding-bottom").at(-1), "0");
  assert.equal(declarations(".home-marketplace", "margin-top", "(max-width: 640px)").at(-1), "14px");
  assert.equal(declarations(".showcase-heading", "gap", "(max-width: 640px)").at(-1), "8px");
  assert.equal(declarations(".city-premium-showcase", "padding", "(max-width: 640px)").at(-1), "12px");
  assert.equal(declarations(".showcase-city-row", "height").length, 0);
  assert.equal(declarations(".showcase-heading", "height").length, 0);
});

test("requested showcase name and publication notice are localized without the old slogan", async () => {
  const messages = await readFile(new URL("lib/i18n/messages.ts", root), "utf8");
  const profile = await readFile(new URL("app/profile/page.tsx", root), "utf8");
  assert.match(messages, /"showcase\.title": "Городская премиум витрина"/);
  assert.doesNotMatch(messages, /City Premium Showcase|Лучшее рядом с вами/);
  assert.equal((messages.match(/"showcase\.viewAll":/g) ?? []).length, 2);
  assert.equal((messages.match(/"profile\.publicationTermTitle":/g) ?? []).length, 2);
  assert.match(profile, /<aside className="publication-term-notice" aria-labelledby="publication-term-title">/);
  assert.match(profile, /<h3 id="publication-term-title">/);
});
