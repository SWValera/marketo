export const promotionChoices = [
  { value: "basic", label: "publish.promotionBasic", features: ["promotion.vip3", "promotion.border"], description: "promotion.basicDescription" },
  { value: "accelerated", label: "publish.promotionAccelerated", features: ["promotion.vip7", "promotion.bumps3"], description: "promotion.acceleratedDescription" },
  { value: "maximum", label: "publish.promotionMaximum", features: ["promotion.vip7", "promotion.bumps7", "promotion.x2"], description: "promotion.maximumDescription" },
  { value: "city_premium", label: "publish.promotionShowcase", features: ["promotion.showcase7", "promotion.vip7", "promotion.x2", "promotion.bumps14"], description: "promotion.showcaseDescription" },
] as const;

export type PromotionChoice = typeof promotionChoices[number]["value"];
export function isPromotionChoice(value: unknown): value is PromotionChoice {
  return promotionChoices.some((choice) => choice.value === value);
}
