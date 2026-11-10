import {
  DOME_TYPES,
  FORMING_METHODS,
  HEAT_TREATMENTS,
  MATERIAL_IDS,
  WELD_PROCESSES,
} from "../types.js";
import type { DomeType, FormingMethod, HeatTreatment, MaterialId, TankDesign, WeldProcess } from "../types.js";

export interface Choice<T extends string> {
  id: T;
  label: string;
}

export const MATERIAL_CHOICES: Choice<MaterialId>[] = [
  { id: "al2219_t87", label: "Al 2219-T87" },
  { id: "al2195_t8", label: "Al-Li 2195-T8" },
  { id: "ss304l", label: "304L stainless" },
  { id: "inconel718_aged", label: "Inconel 718, aged" },
  { id: "ti6al4v", label: "Ti-6Al-4V" },
  { id: "im7_8552_qi", label: "IM7/8552 quasi-isotropic" },
];

export const DOME_CHOICES: Choice<DomeType>[] = [
  { id: "hemispherical", label: "Hemispherical" },
  { id: "elliptical_2to1", label: "2:1 elliptical" },
];

export const FORMING_CHOICES: Choice<FormingMethod>[] = [
  { id: "rolled_welded", label: "Rolled and welded barrel" },
  { id: "spun", label: "Spun" },
  { id: "laid_up", label: "Laid up" },
];

export const WELD_CHOICES: Choice<WeldProcess>[] = [
  { id: "tig", label: "TIG" },
  { id: "fsw", label: "Friction stir" },
  { id: "none", label: "No weld" },
];

export const HEAT_CHOICES: Choice<HeatTreatment>[] = [
  { id: "as_received", label: "As received" },
  { id: "stress_relief", label: "Stress relief" },
  { id: "solution_treat_and_age", label: "Solution treat and age" },
  { id: "autoclave_m_cure", label: "Autoclave M-cure" },
];

export interface BuilderFields {
  materialId: string;
  innerDiameterM: string;
  cylinderLengthM: string;
  wallThicknessMm: string;
  dome: string;
  forming: string;
  weldProcess: string;
  heatTreatment: string;
}

export const DEFAULT_FIELDS: BuilderFields = {
  materialId: "al2219_t87",
  innerDiameterM: "1",
  cylinderLengthM: "1.8",
  wallThicknessMm: "5",
  dome: "elliptical_2to1",
  forming: "rolled_welded",
  weldProcess: "tig",
  heatTreatment: "as_received",
};

export type ParsedFields = { ok: true; design: TankDesign } | { ok: false; error: string };

export function parseBuilderFields(fields: BuilderFields): ParsedFields {
  const materialId = oneOf(MATERIAL_IDS, fields.materialId);
  const dome = oneOf(DOME_TYPES, fields.dome);
  const forming = oneOf(FORMING_METHODS, fields.forming);
  const weldProcess = oneOf(WELD_PROCESSES, fields.weldProcess);
  const heatTreatment = oneOf(HEAT_TREATMENTS, fields.heatTreatment);
  if (!materialId || !dome || !forming || !weldProcess || !heatTreatment) {
    return { ok: false, error: "One of the shop choices is not on the card." };
  }

  const innerDiameterM = readPositive(fields.innerDiameterM, "Inner diameter");
  const cylinderLengthM = readPositive(fields.cylinderLengthM, "Barrel length");
  const wallThicknessMm = readPositive(fields.wallThicknessMm, "Wall thickness");
  if (typeof innerDiameterM === "string") return { ok: false, error: innerDiameterM };
  if (typeof cylinderLengthM === "string") return { ok: false, error: cylinderLengthM };
  if (typeof wallThicknessMm === "string") return { ok: false, error: wallThicknessMm };

  return {
    ok: true,
    design: {
      materialId,
      innerDiameterM,
      cylinderLengthM,
      wallThicknessM: wallThicknessMm / 1000,
      dome,
      forming,
      weldProcess,
      heatTreatment,
    },
  };
}

function oneOf<T extends string>(options: readonly T[], value: string): T | null {
  for (const option of options) {
    if (option === value) return option;
  }
  return null;
}

function readPositive(raw: string, label: string): number | string {
  const trimmed = raw.trim();
  if (trimmed === "") return `${label} needs a number.`;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} needs a number.`;
  if (!(value > 0)) return `${label} has to be greater than zero.`;
  return value;
}
