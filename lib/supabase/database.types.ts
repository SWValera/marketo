// Generated-style database contract for the reviewed Marketo schema.
// Do not hand-edit after a Supabase project is linked: replace this file with
// `supabase gen types typescript --linked` and run `npm run validate:db`.
import type { InferInsertModel, InferSelectModel, Table } from "drizzle-orm";
import type {
  adminAuditLog,
  categories,
  categoryAttributeOptions,
  categoryAttributes,
  cityPremiumAccounts,
  cityPremiumDailyMetrics,
  cityPremiumEvents,
  cityPremiumOrders,
  cityPremiumPlacements,
  cityPremiumSettings,
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

type CatalogListingCardRow = {
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
      city_premium_settings: Contract<typeof cityPremiumSettings>;
      city_premium_accounts: Contract<typeof cityPremiumAccounts>;
      city_premium_orders: Contract<typeof cityPremiumOrders>;
      city_premium_placements: Contract<typeof cityPremiumPlacements>;
      city_premium_events: Contract<typeof cityPremiumEvents>;
      city_premium_daily_metrics: Contract<typeof cityPremiumDailyMetrics>;
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
        Row: CatalogListingCardRow;
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
      get_my_account_profile: {
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
          contact_phone_e164: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      update_my_account_profile: {
        Args: {
          p_display_name: string;
          p_bio: string | null;
          p_language_code: string;
          p_settlement_id: string | null;
          p_contact_phone_e164: string | null;
        };
        Returns: Array<{
          id: string;
          display_name: string;
          avatar_path: string | null;
          bio: string | null;
          language_code: string;
          settlement_id: string | null;
          status: string;
          verified_at: string | null;
          contact_phone_e164: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      get_city_premium_placements: {
        Args: { p_settlement_id: string; p_limit?: number };
        Returns: Array<{
          placement_id: string;
          listing_id: string;
          slug: string;
          title: string;
          price_minor: number | null;
          currency_code: string;
          settlement_id: string;
          location_name_ru: string;
          location_name_kk: string;
          primary_image_storage_key: string | null;
          published_at: string;
          starts_at: string;
          ends_at: string;
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
      search_catalog_listing_cards: {
        Args: {
          p_category_ids?: string[] | null;
          p_settlement_id?: string | null;
          p_query?: string | null;
          p_min_price_minor?: number | null;
          p_max_price_minor?: number | null;
          p_attribute_filters?: Json;
        };
        Returns: CatalogListingCardRow[];
      };
      create_listing_draft: {
        Args: {
          p_category_id: string;
          p_settlement_id: string;
          p_title: string;
          p_description: string;
          p_price_minor: number | null;
          p_currency_code: string;
          p_contact_name: string;
          p_contact_phone_e164: string | null;
          p_allow_messages?: boolean;
          p_attributes?: Json;
        };
        Returns: Array<{ listing_id: string; listing_slug: string }>;
      };
      update_listing_draft: {
        Args: {
          target_listing_id: string;
          p_category_id: string;
          p_settlement_id: string;
          p_title: string;
          p_description: string;
          p_price_minor: number | null;
          p_currency_code: string;
          p_contact_name: string;
          p_contact_phone_e164: string;
          p_allow_messages?: boolean;
          p_attributes?: Json;
        };
        Returns: Array<{ listing_id: string; listing_slug: string; listing_status: string }>;
      };
      get_my_listing_moderation_feedback: {
        Args: { p_listing_id?: string | null };
        Returns: Array<{ listing_id: string; reason_code: string; rejected_at: string }>;
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
