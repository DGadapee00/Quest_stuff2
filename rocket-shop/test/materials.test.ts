import { describe, expect, it } from "vitest";
import { MATERIAL_IDS, PROPELLANTS, WELD_PROCESSES, listMaterials, sources, weldCard } from "../src/index.js";
import type { SourcedNumber } from "../src/index.js";
import { KG_PER_LB, M_PER_IN, PA_PER_PSI, W_PER_MK_PER_BTU_IN } from "../src/index.js";

function sourcedNumbers(value: unknown, found: SourcedNumber[]): void {
  if (!value || typeof value !== "object") return;
  if ("value" in value && ("sourceId" in value || "missingReason" in value)) {
    found.push(value as SourcedNumber);
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") sourcedNumbers(child, found);
  }
}

describe("every cited number points at a source", () => {
  it("resolves material source ids and refuses a blank measured value", () => {
    const numbers: SourcedNumber[] = [];
    for (const material of listMaterials()) {
      sourcedNumbers(material, numbers);
      expect(sources[material.strengthSourceId]).toBeDefined();
      expect(sources[material.weldabilitySourceId]).toBeDefined();
      if (material.staSourceId) expect(sources[material.staSourceId]).toBeDefined();
    }
    expect(numbers.length).toBeGreaterThan(20);
    for (const number of numbers) {
      if (number.value === null) {
        expect(number.missingReason && number.missingReason.length > 0).toBe(true);
        expect(number.sourceId).toBeNull();
      } else {
        expect(number.sourceId).toBeTruthy();
        expect(sources[number.sourceId ?? ""]).toBeDefined();
      }
    }
  });

  it("resolves weld and propellant source ids", () => {
    for (const materialId of MATERIAL_IDS) {
      for (const process of WELD_PROCESSES) {
        const card = weldCard(materialId, process);
        if (card.sourceId) expect(sources[card.sourceId]).toBeDefined();
      }
    }
    for (const propellant of Object.values(PROPELLANTS)) {
      expect(sources[propellant.sourceId]).toBeDefined();
    }
    expect(sources["aiaa-s-080-1998"]).toBeDefined();
    expect(sources["shop-planning-cost"]).toBeDefined();
  });

  it("keeps the six shop alloys", () => {
    expect(listMaterials().map((material) => material.id)).toEqual([
      "al2219_t87",
      "al2195_t8",
      "ss304l",
      "inconel718_aged",
      "ti6al4v",
      "im7_8552_qi",
    ]);
  });
});

describe("unit conversions used by the cards", () => {
  it("derives psi and lb/in³ from the pound, the inch, and standard gravity", () => {
    const newtonPerLbf = KG_PER_LB * 9.80665;
    expect(PA_PER_PSI).toBe(newtonPerLbf / (M_PER_IN * M_PER_IN));
    const kgPerM3 = KG_PER_LB / M_PER_IN ** 3;
    expect(kgPerM3).toBeCloseTo(27679.904710203125, 6);
  });

  it("converts the Special Metals conductivity unit", () => {
    const factor = (1055.05585262 * 0.0254) / (3600 * (0.0254 * 12) ** 2 * (5 / 9));
    expect(W_PER_MK_PER_BTU_IN).toBeCloseTo(factor, 12);
    expect(79 * W_PER_MK_PER_BTU_IN).toBeCloseTo(11.394, 3);
  });
});
