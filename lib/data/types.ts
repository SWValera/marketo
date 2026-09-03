export type PageResult<T> = {
  items: T[];
  total: number;
  nextCursor: string | null;
};

export type NumberedPageResult<T> = PageResult<T> & {
  page: number;
  totalPages: number;
  state: "ready" | "empty" | "out_of_range";
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
  /** Localized display labels for option-backed attributes. */
  attributeDisplayValues?: Record<string, string>;
  sellerId: string;
  sellerName: string;
  /** Public contact returned only when the listing access policy allows it. */
  contactPhone?: string | null;
};

export type ListingStatus = "draft" | "pending" | "active" | "rejected" | "archived" | "sold" | "expired" | "deleted";

export type MyListingSummary = {
  id: string;
  slug: string;
  title: string;
  priceLabel: string;
  priceAmount: number | null;
  currencyCode: string;
  cityLabel: string;
  categoryLabel: string;
  status: Exclude<ListingStatus, "deleted">;
  createdAt: string;
  updatedAt: string;
  updatedLabel: string;
  publishedAt: string | null;
  imageUrl: string | null;
  rejectionReasonCode: string | null;
  rejectedAt: string | null;
};

export type OwnerDraftImage = {
  id: string;
  url: string;
  sortOrder: number;
};

export type OwnerDraftBundle = {
  id: string;
  slug: string;
  status: "draft" | "rejected";
  categoryId: string;
  categorySlug: string;
  settlementId: string;
  title: string;
  description: string;
  price: number | null;
  currencyCode: "KZT";
  contactName: string;
  contactPhone: string;
  allowMessages: boolean;
  attributes: import("@/lib/publish/contract").PublishAttributeValues;
  images: OwnerDraftImage[];
  rejectionReasonCode: string | null;
  rejectedAt: string | null;
  updatedAt: string;
};

export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  cityId: string | null;
  bio: string | null;
  verified: boolean;
  language: "ru" | "kk";
  accountStatus: AccountStatus;
  contactPhone?: string | null;
};

export type AccountStatus = "active" | "suspended" | "banned" | "deleted";

export type ChatSummary = {
  id: string;
  peerName: string;
  peerAvatarUrl: string | null;
  listingId: string | null;
  listingTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  /** Null when the server has no bounded aggregate for this conversation. */
  unreadCount: number | null;
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

export type ModerationQueueItem = {
  id: string;
  title: string;
  priceLabel: string;
  currencyCode: string;
  cityLabel: string;
  categoryLabel: string;
  createdAt: string;
  createdLabel: string;
  sellerId: string | null;
  sellerName: string;
  imageUrl: string | null;
  status: "pending";
};

export type ModerationAttribute = {
  key: string;
  label: string;
  value: string;
};

export type ModerationListingDetail = {
  id: string;
  title: string;
  description: string;
  priceLabel: string;
  currencyCode: string;
  categoryPath: string[];
  cityLabel: string;
  createdAt: string;
  createdLabel: string;
  sellerId: string | null;
  sellerName: string;
  status: "pending";
  attributes: ModerationAttribute[];
  images: Array<{ id: string; url: string; sortOrder: number }>;
};

export type ModerationDecision = "approve" | "reject";
