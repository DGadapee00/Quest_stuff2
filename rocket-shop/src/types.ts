export const MATERIAL_IDS = [
  "al2219_t87",
  "al2195_t8",
  "ss304l",
  "inconel718_aged",
  "ti6al4v",
  "im7_8552_qi",
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

export const DOME_TYPES = ["hemispherical", "elliptical_2to1"] as const;
export type DomeType = (typeof DOME_TYPES)[number];

export const FORMING_METHODS = ["rolled_welded", "spun", "laid_up"] as const;
export type FormingMethod = (typeof FORMING_METHODS)[number];

export const WELD_PROCESSES = ["none", "tig", "fsw"] as const;
export type WeldProcess = (typeof WELD_PROCESSES)[number];

export const HEAT_TREATMENTS = [
  "as_received",
  "stress_relief",
  "solution_treat_and_age",
  "autoclave_m_cure",
] as const;
export type HeatTreatment = (typeof HEAT_TREATMENTS)[number];

export const PROPELLANT_IDS = ["lox", "lch4", "rp1"] as const;
export type PropellantId = (typeof PROPELLANT_IDS)[number];

export const STATION_IDS = [
  "cylinder_membrane",
  "longitudinal_weld",
  "girth_weld",
  "dome_apex",
  "dome_knuckle",
] as const;
export type StationId = (typeof STATION_IDS)[number];

export type MaterialClass = "isotropic_metal" | "quasi_isotropic_laminate";

export type Weldability =
  | "readily_weldable"
  | "weldable_with_procedure"
  | "fusion_crack_sensitive"
  | "not_weldable";

export type StrengthCoverage = "measured" | "interpolated" | "reconstructed" | "clamped";

export type RetentionQuality = "measured" | "assumed" | "missing";

export type Disposition = "pass" | "pass_with_notes" | "fail" | "not_qualified";

export type FailureMode = "yield" | "ultimate";

export interface SourcedNumber {
  value: number | null;
  sourceId: string | null;
  missingReason?: string;
  /** Set when the number is a stated assumption rather than a measurement on this alloy. */
  assumption?: string;
}

export interface StrengthAnchor {
  temperatureK: number;
  yieldPa: number | null;
  ultimateTensilePa: number;
  /** Compression allowable. Metals leave this null and use von Mises. */
  ultimateCompressivePa: number | null;
}

export interface Material {
  id: MaterialId;
  commonName: string;
  class: MaterialClass;
  densityKgPerM3: SourcedNumber;
  youngsModulusPa: SourcedNumber;
  poissonsRatio: SourcedNumber;
  /** Linear or secant coefficient. See cteReferenceK and cteSecantEndK. */
  ctePerK: SourcedNumber;
  cteReferenceK: number | null;
  /** When set, ctePerK is the mean coefficient from cteReferenceK to this temperature. */
  cteSecantEndK: number | null;
  conductivityWPerMK: SourcedNumber;
  maxServiceTemperatureK: SourcedNumber;
  /** Shop planning price. Not a physical property and not a quote. */
  planningUsdPerKg: number;
  weldability: Weldability;
  weldabilityNote: string;
  weldabilitySourceId: string;
  strengthBasis: string;
  strengthSourceId: string;
  anchors: StrengthAnchor[];
  staAnchors: StrengthAnchor[] | null;
  staStrengthBasis: string | null;
  staSourceId: string | null;
  strengthInterpolation: "linear" | "al2195_niu_2023";
}

export interface TankDesign {
  materialId: MaterialId;
  /** Inner diameter of the cylinder, meters. */
  innerDiameterM: number;
  /** Tangent-to-tangent barrel length, meters. Domes are extra. */
  cylinderLengthM: number;
  /** Uniform wall thickness, meters, cylinder and both domes. */
  wallThicknessM: number;
  dome: DomeType;
  forming: FormingMethod;
  weldProcess: WeldProcess;
  heatTreatment: HeatTreatment;
}

export interface AssessmentConditions {
  /** Wall temperature during the test, kelvin. */
  temperatureK: number;
  /** Pressure currently on the tank, pascals gauge. */
  pressurePa: number;
  /** Maximum expected operating pressure, pascals gauge. */
  meopPa: number;
}

export interface MembraneStress {
  hoopPa: number;
  meridionalPa: number;
  vonMisesPa: number;
  maxPrincipalPa: number;
  minPrincipalPa: number;
}

export interface StationReport {
  id: StationId;
  label: string;
  /** Membrane stress at the pressure currently on the tank. */
  stress: MembraneStress;
  /** Membrane stress per pascal, so a prediction can be stated at the limit pressure. */
  membranePerPa: MembraneStress;
  /** Von Mises for metals, maximum principal stress for the laminate. */
  criterion: "von_mises" | "max_principal";
  yieldUtilization: number | null;
  ultimateUtilization: number | null;
  yieldPressurePa: number | null;
  burstPressurePa: number | null;
  qualified: boolean;
  notes: string[];
}

export interface TankAssessment {
  ok: true;
  design: TankDesign;
  temperatureK: number;
  pressurePa: number;
  meopPa: number;
  strengthCoverage: StrengthCoverage;
  strength: {
    yieldPa: number | null;
    ultimateTensilePa: number;
    ultimateCompressivePa: number | null;
  };
  stations: StationReport[];
  governingYield: StationReport | null;
  governingBurst: StationReport | null;
  predictedYieldPressurePa: number | null;
  predictedBurstPressurePa: number | null;
  /** Lowest qualified station, even when a missing coupon or a clamped curve blocks a signature. */
  indicativeYieldPressurePa: number | null;
  indicativeBurstPressurePa: number | null;
  proofPressurePa: number;
  requiredBurstPressurePa: number;
  /** Predicted yield pressure / proof pressure − 1. Null when the material has no yield. */
  yieldMargin: number | null;
  /**
   * For metals, proof is checked against yield. For the laminate, which has no
   * yield point, proof is checked against ultimate.
   */
  proofComparedTo: "yield" | "ultimate";
  proofMargin: number | null;
  burstMargin: number | null;
  disposition: Disposition;
  /** Short physical result, e.g. a weld exceeding yield at a pressure. */
  headline: string;
  /** How the headline was obtained: which stress, which allowable, which factor. */
  reason: string;
  notes: string[];
  blocking: string[];
  massKg: number;
  materialCostUsd: number;
  processCostUsd: number;
  totalCostUsd: number;
  innerRadiusM: number;
  contractedInnerRadiusM: number;
  contractedThicknessM: number;
  thermalStrain: number | null;
  overallLengthM: number;
  thinWallRadiusOverThickness: number;
  /** Lamé inner-fiber cylinder hoop divided by the thin-wall hoop. 1.05 means the thin-wall hoop is about 5% low. */
  lameHoopOverThin: number;
  elasticHoopStrain: number | null;
  elasticAxialStrain: number | null;
}

export interface InvalidDesign {
  ok: false;
  reasons: string[];
}

export type AssessmentResult = TankAssessment | InvalidDesign;

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
