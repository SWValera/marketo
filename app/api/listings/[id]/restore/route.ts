import { ownerListingAction } from "@/lib/listings/owner-action-route";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return ownerListingAction(request, (await context.params).id, "restore");
}
