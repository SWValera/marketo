import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";
import { ListingCard } from "@/components/listing-card";
import { listings } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };

export default function FavoritesPage() {
  const favorites = [listings[0], listings[5], listings[8], listings[10]];
  return <DashboardShell title="Избранное" description={`${favorites.length} сохранённых объявления · доступны на этом устройстве.`} active="/favorites"><div className="listing-grid dashboard-listings">{favorites.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div></DashboardShell>;
}
