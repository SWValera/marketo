import { NextResponse } from "next/server";
import { listingRepository } from "@/lib/data/repositories";

export async function GET() {
  return NextResponse.json(await listingRepository.list());
}
