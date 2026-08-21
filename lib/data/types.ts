export type PageResult<T> = {
  items: T[];
  total: number;
  nextCursor: string | null;
};

export type ListingSummary = {
  id: string;
  slug: string;
  title: string;
  priceLabel: string;
  priceAmount: number | null;
  locationLabel: string;
  publishedLabel: string;
  imageUrl: string | null;
  categorySlug: string;
  cityId: string;
  promoted: boolean;
  /** Category-defined values returned by the listing repository when available. */
  attributes?: Record<string, string | number | boolean>;
};

export type ListingDetail = ListingSummary & {
  description: string;
  attributes: Record<string, string | number | boolean>;
  sellerId: string;
  /** Public contact returned only when the listing access policy allows it. */
  contactPhone?: string | null;
};

export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  cityId: string | null;
  bio: string | null;
  verified: boolean;
  language: "ru" | "kk";
};

export type ChatSummary = {
  id: string;
  peerName: string;
  peerAvatarUrl: string | null;
  listingId: string | null;
  listingTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type Conversation = ChatSummary & {
  messages: Array<{ id: string; body: string; sentAt: string; own: boolean; read: boolean }>;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
};

export type ModerationCase = {
  id: string;
  listingId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};
