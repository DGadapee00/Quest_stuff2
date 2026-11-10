import { al2195StrengthPa } from "./materials.js";
import type { HeatTreatment, Material, StrengthAnchor, StrengthCoverage } from "./types.js";

export interface StrengthSample {
  yieldPa: number | null;
  ultimateTensilePa: number;
  ultimateCompressivePa: number | null;
  coverage: StrengthCoverage;
  note: string | null;
}

/** Snap a test temperature onto a published anchor when it is this close. */
export const ANCHOR_SNAP_K = 1.5;

export function strengthAt(material: Material, heatTreatment: HeatTreatment, temperatureK: number): StrengthSample {
  if (material.strengthInterpolation === "al2195_niu_2023") {
    return al2195At(temperatureK);
  }
  const anchors = heatTreatment === "solution_treat_and_age" && material.staAnchors ? material.staAnchors : material.anchors;
  return interpolateAnchors(anchors, temperatureK);
}

function al2195At(temperatureK: number): StrengthSample {
  if (temperatureK < 20 - ANCHOR_SNAP_K || temperatureK > 298 + ANCHOR_SNAP_K) {
    const clampedK = temperatureK < 20 ? 20 : 298;
    const clamped = al2195StrengthPa(clampedK);
    return {
      yieldPa: clamped.yieldPa,
      ultimateTensilePa: clamped.ultimatePa,
      ultimateCompressivePa: null,
      coverage: "clamped",
      note: `2195 strength is only reconstructed from 20 K to 298 K. ${temperatureK.toFixed(1)} K is outside that span, so the nearest end is used and the result is not signable.`,
    };
  }
  const atEndpoint = Math.abs(temperatureK - 20) <= ANCHOR_SNAP_K || Math.abs(temperatureK - 298) <= ANCHOR_SNAP_K;
  const temperature = Math.abs(temperatureK - 20) <= ANCHOR_SNAP_K ? 20 : Math.abs(temperatureK - 298) <= ANCHOR_SNAP_K ? 298 : temperatureK;
  const strength = al2195StrengthPa(temperature);
  return {
    yieldPa: strength.yieldPa,
    ultimateTensilePa: strength.ultimatePa,
    ultimateCompressivePa: null,
    coverage: atEndpoint ? "measured" : "reconstructed",
    note: atEndpoint
      ? null
      : "Between the measured 298 K and 20 K endpoints, yield is linear and the ultimate–yield gap follows the paper’s description. This is a reconstruction, not a test at this temperature.",
  };
}

export function interpolateAnchors(anchors: StrengthAnchor[], temperatureK: number): StrengthSample {
  const sorted = [...anchors].sort((a, b) => a.temperatureK - b.temperatureK);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) {
    throw new Error("Material strength card has no anchors.");
  }

  for (const anchor of sorted) {
    if (Math.abs(anchor.temperatureK - temperatureK) <= ANCHOR_SNAP_K) {
      return {
        yieldPa: anchor.yieldPa,
        ultimateTensilePa: anchor.ultimateTensilePa,
        ultimateCompressivePa: anchor.ultimateCompressivePa,
        coverage: "measured",
        note: null,
      };
    }
  }

  if (temperatureK < first.temperatureK || temperatureK > last.temperatureK) {
    const clamped = temperatureK < first.temperatureK ? first : last;
    return {
      yieldPa: clamped.yieldPa,
      ultimateTensilePa: clamped.ultimateTensilePa,
      ultimateCompressivePa: clamped.ultimateCompressivePa,
      coverage: "clamped",
      note: `No strength measurement covers ${temperatureK.toFixed(1)} K. The nearest anchor at ${clamped.temperatureK.toFixed(1)} K is used, and the result is not signable at this temperature.`,
    };
  }

  let lower = first;
  let upper = last;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (left && right && temperatureK >= left.temperatureK && temperatureK <= right.temperatureK) {
      lower = left;
      upper = right;
      break;
    }
  }

  const span = upper.temperatureK - lower.temperatureK;
  const fraction = span === 0 ? 0 : (temperatureK - lower.temperatureK) / span;
  return {
    yieldPa: lerpNullable(lower.yieldPa, upper.yieldPa, fraction),
    ultimateTensilePa: lerp(lower.ultimateTensilePa, upper.ultimateTensilePa, fraction),
    ultimateCompressivePa: lerpNullable(lower.ultimateCompressivePa, upper.ultimateCompressivePa, fraction),
    coverage: "interpolated",
    note: `Strength is linearly interpolated between ${lower.temperatureK.toFixed(1)} K and ${upper.temperatureK.toFixed(1)} K.`,
  };
}

function lerp(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}

function lerpNullable(a: number | null, b: number | null, fraction: number): number | null {
  if (a === null || b === null) {
    return null;
  }
  return lerp(a, b, fraction);
}
