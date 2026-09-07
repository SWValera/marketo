// Server workflow shared with controlled fault/retry tests. No credentials here.
export type DeletionRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}>;
type Batch = {status: "pending" | "completed"; userId: string | null; keys: string[]};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function batch(value: unknown): Batch {
  if (!value || typeof value !== "object") throw new Error("invalid_deletion_batch");
  const row = value as Batch;
  if (!["pending", "completed"].includes(row.status) || !Array.isArray(row.keys) || row.keys.length > 100
    || (row.status === "pending" && (typeof row.userId !== "string" || !uuid.test(row.userId)))) throw new Error("invalid_deletion_batch");
  for (const key of row.keys) {
    if (typeof key !== "string") throw new Error("invalid_deletion_key");
    const parts = key.split("/");
    const owned = parts[1] === row.userId && (
      (parts[0] === "avatars" && parts.length === 3 && /^[a-z0-9_-]+\.(jpe?g|png|webp|avif)$/i.test(parts[2]))
      || (parts[0] === "listings" && parts.length === 4 && uuid.test(parts[2]) && /^[a-z0-9-]+\.(jpg|png|webp|avif)$/i.test(parts[3]))
    );
    if (!owned) throw new Error("invalid_deletion_key");
  }
  if (row.status === "completed" && (row.keys.length || row.userId !== null)) throw new Error("invalid_deletion_batch");
  return row;
}
export async function runAccountDeletionBatch(deps: {
  rpc: DeletionRpc; deleteMedia: (keys: string[]) => Promise<void>; deleteAuth: (id: string) => Promise<void>;
}, tokenHash: string): Promise<"pending" | "completed"> {
  async function call(name: string, args: Record<string, unknown>) {
    const result = await deps.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }
  let current = batch(await call("advance_account_deletion", {p_token_hash: tokenHash, p_deleted_keys: []}));
  if (current.status === "completed") return "completed";
  if (current.keys.length) {
    // R2 deletion is idempotent; acknowledge ONLY after successful storage deletion.
    await deps.deleteMedia(current.keys);
    current = batch(await call("advance_account_deletion", {p_token_hash: tokenHash, p_deleted_keys: current.keys}));
    if (current.status === "completed") return "completed";
    if (current.keys.length) return "pending";
  }
  await deps.deleteAuth(current.userId!);
  await call("finish_account_deletion", {p_token_hash: tokenHash});
  return "completed";
}
