// Mirrors frontend/src/utils/municipalityPricing.js
// Kept as a small, standalone config so the backend can compute revenue
// figures without importing frontend code. Keep the two files in sync
// when pricing changes.
export const municipalityPricing = {
    Botkyrka: { AtoE: 3600, F: 2880, Streck: 0 },
    Danderyd: { AtoE: 3200, F: 2560, Streck: 0 },
    Huddinge: { AtoE: 3600, F: 2880, Streck: 0 },
    Järfälla: { AtoE: 3300, F: 2640, Streck: 0 },
    Lidingö: { AtoE: 3200, F: 2560, Streck: 0 },
    Norrtälje: { AtoE: 3200, F: 2560, Streck: 0 },
    Nykvarn: { AtoE: 3600, F: 2880, Streck: 0 },
    "Privat kunder": { AtoE: 3360, F: 3360, Streck: 3360 },
    Salem: { AtoE: 3600, F: 2880, Streck: 0 },
    Sigtuna: { AtoE: 3200, F: 2560, Streck: 0 },
    Sollentuna: { AtoE: 3200, F: 2560, Streck: 0 },
    Solna: { AtoE: 3200, F: 2560, Streck: 0 },
    Sundbyberg: { AtoE: 3300, F: 2640, Streck: 0 },
    Södertälje: { AtoE: 3600, F: 2880, Streck: 0 },
    Täby: { AtoE: 3200, F: 2560, Streck: 0 },
    "Upplands Bro": { AtoE: 3300, F: 2640, Streck: 0 },
    "Upplands Väsby": { AtoE: 3200, F: 2560, Streck: 0 },
    Vallentuna: { AtoE: 3200, F: 2560, Streck: 0 },
    Vaxholm: { AtoE: 3200, F: 2560, Streck: 0 },
    Växjö: { AtoE: 3200, F: 2560, Streck: 0 },
    Österåker: { AtoE: 3200, F: 2560, Streck: 0 },
};

/**
 * Resolve the "kr" value a single graded enrollment is worth for a
 * municipality, following the same A-E / F / Streck (avbrott) tiers used
 * by the existing EarningsOverview view.
 */
export const gradeToRevenue = (municipality, grade) => {
    const pricing = municipalityPricing[municipality];
    if (!pricing || !grade) return 0;

    const g = String(grade).toUpperCase();
    if (["A", "B", "C", "D", "E"].includes(g)) return pricing.AtoE;
    if (g === "F") return pricing.F;
    if (["STRECK", "AVBROTT"].includes(g)) return pricing.Streck;
    return 0;
};

export default municipalityPricing;
