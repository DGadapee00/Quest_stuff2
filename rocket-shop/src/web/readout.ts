import { processCostUsd, tankMaterialVolume } from "../mass-cost.js";
import { getMaterial } from "../materials.js";
import { domeHeightM } from "../pressure.js";
import { assessTank } from "../tank.js";
import type { TankAssessment, TankDesign } from "../types.js";
import { formatKg, formatPsi, formatUsd } from "../units.js";

/** Shop-floor temperature for the builder. The test stand picks the propellant temperature. */
export const SHOP_AMBIENT_K = 293.15;

/**
 * MEOP is required by the assessor and only affects margins.
 * The bay shows yield and burst pressures, which do not depend on it.
 */
const READOUT_MEOP_PA = 1e6;

export type ShopStamp = "signable" | "not_signable" | "rejected";

export interface BuilderReadout {
  drawable: boolean;
  stamp: ShopStamp;
  headline: string;
  detail: string;
  reasons: string[];
  massLabel: string;
  materialCostLabel: string;
  processCostLabel: string;
  totalCostLabel: string;
  lengthLabel: string;
  yieldLabel: string;
  burstLabel: string;
}

export function designIsDrawable(design: TankDesign): boolean {
  return (
    design.innerDiameterM > 0 &&
    design.cylinderLengthM > 0 &&
    design.wallThicknessM > 0 &&
    design.wallThicknessM < design.innerDiameterM / 2
  );
}

export function builderReadout(design: TankDesign): BuilderReadout {
  const drawable = designIsDrawable(design);
  if (!drawable) {
    return blank("rejected", "These dimensions are not a tank shell.", "Diameter, barrel length, and wall thickness have to describe a thin shell.", []);
  }

  const result = assessTank(design, {
    temperatureK: SHOP_AMBIENT_K,
    pressurePa: 0,
    meopPa: READOUT_MEOP_PA,
  });

  const lengthLabel = `${(design.cylinderLengthM + 2 * domeHeightM(design.innerDiameterM / 2, design.dome)).toFixed(2)} m`;

  if (!result.ok) {
    return {
      ...blank("rejected", result.reasons[0] ?? "This route is not on the card.", result.reasons.join(" "), result.reasons),
      ...costLabels(design),
      lengthLabel,
      drawable: true,
    };
  }

  const figures = figuresFromAssessment(result);

  const yieldLabel = result.predictedYieldPressurePa === null ? "No yield on this card" : formatPsi(result.predictedYieldPressurePa);
  const signable = result.predictedBurstPressurePa !== null && result.disposition !== "not_qualified";

  if (!signable) {
    return {
      drawable: true,
      stamp: "not_signable",
      headline: "Not a signable test.",
      detail: result.reason,
      reasons: result.blocking,
      ...figures,
      yieldLabel: result.indicativeYieldPressurePa === null ? "—" : `${formatPsi(result.indicativeYieldPressurePa)} indicative`,
      burstLabel: "Not signable",
    };
  }

  const burstLabel = formatPsi(result.predictedBurstPressurePa ?? 0);
  const burstWhere = result.governingBurst?.label ?? "governing station";
  const yieldSentence =
    result.predictedYieldPressurePa === null
      ? "This card has no yield strength."
      : `Yield is ${formatPsi(result.predictedYieldPressurePa)} at the ${result.governingYield?.label ?? "governing station"}.`;
  return {
    drawable: true,
    stamp: "signable",
    headline: `The ${burstWhere} reaches ultimate at ${burstLabel}.`,
    detail: `${yieldSentence} Shop ambient is 293 K. The test stand sets the propellant and the operating pressure.`,
    reasons: [],
    ...figures,
    yieldLabel,
    burstLabel,
  };
}

function figuresFromAssessment(
  result: TankAssessment,
): Pick<BuilderReadout, "massLabel" | "materialCostLabel" | "processCostLabel" | "totalCostLabel" | "lengthLabel"> {
  return {
    massLabel: formatKg(result.massKg),
    materialCostLabel: formatUsd(result.materialCostUsd),
    processCostLabel: formatUsd(result.processCostUsd),
    totalCostLabel: formatUsd(result.totalCostUsd),
    lengthLabel: `${result.overallLengthM.toFixed(2)} m`,
  };
}

function costLabels(design: TankDesign): Pick<BuilderReadout, "massLabel" | "materialCostLabel" | "processCostLabel" | "totalCostLabel"> {
  const material = getMaterial(design.materialId);
  const density = material.densityKgPerM3.value;
  const massKg = density === null ? 0 : density * tankMaterialVolume(design);
  const materialCost = massKg * material.planningUsdPerKg;
  const processCost = processCostUsd(design);
  return {
    massLabel: formatKg(massKg),
    materialCostLabel: formatUsd(materialCost),
    processCostLabel: formatUsd(processCost),
    totalCostLabel: formatUsd(materialCost + processCost),
  };
}

function blank(stamp: ShopStamp, headline: string, detail: string, reasons: string[]): BuilderReadout {
  return {
    drawable: false,
    stamp,
    headline,
    detail,
    reasons,
    massLabel: "—",
    materialCostLabel: "—",
    processCostLabel: "—",
    totalCostLabel: "—",
    lengthLabel: "—",
    yieldLabel: "—",
    burstLabel: "—",
  };
}
