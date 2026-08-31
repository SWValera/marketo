import { z } from "zod";
import { getAttributeValidation, isAttributeVisible } from "../reference-data/attributes.ts";
import type {
  CategoryPriceMode,
  ReferenceAttributeOption,
  ReferenceCategoryAttribute,
} from "../reference-data/types.ts";

export const PUBLISH_LIMITS = {
  titleMin: 3,
  titleMax: 70,
  descriptionMin: 10,
  descriptionMax: 20_000,
  priceMax: 90_000_000_000,
  contactNameMin: 1,
  contactNameMax: 80,
  phoneMax: 24,
} as const;

export type PublishRangeValue = { min: string | number; max: string | number };
export type PublishAttributeValue = string | number | boolean | string[] | PublishRangeValue;
export type PublishAttributeValues = Record<string, PublishAttributeValue>;

export type PublishDraftInput = {
  categoryId: string;
  settlementId: string;
  title: string;
  description: string;
  price: number | null;
  currencyCode: "KZT";
  contactName: string;
  contactPhone: string;
  allowMessages: boolean;
  attributes: PublishAttributeValues;
};

export type PublishErrorCode =
  | "required"
  | "invalid"
  | "min_length"
  | "max_length"
  | "min"
  | "max"
  | "step"
  | "invalid_option"
  | "dependent_option"
  | "unknown_attribute";

export type PublishFieldErrors = Record<string, PublishErrorCode[]>;

const attributeValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.object({
    min: z.union([z.string().max(100), z.number().finite()]),
    max: z.union([z.string().max(100), z.number().finite()]),
  }).strict(),
]);

const publishDraftPayloadSchema = z.object({
  categoryId: z.string().max(64),
  settlementId: z.string().max(64),
  title: z.string().max(120),
  description: z.string().max(PUBLISH_LIMITS.descriptionMax),
  price: z.number().finite().nullable(),
  currencyCode: z.literal("KZT").default("KZT"),
  contactName: z.string().max(PUBLISH_LIMITS.contactNameMax),
  contactPhone: z.string().max(PUBLISH_LIMITS.phoneMax),
  allowMessages: z.boolean().default(true),
  attributes: z.record(
    z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    attributeValueSchema,
  ).default({}),
}).strict();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function addError(errors: PublishFieldErrors, field: string, code: PublishErrorCode) {
  const current = errors[field] ?? [];
  if (!current.includes(code)) errors[field] = [...current, code];
}

function fieldFromPath(path: PropertyKey[]) {
  const [root, child] = path;
  if (root === "categoryId") return "category";
  if (root === "settlementId") return "city";
  if (root === "contactName") return "contactName";
  if (root === "contactPhone") return "contactPhone";
  if (root === "attributes" && typeof child === "string") return `attributes.${child}`;
  return typeof root === "string" ? root : "form";
}

export function parsePublishDraftPayload(value: unknown):
  | { success: true; data: PublishDraftInput }
  | { success: false; errors: PublishFieldErrors } {
  const parsed = publishDraftPayloadSchema.safeParse(value);
  if (parsed.success) return { success: true, data: parsed.data as PublishDraftInput };
  const errors: PublishFieldErrors = {};
  for (const issue of parsed.error.issues) addError(errors, fieldFromPath(issue.path), "invalid");
  return { success: false, errors };
}

export function normalizeE164Phone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function formatPriceDigits(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function parsePriceDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function priceCaretPosition(formatted: string, digitIndex: number) {
  if (digitIndex <= 0) return 0;
  let digits = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) digits += 1;
    if (digits === digitIndex) return index + 1;
  }
  return formatted.length;
}

export function isPublishValueMissing(value: PublishAttributeValue | undefined) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return String(value.min ?? "").trim() === "" || String(value.max ?? "").trim() === "";
  }
  return false;
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function respectsStep(value: number, min: number, step: number) {
  const quotient = (value - min) / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-8;
}

function validateNumber(
  errors: PublishFieldErrors,
  field: string,
  value: unknown,
  validation: ReturnType<typeof getAttributeValidation>,
) {
  const number = numericValue(value);
  if (number === null) {
    addError(errors, field, "invalid");
    return;
  }
  if (validation.min !== undefined && number < validation.min) addError(errors, field, "min");
  if (validation.max !== undefined && number > validation.max) addError(errors, field, "max");
  if (validation.step !== undefined && validation.step > 0 && !respectsStep(number, validation.min ?? 0, validation.step)) {
    addError(errors, field, "step");
  }
}

function selectedOption(attribute: ReferenceCategoryAttribute, value: string) {
  return attribute.options.find((option) => option.value === value);
}

function validateDependentOption(
  errors: PublishFieldErrors,
  field: string,
  attribute: ReferenceCategoryAttribute,
  option: ReferenceAttributeOption,
  attributes: ReferenceCategoryAttribute[],
  values: PublishAttributeValues,
) {
  if (!attribute.dependsOnKey) return;
  const parent = attributes.find((item) => item.key === attribute.dependsOnKey);
  const parentValue = values[attribute.dependsOnKey];
  if (!parent || typeof parentValue !== "string") {
    addError(errors, field, "dependent_option");
    return;
  }
  const parentOption = selectedOption(parent, parentValue);
  if (!parentOption || (option.parentOptionId === null && option.value !== "other-model") || (option.parentOptionId !== null && option.parentOptionId !== parentOption.id)) {
    addError(errors, field, "dependent_option");
  }
}

export function validatePublishAttributes(
  values: PublishAttributeValues,
  attributes: ReferenceCategoryAttribute[],
  options: { strictOptions?: boolean } = {},
) {
  const errors: PublishFieldErrors = {};
  const definitions = new Map(attributes.map((attribute) => [attribute.key, attribute]));

  for (const key of Object.keys(values)) {
    if (!definitions.has(key)) addError(errors, `attributes.${key}`, "unknown_attribute");
  }

  for (const attribute of attributes) {
    if (!isAttributeVisible(attribute, values)) continue;
    const field = `attributes.${attribute.key}`;
    const value = values[attribute.key];
    if (isPublishValueMissing(value)) {
      if (attribute.required) addError(errors, field, "required");
      continue;
    }
    const validation = getAttributeValidation(attribute);

    if (attribute.dataType === "text") {
      if (typeof value !== "string") addError(errors, field, "invalid");
      else if (validation.maxLength !== undefined && value.length > validation.maxLength) addError(errors, field, "max_length");
      continue;
    }
    if (attribute.dataType === "number") {
      validateNumber(errors, field, value, validation);
      continue;
    }
    if (attribute.dataType === "boolean") {
      if (typeof value !== "boolean") addError(errors, field, "invalid");
      continue;
    }
    if (attribute.dataType === "date") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        addError(errors, field, "invalid");
      }
      continue;
    }
    if (attribute.dataType === "range") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        addError(errors, field, "invalid");
        continue;
      }
      const min = numericValue(value.min);
      const max = numericValue(value.max);
      if (min === null || max === null || min > max) {
        addError(errors, field, "invalid");
        continue;
      }
      validateNumber(errors, field, min, validation);
      validateNumber(errors, field, max, validation);
      continue;
    }

    const selectedValues = attribute.dataType === "multiselect"
      ? (Array.isArray(value) ? value : [])
      : (typeof value === "string" ? [value] : []);
    if (selectedValues.length === 0 || (attribute.dataType === "select" && selectedValues.length !== 1) || new Set(selectedValues).size !== selectedValues.length) {
      addError(errors, field, "invalid");
      continue;
    }
    for (const selectedValue of selectedValues) {
      const option = selectedOption(attribute, selectedValue);
      if (!option) {
        if (options.strictOptions) addError(errors, field, "invalid_option");
        continue;
      }
      validateDependentOption(errors, field, attribute, option, attributes, values);
    }
  }
  return errors;
}

export function validatePublishDraft(
  input: PublishDraftInput,
  options: {
    priceMode: CategoryPriceMode;
    attributes: ReferenceCategoryAttribute[];
    photoCount?: number;
    requirePhotos?: boolean;
    strictOptions?: boolean;
  },
) {
  const errors: PublishFieldErrors = {};
  if (!UUID.test(input.categoryId)) addError(errors, "category", "required");
  if (!UUID.test(input.settlementId)) addError(errors, "city", "required");

  const title = input.title.trim();
  if (title.length < PUBLISH_LIMITS.titleMin) addError(errors, "title", "min_length");
  if (title.length > PUBLISH_LIMITS.titleMax) addError(errors, "title", "max_length");
  const description = input.description.trim();
  if (description.length < PUBLISH_LIMITS.descriptionMin) addError(errors, "description", "min_length");
  if (description.length > PUBLISH_LIMITS.descriptionMax) addError(errors, "description", "max_length");

  const priceOptional = options.priceMode === "free" || options.priceMode === "exchange";
  if (input.price === null) {
    if (!priceOptional) addError(errors, "price", "required");
  } else if (!Number.isInteger(input.price) || input.price < 0) {
    addError(errors, "price", "invalid");
  } else if (input.price > PUBLISH_LIMITS.priceMax) {
    addError(errors, "price", "max");
  }

  const contactName = input.contactName.trim();
  if (contactName.length < PUBLISH_LIMITS.contactNameMin) addError(errors, "contactName", "required");
  if (contactName.length > PUBLISH_LIMITS.contactNameMax) addError(errors, "contactName", "max_length");
  if (!normalizeE164Phone(input.contactPhone)) addError(errors, "contactPhone", "invalid");
  if (options.requirePhotos && (options.photoCount ?? 0) < 1) addError(errors, "photos", "required");

  const attributeErrors = validatePublishAttributes(input.attributes, options.attributes, {
    strictOptions: options.strictOptions,
  });
  for (const [field, codes] of Object.entries(attributeErrors)) {
    for (const code of codes) addError(errors, field, code);
  }
  return errors;
}

export function firstPublishErrorStep(errors: PublishFieldErrors) {
  const fields = Object.keys(errors);
  if (fields.some((field) => field === "category" || field === "city")) return 0;
  if (fields.some((field) => ["title", "description", "price"].includes(field) || field.startsWith("attributes."))) return 1;
  if (fields.includes("photos")) return 2;
  return 3;
}

export function publishErrorsForStep(errors: PublishFieldErrors, step: number) {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => {
    if (step === 0) return field === "category" || field === "city";
    if (step === 1) return ["title", "description", "price"].includes(field) || field.startsWith("attributes.");
    if (step === 2) return field === "photos";
    return field === "contactName" || field === "contactPhone";
  })) as PublishFieldErrors;
}
