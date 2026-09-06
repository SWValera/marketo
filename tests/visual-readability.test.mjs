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

test("shared text uses scalable readable sizes, with no legacy tiny pixel labels", () => {
  assert.equal(declarations(":root", "--font-ui").at(-1), "1rem");
  assert.equal(declarations("body", "font-size").at(-1), "var(--font-body)");
  assert.doesNotMatch(css, /font-size:\s*(?:[1-9]|1[0-5])px\b/);
  assert.equal(declarations("small", "font-size").at(-1), "var(--font-ui)");
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

test("requested showcase name and publication notice are localized without the old slogan", async () => {
  const messages = await readFile(new URL("lib/i18n/messages.ts", root), "utf8");
  const profile = await readFile(new URL("app/profile/page.tsx", root), "utf8");
  assert.match(messages, /"showcase\.title": "Городская Premium витрина"/);
  assert.doesNotMatch(messages, /City Premium Showcase|Лучшее рядом с вами/);
  assert.equal((messages.match(/"showcase\.viewAll":/g) ?? []).length, 2);
  assert.equal((messages.match(/"profile\.publicationTermTitle":/g) ?? []).length, 2);
  assert.match(profile, /<aside className="publication-term-notice" aria-labelledby="publication-term-title">/);
  assert.match(profile, /<h3 id="publication-term-title">/);
});
