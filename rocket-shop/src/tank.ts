import { tankMaterialVolume, processCostUsd } from "./mass-cost.js";
import { getMaterial } from "./materials.js";
import {
  cylinderMembrane,
  domeHeightM,
  domeMembrane,
  lameHoopOverThin,
  laminateUtilization,
  metalUtilization,
  vonMises,
} from "./pressure.js";
import { strengthAt } from "./strength.js";
import { thermalContraction } from "./thermal.js";
import type {
  AssessmentConditions,
  AssessmentResult,
  Disposition,
  FailureMode,
  Material,
  MembraneStress,
  StationId,
  StationReport,
  TankDesign,
  WeldProcess,
} from "./types.js";
import { assertNever } from "./types.js";
import { formatMpa, formatPsi } from "./units.js";
import { transverseUltimateRetention, transverseYieldRetention, weldCard, type WeldCard } from "./weld.js";

export const PROOF_FACTOR = 1.5;
export const BURST_FACTOR = 2.0;
export const THIN_WALL_MIN_RADIUS_OVER_THICKNESS = 10;

export interface Propellant {
  id: "lox" | "lch4" | "rp1";
  name: string;
  temperatureK: number;
  sourceId: string;
  note: string;
}

export const PROPELLANTS: Record<Propellant["id"], Propellant> = {
  lox: {
    id: "lox",
    name: "LOX",
    temperatureK: 90.19,
    sourceId: "nist-oxygen-nbp",
    note: "Normal boiling point of oxygen at 1 atm, rounded to 0.01 K.",
  },
  lch4: {
    id: "lch4",
    name: "LCH4",
    temperatureK: 111.66,
    sourceId: "nist-methane-nbp",
    note: "Normal boiling point of methane at 1 atm, rounded to 0.01 K.",
  },
  rp1: {
    id: "rp1",
    name: "RP-1",
    temperatureK: 293.15,
    sourceId: "shop-ambient-rp1",
    note: "Shop ambient. RP-1 is storable.",
  },
};

export function requiredPressures(meopPa: number): { proofPressurePa: number; burstPressurePa: number } {
  return {
    proofPressurePa: PROOF_FACTOR * meopPa,
    burstPressurePa: BURST_FACTOR * meopPa,
  };
}

export function validateDesign(design: TankDesign): { ok: true; warnings: string[] } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const material = getMaterial(design.materialId);

  if (!(design.innerDiameterM > 0)) reasons.push("Inner diameter has to be greater than zero.");
  if (!(design.wallThicknessM > 0)) reasons.push("Wall thickness has to be greater than zero.");
  if (!(design.cylinderLengthM > 0)) {
    reasons.push("The barrel needs a tangent-to-tangent length greater than zero.");
  }
  if (design.innerDiameterM > 0 && design.wallThicknessM >= design.innerDiameterM / 2) {
    reasons.push("The wall is thicker than the inner radius, so this is not a tank shell.");
  }

  if (material.class === "quasi_isotropic_laminate") {
    if (design.forming !== "laid_up") reasons.push("IM7/8552 is laid up and cured. It is not rolled or spun.");
    if (design.weldProcess !== "none") reasons.push("IM7/8552 is not welded. Leave the weld process as none.");
    if (design.heatTreatment !== "autoclave_m_cure") {
      reasons.push("The only qualified cure on this card is the NCAMP autoclave M-cure.");
    }
  } else {
    if (design.forming === "laid_up") reasons.push("Laid-up forming is the composite route.");
    if (design.heatTreatment === "autoclave_m_cure") reasons.push("Autoclave M-cure is the composite route.");
    if (design.weldProcess === "none") reasons.push("A metal barrel in this shop is closed out with a weld. Pick TIG or friction stir.");
    if (design.forming === "rolled_welded" && design.cylinderLengthM <= 0) {
      reasons.push("Rolled-and-welded needs a barrel length.");
    }
  }

  const weld = weldCard(design.materialId, design.weldProcess);
  if (!weld.allowed && weld.rejection) reasons.push(weld.rejection);

  if (design.heatTreatment === "stress_relief" && material.class === "isotropic_metal") {
    warnings.push("Stress relief does not change the strength card. No measured shift is on file for this cycle.");
  }
  if (design.heatTreatment === "solution_treat_and_age" && material.id !== "ti6al4v") {
    warnings.push(
      "Solution treat and age only changes the strength card for Ti-6Al-4V. 2219-T87 in particular includes a stretch this tank cannot repeat, and that temper is not on the card. Strength stays on the received temper.",
    );
  }
  if (design.heatTreatment === "solution_treat_and_age" && material.id === "ti6al4v") {
    warnings.push("Solution treat and age switches Ti-6Al-4V from typical annealed plate to typical aged sheet. They are different product forms on the TIMET table.");
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, warnings };
}

export function assessTank(design: TankDesign, conditions: AssessmentConditions): AssessmentResult {
  if (!(conditions.pressurePa >= 0)) {
    return { ok: false, reasons: ["Pressure cannot be negative."] };
  }
  if (!(conditions.meopPa > 0)) {
    return { ok: false, reasons: ["Operating pressure has to be greater than zero."] };
  }
  if (!Number.isFinite(conditions.temperatureK)) {
    return { ok: false, reasons: ["Temperature has to be a finite kelvin value."] };
  }

  const validation = validateDesign(design);
  if (!validation.ok) return validation;

  const material = getMaterial(design.materialId);
  const builtRadius = design.innerDiameterM / 2;
  const contraction = thermalContraction(material, conditions.temperatureK);
  const radius = builtRadius * contraction.radiusScale;
  const thickness = design.wallThicknessM * contraction.thicknessScale;
  const strength = strengthAt(material, design.heatTreatment, conditions.temperatureK);
  const weld = weldCard(design.materialId, design.weldProcess);
  const requirements = requiredPressures(conditions.meopPa);
  const radiusOverThickness = radius / thickness;

  const stations = buildStations(design, material, weld, radius, thickness, conditions.pressurePa, strength);
  const governingYield = pickGoverning(stations, "yield");
  const governingBurst = pickGoverning(stations, "ultimate");

  const notes: string[] = [...validation.warnings];
  const blocking: string[] = [];

  if (strength.coverage === "clamped") {
    blocking.push(strength.note ?? "Strength is outside the measured temperature range.");
  } else if (strength.note) {
    notes.push(strength.note);
  }
  if (strength.coverage === "measured" && material.strengthBasis) {
    notes.push(material.strengthBasis);
  }

  pushWeldNotes(design, weld, conditions.temperatureK, notes, blocking);

  if (contraction.note) notes.push(contraction.note);
  if (material.ctePerK.assumption) notes.push(material.ctePerK.assumption);
  if (material.poissonsRatio.assumption) notes.push(material.poissonsRatio.assumption);
  if (material.youngsModulusPa.assumption) notes.push(material.youngsModulusPa.assumption);
  if (material.conductivityWPerMK.assumption) notes.push(material.conductivityWPerMK.assumption);
  if (material.class === "isotropic_metal") {
    notes.push("Elastic modulus is the room-temperature value at every test temperature, so the strain is only as good as that.");
  }
  if (
    material.maxServiceTemperatureK.value !== null &&
    conditions.temperatureK > material.maxServiceTemperatureK.value
  ) {
    notes.push("Test temperature is above the stated maximum service temperature on this card.");
  }

  if (radiusOverThickness < THIN_WALL_MIN_RADIUS_OVER_THICKNESS) {
    blocking.push(
      `Inner radius over thickness is ${radiusOverThickness.toFixed(1)}, under the thin-wall limit of ${THIN_WALL_MIN_RADIUS_OVER_THICKNESS}. Membrane stress is indicative. The Lamé inner-fiber hoop is about ${((lameHoopOverThin(radius, thickness) - 1) * 100).toFixed(1)}% higher.`,
    );
  }

  for (const station of stations) {
    if (!station.qualified) {
      for (const note of station.notes) {
        if (!blocking.includes(note)) blocking.push(note);
      }
    }
  }

  const proofComparedTo = strength.yieldPa === null ? "ultimate" : "yield";
  const indicativeYieldPressurePa = governingYield?.yieldPressurePa ?? null;
  const indicativeBurstPressurePa = governingBurst?.burstPressurePa ?? null;
  const signable = blocking.length === 0;
  const predictedYieldPressurePa = signable ? indicativeYieldPressurePa : null;
  const predictedBurstPressurePa = signable ? indicativeBurstPressurePa : null;
  const yieldMargin =
    predictedYieldPressurePa === null ? null : predictedYieldPressurePa / requirements.proofPressurePa - 1;
  const proofMargin =
    proofComparedTo === "yield"
      ? yieldMargin
      : predictedBurstPressurePa === null
        ? null
        : predictedBurstPressurePa / requirements.proofPressurePa - 1;
  const burstMargin =
    predictedBurstPressurePa === null ? null : predictedBurstPressurePa / requirements.burstPressurePa - 1;

  const failedProof = proofMargin !== null && proofMargin < 0;
  const failedBurst = burstMargin !== null && burstMargin < 0;
  let disposition: Disposition;
  if (blocking.length > 0) disposition = "not_qualified";
  else if (failedProof || failedBurst) disposition = "fail";
  else if (notes.length > 0) disposition = "pass_with_notes";
  else disposition = "pass";

  const { headline, reason } = describeResult({
    disposition,
    failedProof,
    failedBurst,
    proofComparedTo,
    governingYield,
    governingBurst,
    predictedYieldPressurePa,
    predictedBurstPressurePa,
    indicativeYieldPressurePa,
    indicativeBurstPressurePa,
    proofPressurePa: requirements.proofPressurePa,
    requiredBurstPressurePa: requirements.burstPressurePa,
    proofMargin,
    burstMargin,
    blocking,
  });

  const young = material.youngsModulusPa.value;
  const poisson = material.poissonsRatio.value;
  const cylinder = cylinderMembrane(conditions.pressurePa, radius, thickness);
  const elastic = young && poisson !== null ? elasticStrains(cylinder, young, poisson) : null;

  const massKg = material.densityKgPerM3.value === null ? 0 : material.densityKgPerM3.value * tankMaterialVolume(design);
  const materialCostUsd = massKg * material.planningUsdPerKg;
  const processCost = processCostUsd(design);

  return {
    ok: true,
    design,
    temperatureK: conditions.temperatureK,
    pressurePa: conditions.pressurePa,
    meopPa: conditions.meopPa,
    strengthCoverage: strength.coverage,
    strength: {
      yieldPa: strength.yieldPa,
      ultimateTensilePa: strength.ultimateTensilePa,
      ultimateCompressivePa: strength.ultimateCompressivePa,
    },
    stations,
    governingYield,
    governingBurst,
    predictedYieldPressurePa,
    predictedBurstPressurePa,
    indicativeYieldPressurePa,
    indicativeBurstPressurePa,
    proofPressurePa: requirements.proofPressurePa,
    requiredBurstPressurePa: requirements.burstPressurePa,
    yieldMargin,
    proofComparedTo,
    proofMargin,
    burstMargin,
    disposition,
    headline,
    reason,
    notes,
    blocking,
    massKg,
    materialCostUsd,
    processCostUsd: processCost,
    totalCostUsd: materialCostUsd + processCost,
    innerRadiusM: builtRadius,
    contractedInnerRadiusM: radius,
    contractedThicknessM: thickness,
    thermalStrain: contraction.strain,
    overallLengthM: design.cylinderLengthM + 2 * domeHeightM(builtRadius, design.dome),
    thinWallRadiusOverThickness: radiusOverThickness,
    lameHoopOverThin: lameHoopOverThin(radius, thickness),
    elasticHoopStrain: elastic?.hoop ?? null,
    elasticAxialStrain: elastic?.axial ?? null,
  };
}

function elasticStrains(stress: MembraneStress, youngPa: number, poisson: number): { hoop: number; axial: number } {
  return {
    hoop: (stress.hoopPa - poisson * stress.meridionalPa) / youngPa,
    axial: (stress.meridionalPa - poisson * stress.hoopPa) / youngPa,
  };
}

interface StrengthUse {
  yieldPa: number | null;
  ultimateTensilePa: number;
  ultimateCompressivePa: number | null;
}

function buildStations(
  design: TankDesign,
  material: Material,
  weld: WeldCard,
  radiusM: number,
  thicknessM: number,
  pressurePa: number,
  strength: StrengthUse,
): StationReport[] {
  const stations: StationReport[] = [];
  const cylinderAtPressure = cylinderMembrane(pressurePa, radiusM, thicknessM);
  const cylinderPerPa = cylinderMembrane(1, radiusM, thicknessM);

  if (design.cylinderLengthM > 0) {
    stations.push(
      evaluateStation({
        id: "cylinder_membrane",
        label: "cylinder membrane",
        design,
        material,
        weld,
        strength,
        stress: cylinderAtPressure,
        perPa: cylinderPerPa,
        transverse: false,
      }),
    );
  }

  if (design.forming === "rolled_welded") {
    stations.push(
      evaluateStation({
        id: "longitudinal_weld",
        label: `HAZ at longitudinal ${weldProcessName(design.weldProcess)} weld`,
        design,
        material,
        weld,
        strength,
        stress: cylinderAtPressure,
        perPa: cylinderPerPa,
        transverse: "hoop",
      }),
    );
  }

  if (design.weldProcess !== "none") {
    stations.push(
      evaluateStation({
        id: "girth_weld",
        label: `HAZ at girth ${weldProcessName(design.weldProcess)} weld`,
        design,
        material,
        weld,
        strength,
        stress: cylinderAtPressure,
        perPa: cylinderPerPa,
        transverse: "meridional",
      }),
    );
  }

  const apexAtPressure = domeMembrane(design.dome, "apex", pressurePa, radiusM, thicknessM);
  const apexPerPa = domeMembrane(design.dome, "apex", 1, radiusM, thicknessM);
  stations.push(
    evaluateStation({
      id: "dome_apex",
      label: design.dome === "hemispherical" ? "hemispherical dome membrane" : "elliptical dome crown",
      design,
      material,
      weld,
      strength,
      stress: apexAtPressure,
      perPa: apexPerPa,
      transverse: false,
    }),
  );

  if (design.dome === "elliptical_2to1") {
    stations.push(
      evaluateStation({
        id: "dome_knuckle",
        label: "elliptical dome knuckle",
        design,
        material,
        weld,
        strength,
        stress: domeMembrane(design.dome, "knuckle", pressurePa, radiusM, thicknessM),
        perPa: domeMembrane(design.dome, "knuckle", 1, radiusM, thicknessM),
        transverse: false,
      }),
    );
  }

  return stations;
}

function weldProcessName(process: WeldProcess): string {
  switch (process) {
    case "tig":
      return "TIG";
    case "fsw":
      return "friction-stir";
    case "none":
      return "unwelded";
    default:
      return assertNever(process);
  }
}

interface StationInput {
  id: StationId;
  label: string;
  design: TankDesign;
  material: Material;
  weld: WeldCard;
  strength: StrengthUse;
  stress: MembraneStress;
  perPa: MembraneStress;
  transverse: false | "hoop" | "meridional";
}

function evaluateStation(input: StationInput): StationReport {
  const notes: string[] = [];
  let qualified = true;
  const parentYield = input.strength.yieldPa;
  const parentUltimate = input.strength.ultimateTensilePa;
  const parentCompression = input.strength.ultimateCompressivePa;

  let hoopYieldAllow = parentYield;
  let meridionalYieldAllow = parentYield;
  let hoopUltimateAllow = parentUltimate;
  let meridionalUltimateAllow = parentUltimate;

  if (input.transverse !== false) {
    const ultimateRetention = transverseUltimateRetention(input.weld);
    const yieldRetention = transverseYieldRetention(input.weld);
    if (ultimateRetention === null || (parentYield !== null && yieldRetention.retention === null)) {
      qualified = false;
      notes.push(input.weld.note);
    } else {
      const parallel = input.weld.parallelRetention;
      const transverseYield = (yieldRetention.retention ?? 1) * (parentYield ?? parentUltimate);
      const transverseUltimate = ultimateRetention * parentUltimate;
      if (input.transverse === "hoop") {
        hoopYieldAllow = transverseYield;
        hoopUltimateAllow = transverseUltimate;
        meridionalYieldAllow = parentYield === null ? null : parentYield * parallel;
        meridionalUltimateAllow = parentUltimate * parallel;
      } else {
        meridionalYieldAllow = transverseYield;
        meridionalUltimateAllow = transverseUltimate;
        hoopYieldAllow = parentYield === null ? null : parentYield * parallel;
        hoopUltimateAllow = parentUltimate * parallel;
      }
      if (yieldRetention.assumed) {
        notes.push(
          `Yield retention is assumed equal to the ultimate retention of ${ultimateRetention.toFixed(3)}. The coupon did not report yield.`,
        );
      }
      if (input.weld.parallelRetention === 1) {
        notes.push("Strength parallel to the weld is left at the parent value. A real HAZ is softer in that direction too.");
      }
      if (input.weld.sourceId === "assumption-ss304l-weld") {
        notes.push(input.weld.note);
      }
    }
  }

  const criterion = input.material.class === "quasi_isotropic_laminate" ? "max_principal" : "von_mises";
  let yieldUtilization: number | null = null;
  let ultimateUtilization: number | null = null;
  let yieldPressurePa: number | null = null;
  let burstPressurePa: number | null = null;

  if (criterion === "von_mises") {
    if (qualified && parentYield !== null && hoopYieldAllow !== null && meridionalYieldAllow !== null) {
      const atOne = metalUtilization(input.perPa.hoopPa, input.perPa.meridionalPa, hoopYieldAllow, meridionalYieldAllow);
      yieldUtilization = metalUtilization(input.stress.hoopPa, input.stress.meridionalPa, hoopYieldAllow, meridionalYieldAllow);
      yieldPressurePa = atOne > 0 ? 1 / atOne : null;
    }
    if (qualified && hoopUltimateAllow > 0 && meridionalUltimateAllow > 0) {
      const atOne = metalUtilization(
        input.perPa.hoopPa,
        input.perPa.meridionalPa,
        hoopUltimateAllow,
        meridionalUltimateAllow,
      );
      ultimateUtilization = metalUtilization(
        input.stress.hoopPa,
        input.stress.meridionalPa,
        hoopUltimateAllow,
        meridionalUltimateAllow,
      );
      burstPressurePa = atOne > 0 ? 1 / atOne : null;
    }
  } else {
    const live = laminateUtilization(
      input.stress.hoopPa,
      input.stress.meridionalPa,
      parentUltimate,
      parentCompression,
    );
    const perPa = laminateUtilization(input.perPa.hoopPa, input.perPa.meridionalPa, parentUltimate, parentCompression);
    if (live === null || perPa === null) {
      qualified = false;
      notes.push("A compressive membrane stress is present and this laminate has no compression strength at this temperature.");
      ultimateUtilization = null;
      burstPressurePa = null;
    } else {
      ultimateUtilization = live;
      burstPressurePa = perPa > 0 ? 1 / perPa : null;
    }
  }

  if (input.material.class === "quasi_isotropic_laminate") {
    notes.push("Failure is maximum principal stress against the unnotched tension and compression means. von Mises is reported and does not govern.");
  }

  return {
    id: input.id,
    label: input.label,
    stress: input.stress,
    membranePerPa: input.perPa,
    criterion,
    yieldUtilization,
    ultimateUtilization,
    yieldPressurePa,
    burstPressurePa,
    qualified,
    notes,
  };
}

function pickGoverning(stations: StationReport[], mode: FailureMode): StationReport | null {
  let best: StationReport | null = null;
  let bestPressure = Number.POSITIVE_INFINITY;
  for (const station of stations) {
    const pressure = mode === "yield" ? station.yieldPressurePa : station.burstPressurePa;
    if (pressure === null || !station.qualified) continue;
    if (pressure < bestPressure) {
      best = station;
      bestPressure = pressure;
    }
  }
  return best;
}

function pushWeldNotes(
  design: TankDesign,
  weld: WeldCard,
  temperatureK: number,
  notes: string[],
  blocking: string[],
): void {
  if (design.weldProcess === "none") return;
  if (weld.hazUltimateKnockdown === null) {
    blocking.push(weld.note);
    return;
  }
  notes.push(weld.note);
  notes.push(
    "The weld ratio was measured near room temperature and is applied at every test temperature. Parent and HAZ do not strengthen by the same factor.",
  );
  if (Math.abs(temperatureK - 293.15) > 30) {
    notes.push(`Test temperature is ${temperatureK.toFixed(1)} K, away from the room-temperature coupon.`);
  }
}

interface DescribeInput {
  disposition: Disposition;
  failedProof: boolean;
  failedBurst: boolean;
  proofComparedTo: "yield" | "ultimate";
  governingYield: StationReport | null;
  governingBurst: StationReport | null;
  predictedYieldPressurePa: number | null;
  predictedBurstPressurePa: number | null;
  indicativeYieldPressurePa: number | null;
  indicativeBurstPressurePa: number | null;
  proofPressurePa: number;
  requiredBurstPressurePa: number;
  proofMargin: number | null;
  burstMargin: number | null;
  blocking: string[];
}

function describeResult(input: DescribeInput): { headline: string; reason: string } {
  if (input.disposition === "not_qualified") {
    const indicative = indicativeSentence(input);
    return {
      headline: "Not a signable test.",
      reason: [input.blocking[0] ?? "A required measurement is missing.", indicative].filter(Boolean).join(" "),
    };
  }

  if (input.failedProof && input.proofComparedTo === "yield" && input.governingYield && input.predictedYieldPressurePa !== null) {
    return {
      headline: `${input.governingYield.label} exceeded yield at ${formatPsi(input.predictedYieldPressurePa)}.`,
      reason: mechanismSentence(input.governingYield, "yield", input.predictedYieldPressurePa, input.proofPressurePa, input.proofMargin, "proof"),
    };
  }

  if (input.failedProof && input.proofComparedTo === "ultimate" && input.governingBurst && input.predictedBurstPressurePa !== null) {
    return {
      headline: `${input.governingBurst.label} reached ultimate at ${formatPsi(input.predictedBurstPressurePa)}.`,
      reason: mechanismSentence(input.governingBurst, "ultimate", input.predictedBurstPressurePa, input.proofPressurePa, input.proofMargin, "proof"),
    };
  }

  if (input.failedBurst && input.governingBurst && input.predictedBurstPressurePa !== null) {
    return {
      headline: `${input.governingBurst.label} reached ultimate at ${formatPsi(input.predictedBurstPressurePa)}.`,
      reason: mechanismSentence(
        input.governingBurst,
        "ultimate",
        input.predictedBurstPressurePa,
        input.requiredBurstPressurePa,
        input.burstMargin,
        "burst",
      ),
    };
  }

  if (input.governingBurst && input.predictedBurstPressurePa !== null && input.burstMargin !== null) {
    const proofClause =
      input.proofComparedTo === "yield" && input.predictedYieldPressurePa !== null && input.proofMargin !== null
        ? `Yield holds with ${formatMargin(input.proofMargin)} versus the proof pressure of ${formatPsi(input.proofPressurePa)}.`
        : `Proof holds with ${formatMargin(input.proofMargin ?? 0)} versus ${formatPsi(input.proofPressurePa)}.`;
    return {
      headline: `Margins hold. Burst is governed by the ${input.governingBurst.label} at ${formatPsi(input.predictedBurstPressurePa)}.`,
      reason: `${proofClause} ${mechanismSentence(input.governingBurst, "ultimate", input.predictedBurstPressurePa, input.requiredBurstPressurePa, input.burstMargin, "burst")}`,
    };
  }

  return {
    headline: "No governing station.",
    reason: "The tank did not produce a burst pressure.",
  };
}

function indicativeSentence(input: DescribeInput): string {
  if (input.governingBurst && input.indicativeBurstPressurePa !== null) {
    return `The lowest station that does have a number is the ${input.governingBurst.label} at ${formatPsi(input.indicativeBurstPressurePa)}. That number is not a signature.`;
  }
  if (input.governingYield && input.indicativeYieldPressurePa !== null) {
    return `The indicative yield station is the ${input.governingYield.label} at ${formatPsi(input.indicativeYieldPressurePa)}.`;
  }
  return "";
}

function mechanismSentence(
  station: StationReport,
  mode: FailureMode,
  predictedPa: number,
  requiredPa: number,
  margin: number | null,
  requirement: "proof" | "burst",
): string {
  const requirementName = requirement === "proof" ? `${PROOF_FACTOR}×MEOP proof` : `${BURST_FACTOR}×MEOP burst`;
  const marginText = margin === null ? "" : ` Margin versus the ${requirementName} requirement of ${formatPsi(requiredPa)} is ${formatMargin(margin)}.`;
  const hoop = station.membranePerPa.hoopPa * predictedPa;
  const meridional = station.membranePerPa.meridionalPa * predictedPa;
  if (station.criterion === "von_mises") {
    const which = mode === "yield" ? "yield" : "ultimate";
    const vm = vonMises(hoop, meridional, 0);
    return `Von Mises stress in the ${station.label} reached the directional ${which} allowable at ${formatPsi(predictedPa)} (${formatMpa(vm)} von Mises at that pressure, hoop ${formatMpa(hoop)}, meridional ${formatMpa(meridional)}).${marginText}`;
  }
  const compression = Math.min(hoop, meridional) < 0 && Math.abs(Math.min(hoop, meridional)) >= Math.max(hoop, meridional, 0);
  const side = compression
    ? `compressive principal ${formatMpa(Math.abs(Math.min(hoop, meridional)))}`
    : `tensile principal ${formatMpa(Math.max(hoop, meridional))}`;
  return `Maximum-principal check: ${side} reached the quasi-isotropic unnotched allowable at ${formatPsi(predictedPa)}.${marginText}`;
}

function formatMargin(margin: number): string {
  const percent = Math.abs(margin * 100).toFixed(1);
  return margin < 0 ? `${percent}% under` : `${percent}% over`;
}

/** Live status at the current pressure, for a gauge that is moving. */
export function liveStatus(result: Extract<AssessmentResult, { ok: true }>): "elastic" | "yielded" | "burst" | "not_qualified" {
  if (result.disposition === "not_qualified" && result.predictedBurstPressurePa === null && result.predictedYieldPressurePa === null) {
    return "not_qualified";
  }
  if (result.predictedBurstPressurePa !== null && result.pressurePa >= result.predictedBurstPressurePa - 1) {
    return "burst";
  }
  if (result.predictedYieldPressurePa !== null && result.pressurePa >= result.predictedYieldPressurePa - 1) {
    return "yielded";
  }
  if (result.disposition === "not_qualified") return "not_qualified";
  return "elastic";
}
