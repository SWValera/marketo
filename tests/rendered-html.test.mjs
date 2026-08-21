import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function render(pathname, locale = "ru") {
  const response = await worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", cookie: `marketo-locale=${locale}` } }), env, ctx);
  return { response, html: await response.text() };
}

test("core routes render through the production worker", async () => {
  const routes = [
    ["/", "Покупайте и продавайте"], ["/categories", "Все категории"], ["/search", "Каталог Marketo"],
    ["/category/jobs", "Работа"], ["/category/services", "Услуги"], ["/category/cars", "Легковые автомобили"],
    ["/profile", "Войдите, чтобы открыть профиль"], ["/profile/edit", "Редактировать профиль"],
    ["/favorites", "В избранном пока пусто"], ["/messages", "Сообщений пока нет"],
    ["/messages/new?listing=listing-id", "Войдите, чтобы написать продавцу"],
    ["/notifications", "Уведомлений пока нет"], ["/publish", "Подать объявление"], ["/login", "Добро пожаловать"],
    ["/settings", "Настройки"], ["/help", "Помощь"], ["/admin", "Очередь модерации пуста"], ["/offline", "Нет подключения"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /class="back-button|marketo-kz|Marketo/, pathname);
  }
});

test("Kazakh locale renders server-side without changing routes", async () => {
  const routes = [
    ["/", "Бүкіл Қазақстан бойынша сатып алыңыз және сатыңыз"],
    ["/categories", "Барлық санаттар"],
    ["/category/jobs", "Жұмыс"],
    ["/category/services", "Қызметтер"],
    ["/profile", "Профильді ашу үшін кіріңіз"],
    ["/publish", "Хабарландыру беру"],
    ["/notifications", "Әзірге хабарлама жоқ"],
  ];
  for (const [pathname, expected] of routes) {
    const { response, html } = await render(pathname, "kk");
    assert.equal(response.status, 200, pathname);
    assert.match(html, /<html lang="kk">/, pathname);
    assert.match(html, new RegExp(expected), pathname);
    assert.match(html, /ҚАЗ/, pathname);
  }
});

test("unknown user-data and unknown application routes use the designed 404 state", async () => {
  for (const pathname of ["/listing/not-real", "/seller/not-real", "/messages/not-real", "/admin/not-real", "/route-that-does-not-exist"]) {
    const { response, html } = await render(pathname);
    assert.equal(response.status, 404, pathname);
    assert.match(html, /Страница не найдена/, pathname);
    assert.match(html, /Вернуться на главную/, pathname);
  }
});
