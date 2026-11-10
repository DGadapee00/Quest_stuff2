import type { Material, MaterialId, SourcedNumber, StrengthAnchor } from "./types.js";
import { MATERIAL_IDS } from "./types.js";
import { fahrenheitToKelvin, ksiToPa, KG_PER_M3_PER_LB_PER_IN3, W_PER_MK_PER_BTU_IN } from "./units.js";

function measured(value: number, sourceId: string, assumption?: string): SourcedNumber {
  return assumption ? { value, sourceId, assumption } : { value, sourceId };
}

function missing(missingReason: string): SourcedNumber {
  return { value: null, sourceId: null, missingReason };
}

const ksiAnchor = (
  temperatureK: number,
  yieldKsi: number | null,
  ultimateKsi: number,
  compressionKsi: number | null = null,
): StrengthAnchor => ({
  temperatureK,
  yieldPa: yieldKsi === null ? null : ksiToPa(yieldKsi),
  ultimateTensilePa: ksiToPa(ultimateKsi),
  ultimateCompressivePa: compressionKsi === null ? null : ksiToPa(compressionKsi),
});

const mpaAnchor = (
  temperatureK: number,
  yieldMpa: number | null,
  ultimateMpa: number,
  compressionMpa: number | null = null,
): StrengthAnchor => ({
  temperatureK,
  yieldPa: yieldMpa === null ? null : yieldMpa * 1e6,
  ultimateTensilePa: ultimateMpa * 1e6,
  ultimateCompressivePa: compressionMpa === null ? null : compressionMpa * 1e6,
});

/**
 * 2195-T8 strength from the Niu et al. description.
 * Yield is linear from 586 MPa at 298 K to 724 MPa at 20 K.
 * From 133 K to 298 K the ultimate–yield gap is the measured 28 MPa.
 * From 20 K to 133 K the gap opens linearly to the measured 135 MPa.
 * Both published endpoints are exact. Values outside 20–298 K are not returned here.
 */
export function al2195StrengthPa(temperatureK: number): { yieldPa: number; ultimatePa: number } {
  const yieldPa = 586e6 + ((724e6 - 586e6) * (298 - temperatureK)) / (298 - 20);
  const gapPa =
    temperatureK >= 133
      ? 28e6
      : 28e6 + ((135e6 - 28e6) * (133 - temperatureK)) / (133 - 20);
  return { yieldPa, ultimatePa: yieldPa + gapPa };
}

const al2219: Material = {
  id: "al2219_t87",
  commonName: "Aluminum 2219-T87",
  class: "isotropic_metal",
  densityKgPerM3: measured(2840, "kaiser-2219"),
  youngsModulusPa: measured(73.1e9, "kaiser-2219"),
  poissonsRatio: measured(0.33, "nist-ir-3971"),
  ctePerK: measured(22.5e-6, "kaiser-2219"),
  cteReferenceK: 293.15,
  cteSecantEndK: null,
  conductivityWPerMK: measured(
    130,
    "kaiser-2219",
    "Kaiser prints 130 W/m·K for T851 and 116 W/m·K for T351, not for T87. 130 is the T851 figure, used as the nearest aged temper on that sheet.",
  ),
  maxServiceTemperatureK: measured(fahrenheitToKelvin(600), "kaiser-2219"),
  planningUsdPerKg: 22,
  weldability: "readily_weldable",
  weldabilityNote:
    "Kaiser describes 2219 as readily weldable. The arc rating printed on that sheet is A. The T87 temper still loses most of its strength in a fusion weld because the cold work and the age are wiped out in the joint.",
  weldabilitySourceId: "kaiser-2219",
  strengthBasis:
    "NISTIR 3971 reference 23B, one longitudinal test on 12.7 mm 2219-T87 plate at each temperature. Not a statistical allowable. Kaiser’s producer typical at room temperature is 393 MPa yield and 476 MPa ultimate, within about 2% of this series at 300 K.",
  strengthSourceId: "nist-ir-3971",
  anchors: [
    mpaAnchor(300, 388, 469),
    mpaAnchor(77, 470, 592),
    mpaAnchor(20, 476, 687),
  ],
  staAnchors: null,
  staStrengthBasis: null,
  staSourceId: null,
  strengthInterpolation: "linear",
};

const al2195: Material = {
  id: "al2195_t8",
  commonName: "Aluminum-lithium 2195-T8",
  class: "isotropic_metal",
  densityKgPerM3: measured(2720, "sam-2195"),
  youngsModulusPa: measured(75e9, "sam-2195"),
  poissonsRatio: measured(
    0.33,
    "mil-hdbk-5j-aluminum-poisson",
    "Poisson’s ratio 0.33 is the MIL-HDBK-5J aluminum-alloy value. A 2195-specific measurement is not on this card.",
  ),
  ctePerK: missing("No 2195 coefficient of thermal expansion was taken from the sources used here."),
  cteReferenceK: null,
  cteSecantEndK: null,
  conductivityWPerMK: missing("No single 2195 conductivity was taken from the sources used here."),
  maxServiceTemperatureK: missing("No 2195 maximum service temperature was taken from the sources used here."),
  planningUsdPerKg: 90,
  weldability: "fusion_crack_sensitive",
  weldabilityNote:
    "A NASA laser-weld study on 2195 did not eliminate solidification cracking. Friction-stir welding is the route tank programs adopted. This dataset has no transverse coupon for either process, so a 2195 weld is not a signable joint.",
  weldabilitySourceId: "ntrs-2195-laser-1996",
  strengthBasis:
    "Niu et al. 2023, 15 mm 2195-T8 plate, rolling direction. Yield is linear between the measured 298 K and 20 K points. Ultimate follows their stated gap: 28 MPa from 133 K to 298 K, opening to 135 MPa at 20 K.",
  strengthSourceId: "niu-2195-2023",
  anchors: [],
  staAnchors: null,
  staStrengthBasis: null,
  staSourceId: null,
  strengthInterpolation: "al2195_niu_2023",
};

const ss304l: Material = {
  id: "ss304l",
  commonName: "304L stainless, annealed",
  class: "isotropic_metal",
  densityKgPerM3: measured(8030, "upmet-304l"),
  youngsModulusPa: measured(200e9, "upmet-304l"),
  poissonsRatio: measured(
    0.29,
    "assumption-ss304l-poisson",
    "0.29 is assumed. The UPMet 304L sheet does not print Poisson’s ratio.",
  ),
  ctePerK: measured(16.6e-6, "upmet-304l"),
  cteReferenceK: 293.15,
  cteSecantEndK: null,
  conductivityWPerMK: measured(16.3, "upmet-304l"),
  maxServiceTemperatureK: missing("The UPMet 304L sheet used here does not state a maximum service temperature."),
  planningUsdPerKg: 8,
  weldability: "readily_weldable",
  weldabilityNote:
    "Annealed 304L is the usual cryogenic shop stainless and is routinely arc welded. Retention is modeled as 1 because there is no precipitation temper to lose. That is an assumption, not a coupon.",
  weldabilitySourceId: "assumption-ss304l-weld",
  strengthBasis:
    "Kim et al. 2023 Table A2, 304L with 10% nickel, as cited there from their reference 56: 278 MPa yield and 716 MPa ultimate at 293 K; 389 MPa yield and 1656 MPa ultimate at 77 K. The paper’s own single specimen, which reached 2172 MPa ultimate at 77 K, is not used.",
  strengthSourceId: "kim-304l-2023",
  anchors: [mpaAnchor(293, 278, 716), mpaAnchor(77, 389, 1656)],
  staAnchors: null,
  staStrengthBasis: null,
  staSourceId: null,
  strengthInterpolation: "linear",
};

const inconel718: Material = {
  id: "inconel718_aged",
  commonName: "Inconel 718, aged",
  class: "isotropic_metal",
  densityKgPerM3: measured(0.297 * KG_PER_M3_PER_LB_PER_IN3, "smc-045-inconel-718"),
  youngsModulusPa: measured(ksiToPa(29.0e3), "smc-045-inconel-718"),
  poissonsRatio: measured(0.294, "smc-045-inconel-718"),
  ctePerK: measured(5.9e-6 * (9 / 5), "smc-045-inconel-718"),
  cteReferenceK: fahrenheitToKelvin(70),
  cteSecantEndK: fahrenheitToKelvin(-320),
  conductivityWPerMK: measured(79 * W_PER_MK_PER_BTU_IN, "smc-045-inconel-718"),
  maxServiceTemperatureK: measured(fahrenheitToKelvin(1300), "smc-045-inconel-718"),
  planningUsdPerKg: 55,
  weldability: "weldable_with_procedure",
  weldabilityNote:
    "Special Metals calls 718 readily fabricated and outstanding against post-weld cracking. It is age-hardened, so the heat-affected zone does not keep the aged strength unless it is re-aged. No transverse coupon is on this card, so a 718 weld is not signable.",
  weldabilitySourceId: "smc-045-inconel-718",
  strengthBasis:
    "SMC-045 Table 20, 5/8 in hot-rolled round, annealed 1800°F and aged 1325°F/8 h, furnace cooled to 1150°F, total age 18 h. 190.5 ksi ultimate and 153.5 ksi yield at 80°F; 237.0 ksi ultimate and 173.5 ksi yield at −320°F.",
  strengthSourceId: "smc-045-inconel-718",
  anchors: [
    ksiAnchor(fahrenheitToKelvin(80), 153.5, 190.5),
    ksiAnchor(fahrenheitToKelvin(-320), 173.5, 237.0),
  ],
  staAnchors: null,
  staStrengthBasis: null,
  staSourceId: null,
  strengthInterpolation: "linear",
};

const ti64: Material = {
  id: "ti6al4v",
  commonName: "Ti-6Al-4V",
  class: "isotropic_metal",
  densityKgPerM3: measured(4420, "timet-6-4-datasheet"),
  youngsModulusPa: measured(
    114.5e9,
    "timet-6-4-datasheet",
    "TIMET states 107–122 GPa at 20°C, texture dependent. 114.5 GPa is the midpoint of that range, not a single measured modulus.",
  ),
  poissonsRatio: measured(0.31, "timet-6-4-datasheet"),
  ctePerK: measured(9.0e-6, "timet-6-4-datasheet"),
  cteReferenceK: 293.15,
  cteSecantEndK: null,
  conductivityWPerMK: measured(6.6, "timet-6-4-datasheet"),
  maxServiceTemperatureK: measured(350 + 273.15, "timet-6-4-datasheet"),
  planningUsdPerKg: 45,
  weldability: "weldable_with_procedure",
  weldabilityNote:
    "TIMET says 6-4 is weldable when the joint is clean and shielded. No transverse coupon is on this card, so a titanium weld is not signable. Cryogenic service would normally move to the ELI grade for toughness; this card is standard grade and has no cryogenic strength.",
  weldabilitySourceId: "timet-6-4-datasheet",
  strengthBasis:
    "TIMET properties manual Table 5, typical annealed plate: 136 ksi ultimate, 128 ksi yield. Not a guaranteed minimum (those are lower) and not a cryogenic measurement.",
  strengthSourceId: "timet-6-4-manual",
  anchors: [ksiAnchor(293.15, 128, 136)],
  staAnchors: [ksiAnchor(293.15, 154, 168)],
  staStrengthBasis:
    "TIMET properties manual Table 5, typical sheet aged at 1000°F for 4 h: 168 ksi ultimate, 154 ksi yield. A different product form from the annealed plate card.",
  staSourceId: "timet-6-4-manual",
  strengthInterpolation: "linear",
};

const cfrp: Material = {
  id: "im7_8552_qi",
  commonName: "IM7/8552 carbon/epoxy, quasi-isotropic",
  class: "quasi_isotropic_laminate",
  densityKgPerM3: measured(1580, "ncamp-im7-8552"),
  youngsModulusPa: measured(ksiToPa(8.39e3), "ncamp-im7-8552"),
  poissonsRatio: measured(0.334, "ncamp-im7-8552"),
  ctePerK: missing(
    "The NCAMP tables used here do not include a laminate CTE. In-plane and through-thickness expansion are different, and neither is on this card.",
  ),
  cteReferenceK: null,
  cteSecantEndK: null,
  conductivityWPerMK: missing("No laminate conductivity was taken from the NCAMP tables used here."),
  maxServiceTemperatureK: measured(fahrenheitToKelvin(406.43), "ncamp-im7-8552"),
  planningUsdPerKg: 180,
  weldability: "not_weldable",
  weldabilityNote:
    "A cured tape laminate is not welded. The only qualified route on this card is the NCAMP autoclave M-cure of a quasi-isotropic layup. Filament-wound tanks and bonded joints are not in the dataset.",
  weldabilitySourceId: "ncamp-im7-8552",
  strengthBasis:
    "NCAMP CAM-RP-2009-015 Rev B, [45/0/−45/90]2s, means normalized to 0.0072 in cured ply. Tension 104.69 ksi at 70°F dry and 99.35 ksi at −65°F dry. Compression 87.05 ksi at 70°F dry only. There is no yield strength. −65°F is not a cryogenic propellant temperature. The 0° fiber-direction mean is about 363 ksi and is not the wall allowable.",
  strengthSourceId: "ncamp-im7-8552",
  anchors: [
    ksiAnchor(fahrenheitToKelvin(70), null, 104.69, 87.05),
    ksiAnchor(fahrenheitToKelvin(-65), null, 99.35, null),
  ],
  staAnchors: null,
  staStrengthBasis: null,
  staSourceId: null,
  strengthInterpolation: "linear",
};

export const materials: Record<MaterialId, Material> = {
  al2219_t87: al2219,
  al2195_t8: al2195,
  ss304l,
  inconel718_aged: inconel718,
  ti6al4v: ti64,
  im7_8552_qi: cfrp,
};

export function getMaterial(id: MaterialId): Material {
  return materials[id];
}

export function listMaterials(): Material[] {
  return MATERIAL_IDS.map((id) => materials[id]);
}
