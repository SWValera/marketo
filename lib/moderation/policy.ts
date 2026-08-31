export const MODERATION_NOTE_MAX_LENGTH = 2000;

export const MODERATION_REJECTION_REASONS = [
  { code: "incomplete_information", ru: "Недостаточно информации", kk: "Ақпарат жеткіліксіз" },
  { code: "wrong_category", ru: "Неверная категория", kk: "Санат қате таңдалған" },
  { code: "duplicate", ru: "Дублирующее объявление", kk: "Қайталанатын хабарландыру" },
  { code: "photo_issue", ru: "Проблема с фотографиями", kk: "Фотосуреттерде мәселе бар" },
  { code: "policy_violation", ru: "Нарушение правил", kk: "Ережелер бұзылған" },
  { code: "other", ru: "Другая причина", kk: "Басқа себеп" },
] as const;

export type ModerationRejectionReason = (typeof MODERATION_REJECTION_REASONS)[number]["code"];

const rejectionReasonSet = new Set<string>(MODERATION_REJECTION_REASONS.map((reason) => reason.code));

export function isModerationRejectionReason(value: unknown): value is ModerationRejectionReason {
  return typeof value === "string" && rejectionReasonSet.has(value);
}
