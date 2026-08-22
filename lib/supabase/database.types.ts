// Generated-style database contract for the reviewed Marketo schema.
// Do not hand-edit after a Supabase project is linked: replace this file with
// `supabase gen types typescript --linked` and run `npm run validate:db`.
import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";
import type {
  adminAuditLog,
  categories,
  categoryAttributeOptions,
  categoryAttributes,
  conversationParticipants,
  conversations,
  countries,
  favorites,
  listingAttributeOptionValues,
  listingAttributeValues,
  listingContacts,
  listingImages,
  listings,
  locales,
  messages,
  moderationActions,
  notifications,
  profilePrivate,
  profiles,
  regions,
  reports,
  settlements,
  userRoles,
} from "@/db/schema";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// The explicit alias avoids repeating Drizzle's internal table constraint in
// every entry while keeping all Row/Insert/Update fields inferred from schema.ts.
type Contract<T extends Table> = {
  Row: InferSelectModel<T, { dbColumnNames: true }>;
  Insert: InferInsertModel<T, { dbColumnNames: true }>;
  Update: Partial<InferInsertModel<T, { dbColumnNames: true }>>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      locales: Contract<typeof locales>;
      countries: Contract<typeof countries>;
      regions: Contract<typeof regions>;
      settlements: Contract<typeof settlements>;
      profiles: Contract<typeof profiles>;
      profile_private: Contract<typeof profilePrivate>;
      user_roles: Contract<typeof userRoles>;
      categories: Contract<typeof categories>;
      category_attributes: Contract<typeof categoryAttributes>;
      category_attribute_options: Contract<typeof categoryAttributeOptions>;
      listings: Contract<typeof listings>;
      listing_contacts: Contract<typeof listingContacts>;
      listing_attribute_values: Contract<typeof listingAttributeValues>;
      listing_attribute_option_values: Contract<typeof listingAttributeOptionValues>;
      listing_images: Contract<typeof listingImages>;
      favorites: Contract<typeof favorites>;
      conversations: Contract<typeof conversations>;
      conversation_participants: Contract<typeof conversationParticipants>;
      messages: Contract<typeof messages>;
      notifications: Contract<typeof notifications>;
      reports: Contract<typeof reports>;
      moderation_actions: Contract<typeof moderationActions>;
      admin_audit_log: Contract<typeof adminAuditLog>;
    };
    Views: {
      seller_profiles: {
        Row: {
          id: string | null;
          display_name: string | null;
          avatar_path: string | null;
          bio: string | null;
          settlement_id: string | null;
          verified_at: string | null;
          created_at: string | null;
        };
        Relationships: [];
      };
      catalog_listing_cards: {
        Row: {
          id: string | null;
          slug: string | null;
          title: string | null;
          price_minor: number | null;
          currency_code: string | null;
          category_id: string | null;
          category_slug: string | null;
          settlement_id: string | null;
          location_name_ru: string | null;
          location_name_kk: string | null;
          published_at: string | null;
          promoted: boolean | null;
          primary_image_storage_key: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_my_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          id: string;
          display_name: string;
          avatar_path: string | null;
          bio: string | null;
          language_code: string;
          settlement_id: string | null;
          status: string;
          verified_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      get_profile_for_staff: {
        Args: { target_profile_id: string };
        Returns: Array<{
          id: string;
          display_name: string;
          avatar_path: string | null;
          bio: string | null;
          language_code: string;
          settlement_id: string | null;
          status: string;
          verified_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      submit_listing: {
        Args: { target_listing_id: string };
        Returns: undefined;
      };
      archive_own_listing: {
        Args: { target_listing_id: string };
        Returns: undefined;
      };
      mark_own_listing_sold: {
        Args: { target_listing_id: string };
        Returns: undefined;
      };
      get_or_create_listing_conversation: {
        Args: { target_listing_id: string };
        Returns: string;
      };
      moderate_listing: {
        Args: { target_listing_id: string; decision: string; reason_code?: string | null; note?: string | null };
        Returns: undefined;
      };
      resolve_report: {
        Args: { target_report_id: string; resolution: string; note?: string | null };
        Returns: undefined;
      };
      assign_user_role: {
        Args: { target_user_id: string; target_role: string; enabled?: boolean };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<TName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][TName]["Row"];
export type TablesInsert<TName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][TName]["Insert"];
export type TablesUpdate<TName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][TName]["Update"];
