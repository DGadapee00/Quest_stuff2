import type { Material } from "./types.js";

export interface ThermalContraction {
  /** Circumferential (and, for an isotropic metal, through-thickness) strain from the reference temperature. */
  strain: number | null;
  radiusScale: number;
  thicknessScale: number;
  available: boolean;
  /** True when the coefficient is being used outside the temperature span it was measured on. */
  extrapolated: boolean;
  /** True when a single secant coefficient is applied somewhere other than its two endpoints. */
  secantApproximate: boolean;
  note: string | null;
}

const ENDPOINT_K = 1.5;

/**
 * Isotropic metals scale radius and thickness by the same factor, so R/t,
 * and therefore membrane stress at a given pressure, does not change.
 * The diameter still changes, and that change is what this returns.
 */
export function thermalContraction(material: Material, temperatureK: number): ThermalContraction {
  const alpha = material.ctePerK.value;
  const referenceK = material.cteReferenceK;
  if (alpha === null || referenceK === null) {
    return {
      strain: null,
      radiusScale: 1,
      thicknessScale: 1,
      available: false,
      extrapolated: false,
      secantApproximate: false,
      note: material.ctePerK.missingReason ?? "No coefficient of thermal expansion on this card.",
    };
  }

  const strain = alpha * (temperatureK - referenceK);
  const scale = 1 + strain;
  const secantEnd = material.cteSecantEndK;
  let extrapolated = false;
  let secantApproximate = false;
  let note: string | null = null;

  if (secantEnd !== null) {
    const atReference = Math.abs(temperatureK - referenceK) <= ENDPOINT_K;
    const atEnd = Math.abs(temperatureK - secantEnd) <= ENDPOINT_K;
    const low = Math.min(referenceK, secantEnd);
    const high = Math.max(referenceK, secantEnd);
    if (temperatureK < low - ENDPOINT_K || temperatureK > high + ENDPOINT_K) {
      extrapolated = true;
      note = "Secant coefficient applied outside the span it was measured on.";
    } else if (!atReference && !atEnd) {
      secantApproximate = true;
      note = "One secant coefficient is exact at its two endpoints. Between them it is only a linear stand-in.";
    }
  } else if (temperatureK < referenceK - ENDPOINT_K) {
    // Room-temperature mean coefficients (typically 20–100°C) overstate contraction at cryogenic temperature, where the true coefficient falls.
    extrapolated = true;
    note = "Room-temperature expansion coefficient used below its measured range. Cryogenic contraction is overstated. Radius and thickness still scale together, so the stress at a given pressure does not change.";
  }

  return {
    strain,
    radiusScale: scale,
    thicknessScale: scale,
    available: true,
    extrapolated,
    secantApproximate,
    note,
  };
}
