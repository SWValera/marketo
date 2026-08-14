import type {
  ChatSummary,
  Conversation,
  ListingDetail,
  ListingSummary,
  ModerationCase,
  Notification,
  PageResult,
  Profile,
} from "@/lib/data/types";

const emptyPage = <T>(): PageResult<T> => ({ items: [], total: 0, nextCursor: null });

export const listingRepository = {
  async list(): Promise<PageResult<ListingSummary>> { return emptyPage(); },
  async favorites(): Promise<PageResult<ListingSummary>> { return emptyPage(); },
  async mine(): Promise<PageResult<ListingSummary>> { return emptyPage(); },
  async findBySlug(slug: string): Promise<ListingDetail | null> { void slug; return null; },
};

export const profileRepository = {
  async current(): Promise<Profile | null> { return null; },
  async findById(id: string): Promise<Profile | null> { void id; return null; },
};

export const chatRepository = {
  async list(): Promise<PageResult<ChatSummary>> { return emptyPage(); },
  async findById(id: string): Promise<Conversation | null> { void id; return null; },
};

export const notificationRepository = {
  async list(): Promise<PageResult<Notification>> { return emptyPage(); },
};

export const moderationRepository = {
  async list(): Promise<PageResult<ModerationCase>> { return emptyPage(); },
  async findById(id: string): Promise<ModerationCase | null> { void id; return null; },
};

// Replace these adapters with Supabase implementations without changing page components.
