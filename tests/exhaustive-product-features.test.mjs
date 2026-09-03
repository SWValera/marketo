import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("favorites use the authenticated RLS adapter instead of device-local placeholder state", async () => {
  const [adapter, store, card, actions, page] = await Promise.all([
    source("lib/data/supabase/favorites.ts"),
    source("components/favorite-store.ts"),
    source("components/listing-card.tsx"),
    source("components/listing-actions.tsx"),
    source("app/favorites/page.tsx"),
  ]);
  assert.match(adapter, /listFavoriteListings/);
  assert.match(adapter, /from\("favorites"\)/);
  assert.match(adapter, /count: "exact", head: true/);
  assert.match(adapter, /upsert\(/);
  assert.match(store, /auth\.getUser\(\)/);
  assert.match(store, /toggleFavoriteListing/);
  assert.match(card, /useSyncExternalStore\(subscribeFavoriteStore/);
  assert.match(actions, /useSyncExternalStore\(subscribeFavoriteStore/);
  assert.doesNotMatch(card, /setFavorite\(\(value\) => !value\)/);
  assert.doesNotMatch(actions, /localStorage|sessionStorage|marketo-favorite:/);
  assert.match(page, /authContext\.status === "anonymous"/);
  assert.match(page, /favorites\.items\.map/);
  assert.match(page, /favorites\.loadErrorTitle/);
});

test("chat pages list real conversations and the composer inserts text through the RLS adapter", async () => {
  const [adapter, indexPage, detailPage, composer, newPage] = await Promise.all([
    source("lib/data/supabase/chat.ts"),
    source("app/messages/page.tsx"),
    source("app/messages/[id]/page.tsx"),
    source("components/chat-composer.tsx"),
    source("app/messages/new/page.tsx"),
  ]);
  assert.match(adapter, /listUserConversations/);
  assert.match(adapter, /getConversation/);
  assert.match(adapter, /from\("messages"\)\.insert/);
  assert.match(indexPage, /chats\.items\.map/);
  assert.match(indexPage, /messages\.loadErrorTitle/);
  assert.match(detailPage, /ChatComposer conversationId=\{conversation\.id\} currentUserId=\{authContext\.user\.id\}/);
  assert.match(composer, /sendTextMessage\(/);
  assert.match(composer, /markConversationRead\(/);
  assert.doesNotMatch(composer, /type="file"|messages\.accountRequired/);
  assert.match(newPage, /authContext\.status === "anonymous"/);
  assert.match(newPage, /messages\.startUnavailableTitle/);
  assert.doesNotMatch(newPage, /getOrCreateListingConversation/);
});

test("notifications distinguish auth, failure, empty and real data and support unread updates", async () => {
  const [adapter, page, list] = await Promise.all([
    source("lib/data/supabase/notifications.ts"),
    source("app/notifications/page.tsx"),
    source("app/notifications/notification-list.tsx"),
  ]);
  assert.match(adapter, /listNotificationPage/);
  assert.match(adapter, /options\.unreadOnly/);
  assert.match(adapter, /safeInternalPath/);
  assert.match(page, /authContext\.status === "anonymous"/);
  assert.match(page, /notifications\.loadErrorTitle/);
  assert.match(page, /notifications\.total === 0/);
  assert.match(page, /NotificationList notifications=\{notifications\.items\}/);
  assert.match(list, /markNotificationRead/);
  assert.match(list, /router\.refresh\(\)/);
});

test("listing actions expose only supported phone data and submit authenticated reports", async () => {
  const actions = await source("components/listing-actions.tsx");
  assert.match(actions, /\{contactPhone \? phoneVisible/);
  assert.doesNotMatch(actions, /phoneUnavailable/);
  assert.match(actions, /createReport\(client/);
  assert.match(actions, /reporterId: userResult\.data\.user\.id/);
  assert.match(actions, /listingId,/);
  assert.match(actions, /maxLength=\{4000\}/);
});

test("authenticated settings render real account and security actions instead of a login loop", async () => {
  const page = await source("app/settings/page.tsx");
  assert.match(page, /getCurrentAuthContext/);
  assert.match(page, /authContext\.status === "authenticated"|authContext\.status === "error"/);
  assert.match(page, /authContext\.profile\.displayName/);
  assert.match(page, /href="\/profile\/edit"/);
  assert.match(page, /mode=recover&next=\/settings/);
  assert.match(page, /<LogoutButton/);
});
