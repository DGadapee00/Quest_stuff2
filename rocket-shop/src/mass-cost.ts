import type { DomeType, FormingMethod, HeatTreatment, TankDesign, WeldProcess } from "./types.js";
import { assertNever } from "./types.js";

/** Curved surface area of a full oblate spheroid, equatorial radius a, polar radius b, a ≥ b. */
export function oblateSpheroidArea(equatorialRadiusM: number, polarRadiusM: number): number {
  const a = equatorialRadiusM;
  const b = polarRadiusM;
  if (b > a) {
    throw new Error("Oblate area expects the equatorial radius to be the larger one.");
  }
  const e = Math.sqrt(1 - (b * b) / (a * a));
  if (e < 1e-6) {
    return 4 * Math.PI * a * a;
  }
  const atanh = 0.5 * Math.log((1 + e) / (1 - e));
  return 2 * Math.PI * a * a * (1 + ((1 - e * e) / e) * atanh);
}

export function cylinderMaterialVolume(innerRadiusM: number, thicknessM: number, lengthM: number): number {
  const outer = innerRadiusM + thicknessM;
  return Math.PI * (outer * outer - innerRadiusM * innerRadiusM) * lengthM;
}

/** One hemispherical dome, exact spherical shell, flat face excluded. */
export function hemisphereMaterialVolume(innerRadiusM: number, thicknessM: number): number {
  const outer = innerRadiusM + thicknessM;
  return (2 / 3) * Math.PI * (outer ** 3 - innerRadiusM ** 3);
}

/**
 * One 2:1 dome. The mid-wall is treated as an ellipse with both semi-axes
 * grown by t/2 (an axis offset, not a true normal offset), and the volume is
 * that curved area times t. Half of a full oblate spheroid is one head.
 */
export function ellipticalDomeMaterialVolume(innerRadiusM: number, thicknessM: number): number {
  const a = innerRadiusM + thicknessM / 2;
  const b = innerRadiusM / 2 + thicknessM / 2;
  return (oblateSpheroidArea(a, b) / 2) * thicknessM;
}

export function domeMaterialVolume(dome: DomeType, innerRadiusM: number, thicknessM: number): number {
  switch (dome) {
    case "hemispherical":
      return hemisphereMaterialVolume(innerRadiusM, thicknessM);
    case "elliptical_2to1":
      return ellipticalDomeMaterialVolume(innerRadiusM, thicknessM);
    default:
      return assertNever(dome);
  }
}

export function tankMaterialVolume(design: Pick<TankDesign, "innerDiameterM" | "cylinderLengthM" | "wallThicknessM" | "dome">): number {
  const radius = design.innerDiameterM / 2;
  const thickness = design.wallThicknessM;
  return (
    cylinderMaterialVolume(radius, thickness, design.cylinderLengthM) +
    2 * domeMaterialVolume(design.dome, radius, thickness)
  );
}

export interface WeldLengths {
  longitudinalM: number;
  girthM: number;
  totalM: number;
}

/** Weld length along the inner surface. One longitudinal seam, two girth seams. */
export function weldLengths(design: Pick<TankDesign, "innerDiameterM" | "cylinderLengthM" | "forming" | "weldProcess">): WeldLengths {
  const radius = design.innerDiameterM / 2;
  const girthCount = design.weldProcess === "none" ? 0 : 2;
  const longCount = design.forming === "rolled_welded" ? 1 : 0;
  const longitudinalM = longCount * design.cylinderLengthM;
  const girthM = girthCount * 2 * Math.PI * radius;
  return { longitudinalM, girthM, totalM: longitudinalM + girthM };
}

/** Planning dollars. Locked by tests. Not a quote. See source shop-planning-cost. */
export const WELD_USD_PER_M: Record<WeldProcess, number> = {
  none: 0,
  tig: 350,
  fsw: 900,
};

export const FORMING_USD: Record<FormingMethod, number> = {
  rolled_welded: 800,
  spun: 3500,
  laid_up: 4000,
};

export const HEAT_TREATMENT_USD: Record<HeatTreatment, number> = {
  as_received: 0,
  stress_relief: 600,
  solution_treat_and_age: 2200,
  autoclave_m_cure: 3500,
};

export function processCostUsd(design: TankDesign): number {
  const welds = weldLengths(design);
  const weldCost = welds.longitudinalM * WELD_USD_PER_M[design.weldProcess] + welds.girthM * WELD_USD_PER_M[design.weldProcess];
  return weldCost + FORMING_USD[design.forming] + HEAT_TREATMENT_USD[design.heatTreatment];
}
