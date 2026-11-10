import { describe, expect, it } from "vitest";
import {
  PA_PER_PSI,
  PROPELLANTS,
  assessTank,
  cylinderMaterialVolume,
  fahrenheitToKelvin,
  formatPsi,
  hemisphereMaterialVolume,
  ksiToPa,
  requiredPressures,
  tankMaterialVolume,
  weldCard,
  weldLengths,
} from "../src/index.js";
import type { AssessmentResult, TankAssessment, TankDesign } from "../src/index.js";

function expectRelative(actual: number, expected: number, tolerance = 1e-9): void {
  const scale = Math.max(Math.abs(expected), 1e-30);
  expect(Math.abs(actual - expected) / scale).toBeLessThan(tolerance);
}

function must(result: AssessmentResult): TankAssessment {
  if (!result.ok) {
    throw new Error(`expected a tank, got ${JSON.stringify(result)}`);
  }
  return result;
}

const barrel: TankDesign = {
  materialId: "al2219_t87",
  innerDiameterM: 1,
  cylinderLengthM: 1,
  wallThicknessM: 0.01,
  dome: "hemispherical",
  forming: "rolled_welded",
  weldProcess: "tig",
  heatTreatment: "as_received",
};

describe("requirements", () => {
  it("uses proof 1.5 and burst 2.0 on MEOP", () => {
    const meop = 2e6;
    const required = requiredPressures(meop);
    expect(required.proofPressurePa).toBe(3e6);
    expect(required.burstPressurePa).toBe(4e6);
  });
});

describe("2219 TIG barrel, hand-worked yield", () => {
  // Parent yield at the 300 K NIST anchor: 388 MPa.
  // Longitudinal seam opens in the hoop direction.
  // Retention ρ = 0.40, joint efficiency = 1, parallel retention = 1.
  // σh = p R / t, σa = σh / 2.
  // Utilization uses σh / (ρ Sy) and σa / Sy.
  // The factor on σh / Sy is sqrt(1/ρ² − 1/(2ρ) + 1/4).
  const yieldPa = 388e6;
  const rho = 0.4;
  const radius = 0.5;
  const thickness = 0.01;
  const factor = Math.sqrt(1 / (rho * rho) - 1 / (2 * rho) + 1 / 4);
  const yieldPressure = (yieldPa / factor) * (thickness / radius);

  it("locks the weld card so the coupon ratio is not discounted twice", () => {
    const card = weldCard("al2219_t87", "tig");
    expect(card.hazUltimateKnockdown).toBe(0.4);
    expect(card.jointEfficiency).toBe(1);
    expect(card.parallelRetention).toBe(1);
    expect(card.hazYieldKnockdown).toBeNull();
  });

  it("fails proof on the longitudinal TIG weld and names the pressure", () => {
    const result = must(
      assessTank(barrel, {
        temperatureK: 300,
        pressurePa: 0,
        meopPa: 400 * PA_PER_PSI,
      }),
    );
    expectRelative(factor, 2.29128784747792, 1e-12);
    expectRelative(result.predictedYieldPressurePa ?? 0, yieldPressure);
    expectRelative(yieldPressure, 3_386_741.6564626023, 1e-9);
    expect(formatPsi(yieldPressure)).toBe("491 psi");
    expect(result.governingYield?.id).toBe("longitudinal_weld");
    expect(result.headline).toBe("HAZ at longitudinal TIG weld exceeded yield at 491 psi.");
    expect(result.disposition).toBe("fail");
    expect(result.proofMargin).not.toBeNull();
    expect(result.proofMargin ?? 0).toBeLessThan(0);
    expect(result.reason).toContain("1.5×MEOP");
    expect(result.reason).toContain("under");

    const girth = result.stations.find((station) => station.id === "girth_weld");
    const parent = result.stations.find((station) => station.id === "cylinder_membrane");
    // Girth opens on the axial stress, so the same 0.40 retention fails later than the long seam.
    const girthFactor = Math.sqrt(1 - 1 / (2 * rho) + 1 / (4 * rho * rho));
    const girthPressure = (yieldPa / girthFactor) * (thickness / radius);
    expectRelative(girth?.yieldPressurePa ?? 0, girthPressure);
    expect(girthPressure).toBeGreaterThan(yieldPressure);
    const parentFactor = Math.sqrt(0.75);
    expectRelative(parent?.yieldPressurePa ?? 0, (yieldPa / parentFactor) * (thickness / radius));
    expect((parent?.yieldPressurePa ?? 0) > (girth?.yieldPressurePa ?? 0)).toBe(true);
  });

  it("scales 2219 burst with the NIST ultimate when the wall gets cold", () => {
    const room = must(assessTank(barrel, { temperatureK: 300, pressurePa: 0, meopPa: 1e6 }));
    const cold = must(assessTank(barrel, { temperatureK: 77, pressurePa: 0, meopPa: 1e6 }));
    expectRelative((cold.predictedBurstPressurePa ?? 0) / (room.predictedBurstPressurePa ?? 1), 592 / 469);
    expectRelative((cold.predictedYieldPressurePa ?? 0) / (room.predictedYieldPressurePa ?? 1), 470 / 388);
  });

  it("lets a friction-stir seam carry 340/450 of parent instead of 0.40", () => {
    const card = weldCard("al2219_t87", "fsw");
    expect(card.hazUltimateKnockdown).toBeCloseTo(340 / 450, 12);
    const rho = 340 / 450;
    const fswFactor = Math.sqrt(1 / (rho * rho) - 1 / (2 * rho) + 1 / 4);
    const expected = (yieldPa / fswFactor) * (thickness / radius);
    const fsw = must(
      assessTank(
        { ...barrel, weldProcess: "fsw" },
        { temperatureK: 300, pressurePa: 0, meopPa: 1e6 },
      ),
    );
    expectRelative(fsw.predictedYieldPressurePa ?? 0, expected);
    expect(expected).toBeGreaterThan(yieldPressure);
    expect(fsw.governingYield?.label).toContain("friction-stir");
  });
});

describe("forming and dome choice change the governing station", () => {
  const base: TankDesign = { ...barrel, heatTreatment: "as_received" };

  it("spins away the long seam and leaves the girth weld in charge of a hemisphere", () => {
    const result = must(
      assessTank(
        { ...base, forming: "spun", dome: "hemispherical" },
        { temperatureK: 300, pressurePa: 0, meopPa: 1e6 },
      ),
    );
    expect(result.stations.some((station) => station.id === "longitudinal_weld")).toBe(false);
    expect(result.governingYield?.id).toBe("girth_weld");
  });

  it("yields a spun elliptical tank at the knuckle before the girth weld", () => {
    const result = must(
      assessTank(
        { ...base, forming: "spun", dome: "elliptical_2to1" },
        { temperatureK: 300, pressurePa: 0, meopPa: 1e6 },
      ),
    );
    expect(result.governingYield?.id).toBe("dome_knuckle");
    const yieldPa = 388e6;
    const radius = 0.5;
    const thickness = 0.01;
    // Knuckle von Mises is sqrt(1.75) times p R / t.
    const knucklePressure = (yieldPa / Math.sqrt(1.75)) * (thickness / radius);
    expectRelative(result.predictedYieldPressurePa ?? 0, knucklePressure);
  });
});

describe("temperature, contraction, and sign-off", () => {
  it("scales an isotropic tank's burst with strength alone", () => {
    const design: TankDesign = {
      ...barrel,
      materialId: "inconel718_aged",
      dome: "hemispherical",
    };
    const hot = must(
      assessTank(design, { temperatureK: fahrenheitToKelvin(80), pressurePa: 0, meopPa: 1e6 }),
    );
    const cold = must(
      assessTank(design, { temperatureK: fahrenheitToKelvin(-320), pressurePa: 0, meopPa: 1e6 }),
    );
    // No 718 weld coupon, so the signature is withheld. The cylinder number is still there.
    expect(hot.disposition).toBe("not_qualified");
    expect(hot.predictedBurstPressurePa).toBeNull();
    const hotCylinder = hot.stations.find((station) => station.id === "cylinder_membrane")?.burstPressurePa ?? 0;
    const coldCylinder = cold.stations.find((station) => station.id === "cylinder_membrane")?.burstPressurePa ?? 0;
    expectRelative(coldCylinder / hotCylinder, 237 / 190.5);
    // Secant from 70°F to −320°F: 5.9e-6 /°F × (−390°F).
    expectRelative(cold.thermalStrain ?? 0, 5.9e-6 * -390, 1e-12);
    expect(cold.contractedInnerRadiusM).toBeLessThan(cold.innerRadiusM);
    expectRelative(
      cold.contractedInnerRadiusM / cold.contractedThicknessM,
      cold.innerRadiusM / barrel.wallThicknessM,
    );
  });

  it("reconstructs 2195 at the published endpoints and at LOX", () => {
    const design: TankDesign = { ...barrel, materialId: "al2195_t8", weldProcess: "fsw" };
    const room = must(assessTank(design, { temperatureK: 298, pressurePa: 0, meopPa: 1e6 }));
    expect(room.strength.yieldPa).toBe(586e6);
    expect(room.strength.ultimateTensilePa).toBe(614e6);
    expect(room.strengthCoverage).toBe("measured");

    const hydrogen = must(assessTank(design, { temperatureK: 20, pressurePa: 0, meopPa: 1e6 }));
    expect(hydrogen.strength.yieldPa).toBe(724e6);
    expect(hydrogen.strength.ultimateTensilePa).toBe(859e6);

    const lox = must(
      assessTank(design, { temperatureK: PROPELLANTS.lox.temperatureK, pressurePa: 0, meopPa: 1e6 }),
    );
    const temperature = PROPELLANTS.lox.temperatureK;
    const yieldPa = 586e6 + ((724e6 - 586e6) * (298 - temperature)) / (298 - 20);
    const gap = 28e6 + ((135e6 - 28e6) * (133 - temperature)) / (133 - 20);
    expect(lox.strengthCoverage).toBe("reconstructed");
    expectRelative(lox.strength.yieldPa ?? 0, yieldPa);
    expectRelative(lox.strength.ultimateTensilePa, yieldPa + gap);
    expect(lox.disposition).toBe("not_qualified");
    expect(lox.reason).toContain("No transverse weld coupon");
  });

  it("refuses to sign 2219 below the coldest anchor", () => {
    const result = must(assessTank(barrel, { temperatureK: 10, pressurePa: 0, meopPa: 1e6 }));
    expect(result.strengthCoverage).toBe("clamped");
    expect(result.strength.yieldPa).toBe(476e6);
    expect(result.disposition).toBe("not_qualified");
    expect(result.predictedYieldPressurePa).toBeNull();
  });

  it("raises 304L burst in proportion to the cryogenic ultimate", () => {
    const design: TankDesign = { ...barrel, materialId: "ss304l", dome: "hemispherical" };
    const room = must(assessTank(design, { temperatureK: 293, pressurePa: 0, meopPa: 1e5 }));
    const cold = must(assessTank(design, { temperatureK: 77, pressurePa: 0, meopPa: 1e5 }));
    expect(room.disposition === "fail" || room.disposition === "pass_with_notes").toBe(true);
    expectRelative((cold.predictedBurstPressurePa ?? 0) / (room.predictedBurstPressurePa ?? 1), 1656 / 716);
    const cylinder = room.stations.find((station) => station.id === "cylinder_membrane");
    const seam = room.stations.find((station) => station.id === "longitudinal_weld");
    expectRelative(cylinder?.burstPressurePa ?? 0, seam?.burstPressurePa ?? 1);
  });

  it("does not sign a carbon tank at LOX temperature, and does sign one at room temperature when the margins hold", () => {
    const design: TankDesign = {
      materialId: "im7_8552_qi",
      innerDiameterM: 1,
      cylinderLengthM: 1,
      wallThicknessM: 0.01,
      dome: "hemispherical",
      forming: "laid_up",
      weldProcess: "none",
      heatTreatment: "autoclave_m_cure",
    };
    const tensile = ksiToPa(104.69);
    const burst = tensile * (0.01 / 0.5);
    const room = must(
      assessTank(design, {
        temperatureK: fahrenheitToKelvin(70),
        pressurePa: 0,
        meopPa: burst / 3,
      }),
    );
    expect(room.governingBurst?.id).toBe("cylinder_membrane");
    expectRelative(room.predictedBurstPressurePa ?? 0, burst);
    expect(room.disposition).toBe("pass_with_notes");
    expect(room.burstMargin ?? 0).toBeGreaterThan(0);

    const lox = must(
      assessTank(design, {
        temperatureK: PROPELLANTS.lox.temperatureK,
        pressurePa: 0,
        meopPa: burst / 3,
      }),
    );
    expect(lox.strengthCoverage).toBe("clamped");
    expect(lox.disposition).toBe("not_qualified");
  });

  it("bursts a room-temperature elliptical carbon dome on the compressive knuckle", () => {
    const design: TankDesign = {
      materialId: "im7_8552_qi",
      innerDiameterM: 1,
      cylinderLengthM: 1,
      wallThicknessM: 0.01,
      dome: "elliptical_2to1",
      forming: "laid_up",
      weldProcess: "none",
      heatTreatment: "autoclave_m_cure",
    };
    const result = must(
      assessTank(design, { temperatureK: fahrenheitToKelvin(70), pressurePa: 0, meopPa: 1e6 }),
    );
    expect(result.governingBurst?.id).toBe("dome_knuckle");
    expectRelative(result.predictedBurstPressurePa ?? 0, ksiToPa(87.05) * (0.01 / 0.5));
    expect(result.reason).toContain("compressive");
  });
});

describe("mass, cost, heat treatment, and rejected routes", () => {
  it("adds exact cylinder and hemisphere volumes, then the planning cost", () => {
    const radius = 0.5;
    const thickness = 0.01;
    const length = 1;
    const cylinder = Math.PI * ((radius + thickness) ** 2 - radius ** 2) * length;
    const hemisphere = (2 / 3) * Math.PI * ((radius + thickness) ** 3 - radius ** 3);
    expectRelative(cylinderMaterialVolume(radius, thickness, length), cylinder);
    expectRelative(hemisphereMaterialVolume(radius, thickness), hemisphere);
    const volume = tankMaterialVolume(barrel);
    expectRelative(volume, cylinder + 2 * hemisphere);
    const result = must(assessTank(barrel, { temperatureK: 300, pressurePa: 0, meopPa: 1e6 }));
    expectRelative(result.massKg, 2840 * volume);
    const welds = weldLengths(barrel);
    expectRelative(welds.longitudinalM, 1);
    expectRelative(welds.girthM, 2 * 2 * Math.PI * radius);
    const process = welds.totalM * 350 + 800;
    expectRelative(result.processCostUsd, process);
    expectRelative(result.materialCostUsd, result.massKg * 22);
    expectRelative(result.totalCostUsd, result.materialCostUsd + result.processCostUsd);
    // Mass is the fabricated mass. A colder test does not change it.
    const cold = must(assessTank(barrel, { temperatureK: 77, pressurePa: 0, meopPa: 1e6 }));
    expectRelative(cold.massKg, result.massKg);
  });

  it("raises titanium burst when the player ages the sheet, and still withholds the weld", () => {
    const annealed: TankDesign = {
      ...barrel,
      materialId: "ti6al4v",
      dome: "hemispherical",
      heatTreatment: "as_received",
    };
    const aged: TankDesign = { ...annealed, heatTreatment: "solution_treat_and_age" };
    const before = must(assessTank(annealed, { temperatureK: 293.15, pressurePa: 0, meopPa: 1e6 }));
    const after = must(assessTank(aged, { temperatureK: 293.15, pressurePa: 0, meopPa: 1e6 }));
    const beforeBurst = before.stations.find((station) => station.id === "cylinder_membrane")?.burstPressurePa ?? 0;
    const afterBurst = after.stations.find((station) => station.id === "cylinder_membrane")?.burstPressurePa ?? 0;
    expectRelative(afterBurst / beforeBurst, 168 / 136);
    expect(after.disposition).toBe("not_qualified");
    expect(after.notes.join(" ")).toContain("aged sheet");
  });

  it("rejects a friction-stirred titanium barrel and a welded laminate", () => {
    const titanium = assessTank(
      { ...barrel, materialId: "ti6al4v", weldProcess: "fsw" },
      { temperatureK: 293.15, pressurePa: 0, meopPa: 1e6 },
    );
    expect(titanium.ok).toBe(false);
    const composite = assessTank(
      {
        ...barrel,
        materialId: "im7_8552_qi",
        forming: "rolled_welded",
        weldProcess: "tig",
        heatTreatment: "autoclave_m_cure",
      },
      { temperatureK: 294, pressurePa: 0, meopPa: 1e6 },
    );
    expect(composite.ok).toBe(false);
  });

  it("withholds a signature when the wall is too thick for membrane theory", () => {
    const result = must(
      assessTank(
        { ...barrel, wallThicknessM: 0.1 },
        { temperatureK: 300, pressurePa: 0, meopPa: 1e6 },
      ),
    );
    expect(result.thinWallRadiusOverThickness).toBeLessThan(10);
    expect(result.disposition).toBe("not_qualified");
    // k = t/R = 0.2 → (2 + 2k + k²) / (2 + k)
    expectRelative(result.lameHoopOverThin, (2 + 2 * 0.2 + 0.04) / 2.2);
    expect(result.blocking.join(" ")).toContain("thin-wall");
  });
});
