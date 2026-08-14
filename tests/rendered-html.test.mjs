import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function render(pathname) {
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), env, ctx);
  return { response, html: await response.text() };
}

test("renders development preview metadata", async () => {
  const { response, html } = await render("/");

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(html, developmentPreviewMeta);
});

test("all product routes render through the production worker", async () => {
  const routes = [
    ["/search", "Каталог Marketo"], ["/category/jobs", "Работа"], ["/category/services", "Услуги"],
    ["/listing/mk-10345-toyota-camry-2020", "Toyota Camry 2020"], ["/profile", "Профиль продавца"], ["/profile/edit", "Редактировать профиль"],
    ["/favorites", "Избранное"], ["/messages", "Сообщения"], ["/messages/nurlan", "Чат с Нурлан"],
    ["/notifications", "Уведомления"], ["/publish", "Подать объявление"], ["/login", "Добро пожаловать"],
    ["/settings", "Настройки"], ["/help", "Помощь"], ["/seller/nurlan", "Профиль Нурлана"],
    ["/admin", "Панель модерации"], ["/admin/mk-10345", "Проверка публикации"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(html, new RegExp(expected), pathname);
  }
});

test("unknown routes use the designed 404 state", async () => {
  const { response, html } = await render("/route-that-does-not-exist");
  assert.equal(response.status, 404);
  assert.match(html, /Страница не найдена/);
  assert.match(html, /Вернуться на главную/);
});
