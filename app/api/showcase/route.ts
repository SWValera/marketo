import { getShowcaseResponse } from "@/lib/showcase/server";

export async function GET(request: Request) {
  return getShowcaseResponse(new URL(request.url).searchParams.get("city"));
}
