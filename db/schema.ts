import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamptz = <TName extends string>(name: TName) => timestamp(name, { withTimezone: true, mode: "string" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const locales = pgTable("locales", {
  code: varchar("code", { length: 10 }).primaryKey(),
  nameRu: text("name_ru").notNull(),
  nameKk: text("name_kk").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: char("code", { length: 2 }).notNull().unique(),
  slug: text("slug").notNull().unique(),
  nameRu: text("name_ru").notNull(),
  nameKk: text("name_kk").notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull(),
  currencySymbol: text("currency_symbol").notNull(),
  currencyExponent: smallint("currency_exponent").notNull().default(0),
  phoneCode: text("phone_code").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const regions = pgTable("regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryId: uuid("country_id").notNull().references(() => countries.id, { onDelete: "restrict" }),
  code: text("code").notNull(),
  slug: text("slug").notNull(),
  nameRu: text("name_ru").notNull(),
  nameKk: text("name_kk").notNull(),
  kind: text("kind").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  sourceCode: text("source_code"),
  sourceUpdatedAt: date("source_updated_at", { mode: "string" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("regions_country_code_unique").on(table.countryId, table.code),
  unique("regions_country_slug_unique").on(table.countryId, table.slug),
]);

export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  regionId: uuid("region_id").notNull().references(() => regions.id, { onDelete: "restrict" }),
  parentId: uuid("parent_id"),
  katoCode: text("kato_code").unique(),
  slug: text("slug").notNull(),
  nameRu: text("name_ru").notNull(),
  nameKk: text("name_kk").notNull(),
  kind: text("kind").notNull(),
  isSelectable: boolean("is_selectable").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  sourceUpdatedAt: date("source_updated_at", { mode: "string" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("settlements_region_slug_unique").on(table.regionId, table.slug),
  index("settlements_region_active_sort_idx").on(table.regionId, table.isActive, table.isSelectable, table.sortOrder, table.id),
  foreignKey({
    name: "settlements_parent_id_fkey",
    columns: [table.parentId],
    foreignColumns: [table.id],
  }).onDelete("restrict"),
]);

// IDs referencing auth.users intentionally remain plain UUID columns here.
// Supabase owns the auth schema; the reviewed SQL migrations add those FKs.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull().default("Пользователь"),
  avatarPath: text("avatar_path"),
  bio: text("bio"),
  languageCode: varchar("language_code", { length: 10 }).notNull().default("ru").references(() => locales.code, { onDelete: "restrict" }),
  settlementId: uuid("settlement_id").references(() => settlements.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  verifiedAt: timestamptz("verified_at"),
  lastSeenAt: timestamptz("last_seen_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const profilePrivate = pgTable("profile_private", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  contactPhoneE164: text("contact_phone_e164"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  assignedBy: uuid("assigned_by"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.role] })]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id"),
  slug: text("slug").notNull().unique(),
  nameRu: text("name_ru").notNull(),
  nameKk: text("name_kk").notNull(),
  iconKey: text("icon_key"),
  toneKey: text("tone_key"),
  searchPlaceholderRu: text("search_placeholder_ru"),
  searchPlaceholderKk: text("search_placeholder_kk"),
  titlePlaceholderRu: text("title_placeholder_ru"),
  titlePlaceholderKk: text("title_placeholder_kk"),
  descriptionHintRu: text("description_hint_ru"),
  descriptionHintKk: text("description_hint_kk"),
  priceMode: text("price_mode").notNull().default("price"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
  foreignKey({
    name: "categories_parent_id_fkey",
    columns: [table.parentId],
    foreignColumns: [table.id],
  }).onDelete("restrict"),
]);

export const categoryAttributes = pgTable("category_attributes", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  labelRu: text("label_ru").notNull(),
  labelKk: text("label_kk").notNull(),
  dataType: text("data_type").notNull(),
  unitRu: text("unit_ru"),
  unitKk: text("unit_kk"),
  isRequired: boolean("is_required").notNull().default(false),
  isFilterable: boolean("is_filterable").notNull().default(false),
  isSearchable: boolean("is_searchable").notNull().default(false),
  inheritsToChildren: boolean("inherits_to_children").notNull().default(true),
  validation: jsonb("validation").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("category_attributes_category_key_unique").on(table.categoryId, table.key),
  unique("category_attributes_category_sort_unique").on(table.categoryId, table.sortOrder),
]);

export const categoryAttributeOptions = pgTable("category_attribute_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  attributeId: uuid("attribute_id").notNull().references(() => categoryAttributes.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  labelRu: text("label_ru").notNull(),
  labelKk: text("label_kk").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
  unique("category_attribute_options_attribute_value_unique").on(table.attributeId, table.value),
  unique("category_attribute_options_attribute_sort_unique").on(table.attributeId, table.sortOrder),
  unique("category_attribute_options_attribute_id_id_unique").on(table.attributeId, table.id),
]);

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  settlementId: uuid("settlement_id").notNull().references(() => settlements.id, { onDelete: "restrict" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priceMinor: bigint("price_minor", { mode: "number" }),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("KZT"),
  status: text("status").notNull().default("draft"),
  promotedUntil: timestamptz("promoted_until"),
  publishedAt: timestamptz("published_at"),
  expiresAt: timestamptz("expires_at"),
  deletedAt: timestamptz("deleted_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  searchDocument: tsvector("search_document").generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))`,
  ),
}, (table) => [
  index("listings_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
  index("listings_status_created_idx").on(table.status, table.createdAt, table.id),
]);

export const listingContacts = pgTable("listing_contacts", {
  listingId: uuid("listing_id").primaryKey().references(() => listings.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  contactPhoneE164: text("contact_phone_e164"),
  allowMessages: boolean("allow_messages").notNull().default(true),
  allowPhone: boolean("allow_phone").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const listingAttributeValues = pgTable("listing_attribute_values", {
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  attributeId: uuid("attribute_id").notNull().references(() => categoryAttributes.id, { onDelete: "restrict" }),
  textValue: text("text_value"),
  numberValue: numeric("number_value"),
  booleanValue: boolean("boolean_value"),
  dateValue: date("date_value", { mode: "string" }),
  numberMinValue: numeric("number_min_value"),
  numberMaxValue: numeric("number_max_value"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.listingId, table.attributeId] })]);

export const listingAttributeOptionValues = pgTable("listing_attribute_option_values", {
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  attributeId: uuid("attribute_id").notNull().references(() => categoryAttributes.id, { onDelete: "restrict" }),
  optionId: uuid("option_id").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.listingId, table.attributeId, table.optionId] }),
  foreignKey({
    name: "listing_attribute_option_values_option_fk",
    columns: [table.attributeId, table.optionId],
    foreignColumns: [categoryAttributeOptions.attributeId, categoryAttributeOptions.id],
  }).onDelete("restrict"),
]);

export const listingImages = pgTable("listing_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  byteSize: bigint("byte_size", { mode: "number" }),
  mimeType: text("mime_type"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [unique("listing_images_listing_sort_unique").on(table.listingId, table.sortOrder)]);

export const favorites = pgTable("favorites", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.listingId] })]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  participantLowId: uuid("participant_low_id").references(() => profiles.id, { onDelete: "set null" }),
  participantHighId: uuid("participant_high_id").references(() => profiles.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  lastMessageAt: timestamptz("last_message_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [unique("conversations_listing_pair_unique").on(table.listingId, table.participantLowId, table.participantHighId)]);

export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  participantRole: text("participant_role").notNull().default("member"),
  lastReadAt: timestamptz("last_read_at"),
  joinedAt: timestamptz("joined_at").notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.conversationId, table.userId] })]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => profiles.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  messageType: text("message_type").notNull().default("text"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  editedAt: timestamptz("edited_at"),
  deletedAt: timestamptz("deleted_at"),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  readAt: timestamptz("read_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").references(() => profiles.id, { onDelete: "set null" }),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  reportedUserId: uuid("reported_user_id").references(() => profiles.id, { onDelete: "set null" }),
  reasonCode: text("reason_code").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  moderatorId: uuid("moderator_id").references(() => profiles.id, { onDelete: "set null" }),
  resolutionNote: text("resolution_note"),
  resolvedAt: timestamptz("resolved_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
  moderatorId: uuid("moderator_id").references(() => profiles.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  reasonCode: text("reason_code"),
  note: text("note"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (table) => [
  index("admin_audit_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  check("admin_audit_log_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
]);

export const schemaTables = {
  locales,
  countries,
  regions,
  settlements,
  profiles,
  profilePrivate,
  userRoles,
  categories,
  categoryAttributes,
  categoryAttributeOptions,
  listings,
  listingContacts,
  listingAttributeValues,
  listingAttributeOptionValues,
  listingImages,
  favorites,
  conversations,
  conversationParticipants,
  messages,
  notifications,
  reports,
  moderationActions,
  adminAuditLog,
} as const;
