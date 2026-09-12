import type { SeedAttributeDefinition, SeedAttributeOption } from "./category-attribute-schemas.ts";

export const NEW_CATALOG_REQUIREMENTS_SINCE = "2026-09-12T17:00:00Z";
type Generation = {
  model: string; code: string; name: string; yearFrom: number; yearTo: number | null; source: string;
};
const series = (model: string, source: string, rows: readonly (readonly [string, string, number, number | null])[]): Generation[] =>
  rows.map(([code, name, yearFrom, yearTo]) => ({ model, code, name, yearFrom, yearTo, source }));

// Year intervals describe model-series production/introduction, not the model
// year printed in an individual vehicle's documents. Market/body overlaps exist.
// A null yearTo means no verified end date, not proof of current production.
export const vehicleGenerations: readonly Generation[] = [
  ...series("bmw:5-series", "https://www.bmw.co.uk/en/all-models/bmw-5-series-overview.html", [
    ["E12", "5 Series E12", 1972, 1981], ["E28", "5 Series E28", 1981, 1987],
    ["E34", "5 Series E34", 1988, 1996], ["E39", "5 Series E39", 1995, 2004],
    ["E60/E61", "5 Series E6x", 2003, 2010], ["F10/F11", "5 Series F1x", 2010, 2017],
    ["G30/G31", "5 Series G3x", 2017, null], ["G60", "5 Series G60", 2023, null],
  ]),
  ...series("mercedes-benz:c-class", "https://www.mercedes-benz.co.nz/passengercars/brand/mercedes-me-magazine/innovation/articles/history-of-the-c-class.html", [
    ["W202", "C-Class W202", 1993, 2000], ["W203", "C-Class W203", 2000, 2007],
    ["W204", "C-Class W204", 2007, 2014], ["W205", "C-Class W205", 2014, 2021],
    ["W206", "C-Class W206", 2021, null],
  ]),
  ...series("toyota:land-cruiser", "https://global.toyota/en/mobility/toyota-brand/gallery/landcruiser.html", [
    ["BJ", "Land Cruiser BJ", 1951, null], ["20", "Land Cruiser 20", 1955, null],
    ["40", "Land Cruiser 40", 1961, null], ["55", "Land Cruiser 55", 1967, null],
    ["60", "Land Cruiser 60", 1980, null], ["70", "Land Cruiser 70", 1984, null],
    ["80", "Land Cruiser 80", 1989, null], ["100", "Land Cruiser 100", 1998, null],
    ["200", "Land Cruiser 200", 2007, null], ["300", "Land Cruiser 300", 2021, null],
    ["250", "Land Cruiser 250", 2024, null], ["FJ", "Land Cruiser FJ", 2026, null],
  ]),
  ...series("toyota:land-cruiser-prado", "https://global.toyota/en/mobility/toyota-brand/gallery/landcruiser.html", [
    ["70", "Land Cruiser Prado 70", 1990, null], ["90", "Land Cruiser Prado 90", 1996, null],
    ["120", "Land Cruiser Prado 120", 2002, null], ["150", "Land Cruiser Prado 150", 2009, null],
  ]),
  ...series("toyota:rav4", "https://media.toyota.co.uk/vehicles/rav4-archive/", [
    ["I", "RAV4 I", 1994, 2000], ["II", "RAV4 II", 2000, 2006],
    ["III", "RAV4 III", 2006, 2013], ["IV", "RAV4 IV", 2013, 2019],
    ["V", "RAV4 V", 2019, 2026],
  ]),
  ...series("toyota:camry", "https://global.toyota/en/mobility/toyota-brand/gallery/camry.html", [
    ["XV10", "Camry XV10", 1991, 1996], ["XV20", "Camry XV20", 1996, 2001],
    ["XV30", "Camry XV30", 2001, 2006], ["XV40", "Camry XV40", 2006, 2011],
    ["XV50", "Camry XV50", 2011, 2017], ["XV70", "Camry XV70", 2017, 2024],
    ["XV80", "Camry XV80", 2024, null],
  ]),
  ...series("bmw:3-series", "https://www.bmwgroup.com/en/news/general/2025/50-years-BMW-3-series.html", [
    ["E21", "3 Series E21", 1975, 1983], ["E30", "3 Series E30", 1982, 1994],
    ["E36", "3 Series E36", 1990, 2000], ["E46", "3 Series E46", 1998, 2006],
    ["E90/E91/E92/E93", "3 Series E9x", 2005, 2013],
    ["F30/F31/F34", "3 Series F3x", 2011, 2019], ["G20/G21", "3 Series G2x", 2019, null],
  ]),
  ...series("mercedes-benz:e-class", "https://media.mercedes-benz.com/article/cbd23719-1e0e-4814-b763-3222fa5d7168", [
    ["W124/S124/C124/A124", "124 (E-Class с 1993)", 1984, 1997],
    ["W210/S210", "E-Class 210", 1995, 2003], ["W211/S211", "E-Class 211", 2002, 2009],
    ["W212/S212", "E-Class 212", 2009, 2016], ["W213/S213", "E-Class 213", 2016, 2023],
    ["W214/S214", "E-Class 214", 2023, null],
  ]),
  ...series("volkswagen:golf", "https://www.volkswagen-newsroom.com/en/the-new-golf-international-vehicle-presentation-5609/the-history-of-the-golf-5625", [
    ["Mk1", "Golf I", 1974, 1983], ["Mk2", "Golf II", 1983, 1991],
    ["Mk3", "Golf III", 1991, 1997], ["Mk4", "Golf IV", 1997, 2003],
    ["Mk5", "Golf V", 2003, 2008], ["Mk6", "Golf VI", 2008, 2012],
    ["Mk7", "Golf VII", 2012, 2019], ["Mk8", "Golf VIII", 2019, null],
  ]),
];

export function vehicleGenerationFields(models: readonly SeedAttributeOption[], compatible = false): SeedAttributeDefinition[] {
  const modelValues = new Set(models.map(model => model.value));
  const supported = vehicleGenerations.filter(generation => modelValues.has(generation.model));
  const modelKey = compatible ? "compatible_model" : "model";
  const generationKey = compatible ? "compatible_generation" : "generation";
  const options: SeedAttributeOption[] = supported.map(generation => ({
    value: `${generation.model}:${generation.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    parentValue: generation.model,
    label: {
      ru: `${generation.code} (${generation.yearTo ? `${generation.yearFrom}–${generation.yearTo}` : `с ${generation.yearFrom}`})`,
      kk: `${generation.code} (${generation.yearTo ? `${generation.yearFrom}–${generation.yearTo}` : `${generation.yearFrom} жылдан`})`,
    },
    metadata: {
      generation_code: generation.code, generation_name: generation.name,
      year_from: generation.yearFrom, year_to: generation.yearTo, source: generation.source,
    },
  }));
  options.push({ value: "other-generation", label: { ru: "Другое поколение", kk: "Басқа буын" } });
  return [
    { key: generationKey, label: { ru: compatible ? "Совместимое поколение" : "Поколение", kk: compatible ? "Үйлесімді буын" : "Буын" },
      dataType: "select", dependsOnKey: modelKey, optionsLoadMode: "deferred", filterMode: "exact", filterable: true, searchable: true, options,
      validation: { fallbackOption: "other-generation", ...(!compatible && supported.length ? {
        requiredWhen: { key: modelKey, values: [...new Set(supported.map(generation => generation.model))] },
        requiredWhenSince: NEW_CATALOG_REQUIREMENTS_SINCE,
      } : {}) } },
    { key: `${generationKey}_other`, label: { ru: "Укажите поколение", kk: "Буын атауын көрсетіңіз" }, dataType: "text", searchable: true,
      validation: { maxLength: 100, placeholder: { ru: "Код или название поколения по документам", kk: "Құжаттағы буын коды немесе атауы" },
        visibleWhen: { key: generationKey, values: ["other-generation"] }, requiredWhen: { key: generationKey, values: ["other-generation"] } } },
  ];
}
