import type { SeedAttributeDefinition } from "./category-attribute-schemas.ts";

// These reviewed profiles use an exact factory model/part code, rather than a
// claimed exhaustive model dictionary. A real dictionary always takes priority.
// Keep this list explicit: a newly added profile must be reviewed by catalog audit.
const policyGroups: Record<string, readonly string[]> = {
  "factory-equipment-code": ["commercialVehicle", "trailer", "machinery", "agriculturalAttachment", "irrigationEquipment", "livestockEquipment", "watercraft", "outboardMotor", "aircraft", "transportSimple", "electricPersonalTransport", "equipment"],
  "factory-device-code": ["component", "storageDevice", "camera", "lens", "videoCamera", "projector", "audio", "gaming", "graphicsTablet", "appliance", "instrument"],
  "manufacturer-article": ["goodsBrand", "furniture", "stroller", "kidsRide", "fitnessEquipment", "winterSports", "racketSports", "teamSports", "combatSports", "waterSports", "skatingSports", "sportProtection", "petCage", "aquariumTank", "aquariumEquipment", "aquariumDecor", "terrariumEquipment", "petBed", "petCarrier", "petHarness", "petToy", "petGrooming", "petVeterinary"],
};
export function modelCodePolicy(profileNames: readonly string[]) {
  return Object.entries(policyGroups).find(([, profiles]) => profileNames.some(profile => profiles.includes(profile)))?.[0];
}
export function contextualModelCode(attribute: SeedAttributeDefinition, brand: SeedAttributeDefinition, profileNames: readonly string[]): SeedAttributeDefinition {
  const policy = modelCodePolicy(profileNames);
  if (attribute.key !== "model" || attribute.dataType !== "text" || !policy || brand.dataType !== "select") return attribute;
  return {
    ...attribute,
    label: { ru: "Модель / заводской артикул", kk: "Модель / зауыттық артикул" },
    dependsOnKey: "brand",
    validation: {
      ...attribute.validation,
      inputPurpose: "manufacturer-model-code", reviewPolicy: policy,
      placeholder: { ru: "Точный код модели на изделии / упаковке; не серийный номер", kk: "Бұйымдағы / қаптамадағы нақты модель коды; сериялық нөмір емес" },
      visibleWhen: { key: "brand", values: brand.options?.map(option => option.value) ?? [] },
    },
  };
}
