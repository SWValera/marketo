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
    // Deletion is irreversible; late history/send responses must not resurrect old text.
    const older = previous && (previous.deletedAt || (previous.editedAt &&
      (!message.editedAt || compareTime(previous.editedAt, message.editedAt) > 0))) && !message.deletedAt;
    const latest = older ? previous : message;
    byId.set(message.id, { ...latest, body:latest.deletedAt ? "" : latest.body, read: message.read || previous?.read || false });
  }
  return [...byId.values()].sort(compareMessages);
}

function compareTime(left: string, right: string) {
  return Date.parse(left) - Date.parse(right) || microseconds(left) - microseconds(right);
}
export function swipeIntent(dx: number, dy: number): "left" | "right" | "scroll" | "pending" {
  if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) return "scroll";
  if (Math.abs(dx) < 32 || Math.abs(dx) < Math.abs(dy) * 1.5) return "pending";
  return dx < 0 ? "left" : "right";
}
