import { describe, expect, it } from "vitest";
import { assessTank, formatPsi } from "../src/index.js";
import { PA_PER_PSI } from "../src/index.js";
import type { TankDesign } from "../src/index.js";
import { DEFAULT_FIELDS, parseBuilderFields } from "../src/web/form.js";
import { SHOP_AMBIENT_K } from "../src/web/readout.js";
import { burstPlan, gaugeStep, parseStandFields, proofPlan, standSnapshot, utilizationColor, wallTemperatureK } from "../src/web/stand.js";

const design = (): TankDesign => {
  const parsed = parseBuilderFields(DEFAULT_FIELDS);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.design;
};

describe("stand inputs", () => {
  it("uses the propellant boiling point or shop ambient", () => {
    expect(wallTemperatureK("lox", "propellant")).toBe(90.19);
    expect(wallTemperatureK("lch4", "propellant")).toBe(111.66);
    expect(wallTemperatureK("rp1", "propellant")).toBe(SHOP_AMBIENT_K);
    expect(wallTemperatureK("lox", "ambient")).toBe(SHOP_AMBIENT_K);
  });

  it("converts operating pressure with the core psi factor", () => {
    const parsed = parseStandFields({ propellant: "lox", meopPsi: "150", wall: "propellant" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.meopPa).toBe(150 * PA_PER_PSI);
    expect(parseStandFields({ propellant: "lox", meopPsi: "0", wall: "ambient" }).ok).toBe(false);
  });
});

describe("the stand reads the core", () => {
  it("repeats the core headline and is stronger in LOX than at shop ambient", () => {
    const tank = design();
    const meopPa = 150 * PA_PER_PSI;
    const cold = standSnapshot(tank, "lox", meopPa, "propellant", 0, false);
    const warm = standSnapshot(tank, "lox", meopPa, "ambient", 0, false);
    const core = assessTank(tank, { temperatureK: 90.19, pressurePa: 0, meopPa });
    if (!cold.ok || !warm.ok || !core.ok) throw new Error("expected a signable tank");
    expect(cold.requirement).toBe(core.headline);
    expect(cold.reason).toBe(core.reason);
    expect(cold.limitPressurePa).toBe(core.predictedBurstPressurePa);
    expect(cold.limitPressurePa ?? 0).toBeGreaterThan(warm.limitPressurePa ?? 0);
    expect(cold.pressureLabel).toBe(formatPsi(0));
    expect(cold.heatmap.failed).toBeNull();
  });

  it("names the weld once the gauge reaches the core yield pressure", () => {
    const tank = design();
    const meopPa = 200 * PA_PER_PSI;
    const idle = standSnapshot(tank, "lox", meopPa, "ambient", 0, true);
    if (!idle.ok) throw new Error(idle.headline);
    const core = assessTank(tank, { temperatureK: SHOP_AMBIENT_K, pressurePa: 0, meopPa });
    if (!core.ok || core.predictedYieldPressurePa === null) throw new Error("expected a yield");
    const atYield = standSnapshot(tank, "lox", meopPa, "ambient", core.predictedYieldPressurePa, true);
    if (!atYield.ok) throw new Error(atYield.headline);
    expect(atYield.statusLabel).toBe("Yielded");
    expect(atYield.requirement).toContain("longitudinal TIG");
    expect(atYield.requirement).toContain("exceeded yield");
    expect(atYield.heatmap.failed).toBe("longitudinal_weld");
    expect(atYield.radialScale).toBeGreaterThan(1);
    expect(idle.radialScale).toBeGreaterThanOrEqual(1);
  });

  it("will not sign a titanium weld, so the stand has no burst pressure to ramp to", () => {
    const snap = standSnapshot(
      { ...design(), materialId: "ti6al4v" },
      "rp1",
      150 * PA_PER_PSI,
      "ambient",
      0,
      false,
    );
    if (!snap.ok) throw new Error(snap.headline);
    expect(snap.disposition).toBe("not_qualified");
    expect(snap.limitPressurePa).toBeNull();
    expect(snap.requirement).toContain("Not a signable");
  });
});

describe("gauge and heatmap", () => {
  it("ramps linearly and stops a proof on the yield pressure", () => {
    const plan = proofPlan(2e6);
    expect(plan.endPa).toBe(3e6);
    expect(gaugeStep(plan, 0, null, null).pressurePa).toBe(0);
    expect(gaugeStep(plan, 3, null, null).pressurePa).toBe(1.5e6);
    const early = gaugeStep(plan, 6, 1e6, 4e6);
    expect(early.stop).toBe(true);
    expect(early.pressurePa).toBe(1e6);
    const held = gaugeStep(plan, 6, 5e6, 8e6);
    expect(held.stop).toBe(true);
    expect(held.pressurePa).toBe(3e6);
  });

  it("stops a burst ramp on the ultimate pressure", () => {
    const plan = burstPlan(4e6);
    const step = gaugeStep(plan, 8, 2e6, 4e6);
    expect(step.stop).toBe(true);
    expect(step.pressurePa).toBe(4e6);
    expect(gaugeStep(plan, 2, 2e6, 4e6).pressurePa).toBe(1e6);
  });

  it("keeps the cool and hot ends of the heatmap fixed", () => {
    expect(utilizationColor(0)).toBe("#3d5c73");
    expect(utilizationColor(1)).toBe("#ff3b1f");
    expect(utilizationColor(null)).toBe("#4a453c");
    expect(utilizationColor(0.3)).not.toBe(utilizationColor(0));
  });
});
