import { describe, expect, it } from "vitest";
import { assessTank, formatKg, formatPsi, formatUsd } from "../src/index.js";
import { DOME_TYPES, FORMING_METHODS, HEAT_TREATMENTS, MATERIAL_IDS, WELD_PROCESSES } from "../src/index.js";
import type { TankDesign } from "../src/index.js";
import {
  DEFAULT_FIELDS,
  DOME_CHOICES,
  FORMING_CHOICES,
  HEAT_CHOICES,
  MATERIAL_CHOICES,
  WELD_CHOICES,
  parseBuilderFields,
} from "../src/web/form.js";
import { formingFrame, phaseCaption } from "../src/web/forming.js";
import { SHOP_AMBIENT_K, builderReadout } from "../src/web/readout.js";

function ids(choices: { id: string }[]): string[] {
  return choices.map((choice) => choice.id).sort();
}

function tank(result: ReturnType<typeof assessTank>) {
  if (!result.ok) throw new Error(result.reasons.join(" "));
  return result;
}

describe("builder fields", () => {
  it("lists every shop choice exactly once", () => {
    expect(ids(MATERIAL_CHOICES)).toEqual([...MATERIAL_IDS].sort());
    expect(ids(DOME_CHOICES)).toEqual([...DOME_TYPES].sort());
    expect(ids(FORMING_CHOICES)).toEqual([...FORMING_METHODS].sort());
    expect(ids(WELD_CHOICES)).toEqual([...WELD_PROCESSES].sort());
    expect(ids(HEAT_CHOICES)).toEqual([...HEAT_TREATMENTS].sort());
  });

  it("turns millimeters of wall into meters", () => {
    const parsed = parseBuilderFields(DEFAULT_FIELDS);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.design.wallThicknessM).toBe(0.005);
    expect(parsed.design.innerDiameterM).toBe(1);
  });

  it("refuses a blank thickness and an unknown material", () => {
    expect(parseBuilderFields({ ...DEFAULT_FIELDS, wallThicknessMm: "" }).ok).toBe(false);
    expect(parseBuilderFields({ ...DEFAULT_FIELDS, materialId: "water" }).ok).toBe(false);
  });
});

describe("traveler numbers come from the core", () => {
  it("matches mass, cost, length, and burst for the default 2219 tank", () => {
    const parsed = parseBuilderFields(DEFAULT_FIELDS);
    if (!parsed.ok) throw new Error(parsed.error);
    const readout = builderReadout(parsed.design);
    const core = tank(
      assessTank(parsed.design, { temperatureK: SHOP_AMBIENT_K, pressurePa: 0, meopPa: 1e6 }),
    );
    const otherPressure = tank(
      assessTank(parsed.design, { temperatureK: SHOP_AMBIENT_K, pressurePa: 0, meopPa: 4e6 }),
    );
    expect(otherPressure.predictedBurstPressurePa).toBe(core.predictedBurstPressurePa);
    expect(readout.stamp).toBe("signable");
    expect(readout.burstLabel).toBe(formatPsi(core.predictedBurstPressurePa ?? 0));
    expect(readout.yieldLabel).toBe(formatPsi(core.predictedYieldPressurePa ?? 0));
    expect(readout.massLabel).toBe(formatKg(core.massKg));
    expect(readout.totalCostLabel).toBe(formatUsd(core.totalCostUsd));
    expect(readout.lengthLabel).toBe(`${core.overallLengthM.toFixed(2)} m`);
    expect(readout.headline).toContain("longitudinal TIG");
    expect(readout.headline).toContain(readout.burstLabel);
  });

  it("holds a titanium weld that has no coupon", () => {
    const design: TankDesign = {
      materialId: "ti6al4v",
      innerDiameterM: 1,
      cylinderLengthM: 1.8,
      wallThicknessM: 0.005,
      dome: "hemispherical",
      forming: "rolled_welded",
      weldProcess: "tig",
      heatTreatment: "as_received",
    };
    const readout = builderReadout(design);
    expect(readout.stamp).toBe("not_signable");
    expect(readout.burstLabel).toBe("Not signable");
    expect(readout.detail).toContain("No transverse weld coupon");
  });

  it("rejects a TIG weld on the laminate and signs the cured route", () => {
    const welded = builderReadout({
      materialId: "im7_8552_qi",
      innerDiameterM: 1,
      cylinderLengthM: 1,
      wallThicknessM: 0.004,
      dome: "hemispherical",
      forming: "laid_up",
      weldProcess: "tig",
      heatTreatment: "autoclave_m_cure",
    });
    expect(welded.stamp).toBe("rejected");
    expect(welded.headline).toContain("not welded");

    const cured = builderReadout({
      materialId: "im7_8552_qi",
      innerDiameterM: 1,
      cylinderLengthM: 1,
      wallThicknessM: 0.004,
      dome: "hemispherical",
      forming: "laid_up",
      weldProcess: "none",
      heatTreatment: "autoclave_m_cure",
    });
    expect(cured.stamp).toBe("signable");
    expect(cured.yieldLabel).toBe("No yield on this card");
    expect(cured.headline).toContain("cylinder membrane");
  });
});

describe("forming sequence", () => {
  const design: TankDesign = {
    materialId: "al2219_t87",
    innerDiameterM: 1,
    cylinderLengthM: 1,
    wallThicknessM: 0.005,
    dome: "elliptical_2to1",
    forming: "rolled_welded",
    weldProcess: "tig",
    heatTreatment: "as_received",
  };

  it("rolls, welds the long seam, seats the heads, then closes the girth welds", () => {
    expect(formingFrame("rolled_welded", "tig", 0.1).phase).toBe("roll");
    expect(formingFrame("rolled_welded", "tig", 0.4).phase).toBe("long-weld");
    expect(formingFrame("rolled_welded", "tig", 0.6).phase).toBe("heads");
    expect(formingFrame("rolled_welded", "tig", 0.9).phase).toBe("girth");
    expect(formingFrame("rolled_welded", "tig", 1).phase).toBe("done");
    expect(formingFrame("rolled_welded", "none", 0.4).phase).toBe("heads");
    expect(formingFrame("spun", "tig", 0.2).phase).toBe("spin");
    expect(formingFrame("spun", "tig", 0.6).phase).toBe("girth");
    expect(formingFrame("laid_up", "none", 0.2).phase).toBe("plies");
    expect(formingFrame("laid_up", "none", 0.75).phase).toBe("cure");
    expect(formingFrame("laid_up", "none", 0.95).phase).toBe("done");
  });

  it("names the torch that is actually running", () => {
    expect(phaseCaption("long-weld", design)).toContain("TIG");
    expect(phaseCaption("long-weld", { ...design, weldProcess: "fsw" })).toContain("friction-stir");
    expect(phaseCaption("heads", design)).toContain("Elliptical");
    expect(phaseCaption("cure", { ...design, forming: "laid_up" })).toContain("M-cure");
  });
});
