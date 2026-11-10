import { describe, expect, it } from "vitest";
import {
  cylinderMembrane,
  ellipticalCrownMembrane,
  ellipticalKnuckleMembrane,
  hemisphereMembrane,
  lameHoopOverThin,
  metalUtilization,
  oblateSpheroidArea,
  vonMises,
} from "../src/index.js";

function expectRelative(actual: number, expected: number, tolerance = 1e-12): void {
  const scale = Math.max(Math.abs(expected), 1e-30);
  expect(Math.abs(actual - expected) / scale).toBeLessThan(tolerance);
}

describe("thin-wall membrane stresses", () => {
  // Free body, closed cylinder, inner radius.
  // Hoop: 2 σ_h t = p (2 R) → σ_h = p R / t.
  // Axial: σ_a (2 π R t) = p (π R²) → σ_a = p R / (2 t).
  const pressure = 2e6;
  const radius = 0.5;
  const thickness = 0.01;

  it("matches the cylinder equilibrium result and von Mises", () => {
    const stress = cylinderMembrane(pressure, radius, thickness);
    expect(stress.hoopPa).toBe(100e6);
    expect(stress.meridionalPa).toBe(50e6);
    // sqrt(σh² − σh σa + σa²) = sqrt(0.75) σh
    const expectedVm = 100e6 * Math.sqrt(0.75);
    expectRelative(stress.vonMisesPa, expectedVm);
    expectRelative(vonMises(100e6, 50e6, 0), expectedVm);
  });

  it("gives a hemisphere half the cylinder hoop, and von Mises equal to that stress", () => {
    const stress = hemisphereMembrane(pressure, radius, thickness);
    expect(stress.hoopPa).toBe(50e6);
    expect(stress.meridionalPa).toBe(50e6);
    // σ1 = σ2, σ3 = 0 → σ_vm = σ1
    expectRelative(stress.vonMisesPa, 50e6);
  });

  it("gives the 2:1 crown and knuckle their closed-form membrane stresses", () => {
    // a = R, b = R/2.
    // Crown radii a²/b = 2R, so σ = p (2R) / (2t) = p R / t.
    const crown = ellipticalCrownMembrane(pressure, radius, thickness);
    expect(crown.hoopPa).toBe(100e6);
    expect(crown.meridionalPa).toBe(100e6);
    expectRelative(crown.vonMisesPa, 100e6);

    // Equator: Rθ = R, Rφ = b²/a = R/4.
    // σφ = p R / (2t), σθ = σφ (2 − R / (R/4)) = σφ (2 − 4) = −p R / t.
    const knuckle = ellipticalKnuckleMembrane(pressure, radius, thickness);
    expect(knuckle.hoopPa).toBe(-100e6);
    expect(knuckle.meridionalPa).toBe(50e6);
    // sqrt(σθ² − σθ σφ + σφ²) / (p R / t) = sqrt(1 + 0.5 + 0.25) = sqrt(1.75)
    expectRelative(knuckle.vonMisesPa, 100e6 * Math.sqrt(1.75));
  });

  it("reduces directional von Mises to σ_vm / S when both allowables match", () => {
    const stress = cylinderMembrane(pressure, radius, thickness);
    const allowable = 200e6;
    expectRelative(
      metalUtilization(stress.hoopPa, stress.meridionalPa, allowable, allowable),
      stress.vonMisesPa / allowable,
    );
  });
});

describe("thick-wall comparison and dome area", () => {
  it("puts the Lamé inner hoop 5.238% above the thin-wall hoop at R/t = 10", () => {
    // ri = 1, t = 0.1, ro = 1.1
    // σ_thick / σ_thin = (t/ri) (ro² + ri²) / (ro² − ri²) = 0.1 * 2.21 / 0.21
    const ratio = lameHoopOverThin(1, 0.1);
    expectRelative(ratio, 0.1 * (1.21 + 1) / (1.21 - 1));
    expectRelative(ratio, 1.052380952380952);
  });

  it("matches a hand evaluation of the oblate surface", () => {
    const a = 0.505;
    const b = 0.255;
    const e = Math.sqrt(1 - (b * b) / (a * a));
    const atanh = 0.5 * Math.log((1 + e) / (1 - e));
    const expected = 2 * Math.PI * a * a * (1 + ((1 - e * e) / e) * atanh);
    expectRelative(oblateSpheroidArea(a, b), expected);
    expectRelative(expected, 2.2203466011318334, 1e-12);
  });
});
