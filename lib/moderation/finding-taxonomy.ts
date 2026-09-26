/** Canonical lexical families. Source rule codes remain the DB authorization key. */
export const findingFamilies={
 vape:'possible_vape',tobacco:'possible_tobacco',nicotine:'possible_nicotine_product',weapon:'possible_weapon',
 ammunition:'possible_ammunition',explosive:'possible_explosive',drugs:'possible_drug',illegal_precursors:'possible_precursor',
 forged_document:'possible_fake_document',stolen_payment_data:'possible_payment_data',illegal_service:'possible_illegal_service',
 regulated:'possible_regulated_item',adult_content:'possible_adult_content',
} as const;
export type CanonicalFindingFamily=typeof findingFamilies[keyof typeof findingFamilies];
export function canonicalFindingFamily(code:string):CanonicalFindingFamily{
 if(!Object.hasOwn(findingFamilies,code))throw Error('unknown_finding_family');
 return findingFamilies[code as keyof typeof findingFamilies];
}
