import { ownerListingAction } from "@/lib/listings/owner-action-route";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerListingAction(request, (await params).id, "archive");
}

