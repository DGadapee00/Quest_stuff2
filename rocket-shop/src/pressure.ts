import type { DomeType, MembraneStress } from "./types.js";
import { assertNever } from "./types.js";

/**
 * von Mises equivalent stress. Tension is positive.
 * For a thin wall the third principal is taken as zero.
 */
export function vonMises(s1: number, s2: number, s3: number): number {
  const a = s1 - s2;
  const b = s2 - s3;
  const c = s3 - s1;
  return Math.sqrt(0.5 * (a * a + b * b + c * c));
}

export function principals(hoopPa: number, meridionalPa: number): { max: number; min: number } {
  return {
    max: Math.max(hoopPa, meridionalPa, 0),
    min: Math.min(hoopPa, meridionalPa, 0),
  };
}

export function membraneFromComponents(hoopPa: number, meridionalPa: number): MembraneStress {
  const ends = principals(hoopPa, meridionalPa);
  return {
    hoopPa,
    meridionalPa,
    vonMisesPa: vonMises(hoopPa, meridionalPa, 0),
    maxPrincipalPa: ends.max,
    minPrincipalPa: ends.min,
  };
}

/**
 * Closed thin cylinder, inner radius.
 * Hoop equilibrium: 2 σ_h t L = p (2 R) L, so σ_h = p R / t.
 * Axial equilibrium of the closed end: σ_a (2 π R t) = p (π R²), so σ_a = p R / (2 t).
 * Valid as a membrane result when R/t is large. The inner radius is the textbook choice.
 */
export function cylinderMembrane(pressurePa: number, innerRadiusM: number, thicknessM: number): MembraneStress {
  const hoop = (pressurePa * innerRadiusM) / thicknessM;
  return membraneFromComponents(hoop, hoop / 2);
}

/**
 * Hemispherical membrane. Both principals equal p R / (2 t).
 * This does not include the bending that appears where the hoop stress has to
 * meet the cylinder's hoop stress of p R / t.
 */
export function hemisphereMembrane(pressurePa: number, innerRadiusM: number, thicknessM: number): MembraneStress {
  const stress = (pressurePa * innerRadiusM) / (2 * thicknessM);
  return membraneFromComponents(stress, stress);
}

/**
 * 2:1 ellipsoidal head, a = R, b = R/2, membrane theory at the two stations
 * that can be written in closed form.
 *
 * Circumferential radius R_θ and meridional radius R_φ of an ellipse satisfy
 * R_θ = R_φ = a²/b at the crown and R_θ = a, R_φ = b²/a at the equator.
 * Membrane result used here: σ_φ = p R_θ / (2 t), σ_θ = σ_φ (2 − R_θ / R_φ).
 *
 * Crown: both stresses = p R / t.
 * Equator (knuckle): meridional = p R / (2 t), hoop = −p R / t.
 */
export function ellipticalCrownMembrane(
  pressurePa: number,
  innerRadiusM: number,
  thicknessM: number,
): MembraneStress {
  const stress = (pressurePa * innerRadiusM) / thicknessM;
  return membraneFromComponents(stress, stress);
}

export function ellipticalKnuckleMembrane(
  pressurePa: number,
  innerRadiusM: number,
  thicknessM: number,
): MembraneStress {
  const hoop = -(pressurePa * innerRadiusM) / thicknessM;
  const meridional = (pressurePa * innerRadiusM) / (2 * thicknessM);
  return membraneFromComponents(hoop, meridional);
}

export function domeMembrane(
  dome: DomeType,
  station: "apex" | "knuckle",
  pressurePa: number,
  innerRadiusM: number,
  thicknessM: number,
): MembraneStress {
  switch (dome) {
    case "hemispherical":
      return hemisphereMembrane(pressurePa, innerRadiusM, thicknessM);
    case "elliptical_2to1":
      switch (station) {
        case "apex":
          return ellipticalCrownMembrane(pressurePa, innerRadiusM, thicknessM);
        case "knuckle":
          return ellipticalKnuckleMembrane(pressurePa, innerRadiusM, thicknessM);
        default:
          return assertNever(station);
      }
    default:
      return assertNever(dome);
  }
}

/**
 * Lamé hoop at the inner fiber of a closed-or-open thick cylinder
 * (internal pressure only) divided by the thin-wall hoop p Ri / t.
 * Greater than 1: the thin-wall formula understates the inner-fiber hoop.
 */
export function lameHoopOverThin(innerRadiusM: number, thicknessM: number): number {
  const ri = innerRadiusM;
  const ro = innerRadiusM + thicknessM;
  const thick = (ro * ro + ri * ri) / (ro * ro - ri * ri);
  const thin = ri / thicknessM;
  return thick / thin;
}

export function domeHeightM(innerRadiusM: number, dome: DomeType): number {
  switch (dome) {
    case "hemispherical":
      return innerRadiusM;
    case "elliptical_2to1":
      return innerRadiusM / 2;
    default:
      return assertNever(dome);
  }
}

/**
 * Metal failure index. Stresses are divided by their directional allowables
 * and the von Mises of those ratios is the utilization.
 * When both allowables equal S, this is exactly σ_vm / S.
 */
export function metalUtilization(hoopPa: number, meridionalPa: number, hoopAllowPa: number, meridionalAllowPa: number): number {
  if (hoopAllowPa <= 0 || meridionalAllowPa <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return vonMises(hoopPa / hoopAllowPa, meridionalPa / meridionalAllowPa, 0);
}

/**
 * Quasi-isotropic laminate: each in-plane principal is checked against the
 * tension allowable or the compression allowable. von Mises is not the failure
 * check. Through-thickness stress is taken as zero and interlaminar strength
 * is not on the card.
 */
export function laminateUtilization(
  hoopPa: number,
  meridionalPa: number,
  tensileAllowPa: number,
  compressiveAllowPa: number | null,
): number | null {
  const demand = (stress: number): number | null => {
    if (stress >= 0) {
      return stress / tensileAllowPa;
    }
    if (compressiveAllowPa === null || compressiveAllowPa <= 0) {
      return null;
    }
    return -stress / compressiveAllowPa;
  };
  const hoop = demand(hoopPa);
  const meridional = demand(meridionalPa);
  if (hoop === null || meridional === null) {
    return null;
  }
  return Math.max(hoop, meridional);
}
