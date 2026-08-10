import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";
import { ListingCard } from "@/components/listing-card";
import { listings } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };

export default function FavoritesPage() {
  return <DashboardShell title="Избранное" description="Сохранённые объявления доступны на этом устройстве." active="/favorites"><div className="listing-grid dashboard-listings">{listings.slice(0, 4).map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div></DashboardShell>;
}
