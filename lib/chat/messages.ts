import type { Conversation } from "@/lib/data/types";
export type ChatMessage = Conversation["messages"][number];
// Postgres timestamps can have microseconds; preserve their order beyond Date's milliseconds.
function microseconds(time: string) { return Number((time.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(0, 6)); }
export function compareMessages(left: ChatMessage, right: ChatMessage) {
  return Date.parse(left.sentAt) - Date.parse(right.sentAt) || microseconds(left.sentAt) - microseconds(right.sentAt) || left.id.localeCompare(right.id);
}
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    byId.set(message.id, { ...message, read: message.read || previous?.read || false });
  }
  return [...byId.values()].sort(compareMessages);
}
