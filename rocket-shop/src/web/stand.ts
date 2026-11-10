import { PROPELLANTS, assessTank, liveStatus, requiredPressures } from "../tank.js";
import type { Disposition, PropellantId, StationId, StationReport, TankAssessment, TankDesign } from "../types.js";
import { assertNever } from "../types.js";
import { PA_PER_PSI, formatMpa, formatPsi } from "../units.js";
import { SHOP_AMBIENT_K } from "./readout.js";

export type WallTemperature = "propellant" | "ambient";
export type StandRun = "proof" | "burst";

export const DISPLACEMENT_MAGNIFICATION = 40;

export interface StandFields {
  propellant: string;
  meopPsi: string;
  wall: string;
}

export const DEFAULT_STAND: StandFields = {
  propellant: "lox",
  meopPsi: "150",
  wall: "propellant",
};

export interface Heatmap {
  cylinder: string;
  longitudinal: string | null;
  girth: string | null;
  apex: string;
  knuckle: string | null;
  failed: StationId | null;
}

export interface StandSnapshot {
  ok: true;
  temperatureK: number;
  temperatureLabel: string;
  pressureLabel: string;
  stressLabel: string;
  stationLabel: string;
  statusLabel: string;
  requirement: string;
  reason: string;
  heatmap: Heatmap;
  radialScale: number;
  axialScale: number;
  stressPa: number;
  proofPressurePa: number;
  requiredBurstPressurePa: number;
  yieldLimitPa: number | null;
  limitPressurePa: number | null;
  disposition: Disposition;
}

export interface StandRejection {
  ok: false;
  headline: string;
  detail: string;
}

export type StandState = StandSnapshot | StandRejection;

export function wallTemperatureK(propellant: PropellantId, wall: WallTemperature): number {
  switch (wall) {
    case "ambient":
      return SHOP_AMBIENT_K;
    case "propellant":
      return PROPELLANTS[propellant].temperatureK;
    default:
      return assertNever(wall);
  }
}

export function parseStandFields(fields: StandFields): { ok: true; propellant: PropellantId; meopPa: number; wall: WallTemperature } | { ok: false; error: string } {
  const propellant = onePropellant(fields.propellant);
  const wall = fields.wall === "propellant" || fields.wall === "ambient" ? fields.wall : null;
  if (!propellant || !wall) return { ok: false, error: "Pick a propellant and a wall temperature." };
  const trimmed = fields.meopPsi.trim();
  if (trimmed === "") return { ok: false, error: "Operating pressure needs a number." };
  const psi = Number(trimmed);
  if (!Number.isFinite(psi) || !(psi > 0)) return { ok: false, error: "Operating pressure has to be greater than zero." };
  return { ok: true, propellant, meopPa: psi * PA_PER_PSI, wall };
}

export function standSnapshot(design: TankDesign, propellant: PropellantId, meopPa: number, wall: WallTemperature, pressurePa: number, magnify: boolean): StandState {
  const temperatureK = wallTemperatureK(propellant, wall);
  const result = assessTank(design, { temperatureK, pressurePa, meopPa });
  if (!result.ok) {
    return { ok: false, headline: result.reasons[0] ?? "This tank is not on the card.", detail: result.reasons.join(" ") };
  }
  return snapshotFrom(result, propellant, wall, magnify);
}

export function proofPlan(meopPa: number): { kind: "proof"; startPa: number; endPa: number; durationS: number } {
  return { kind: "proof", startPa: 0, endPa: requiredPressures(meopPa).proofPressurePa, durationS: 6 };
}

export function burstPlan(limitPa: number): { kind: "burst"; startPa: number; endPa: number; durationS: number } {
  return { kind: "burst", startPa: 0, endPa: limitPa, durationS: 8 };
}

export interface GaugeStep {
  pressurePa: number;
  stop: boolean;
}

/** Linear ramp. A proof stops on the yield (or ultimate, if that is the proof check). A burst stops on the ultimate pressure. */
export function gaugeStep(
  plan: { kind: StandRun; startPa: number; endPa: number; durationS: number },
  elapsedS: number,
  yieldLimitPa: number | null,
  burstLimitPa: number | null,
): GaugeStep {
  const t = Math.min(1, Math.max(0, elapsedS / plan.durationS));
  const climbed = plan.startPa + (plan.endPa - plan.startPa) * t;
  if (plan.kind === "proof") {
    const limit = yieldLimitPa ?? burstLimitPa;
    if (limit !== null && climbed >= limit && limit <= plan.endPa) {
      return { pressurePa: limit, stop: true };
    }
  }
  if (plan.kind === "burst" && burstLimitPa !== null && climbed >= burstLimitPa) {
    return { pressurePa: burstLimitPa, stop: true };
  }
  return { pressurePa: Math.min(climbed, plan.endPa), stop: t >= 1 };
}

export function utilizationColor(utilization: number | null): string {
  if (utilization === null || !Number.isFinite(utilization)) return rgb(MUTED);
  if (utilization >= 1) return rgb(OVER);
  if (utilization <= 0) return rgb(COOL);
  if (utilization < 0.65) return rgb(lerp(COOL, MID, utilization / 0.65));
  return rgb(lerp(MID, HOT, (utilization - 0.65) / 0.35));
}

const COOL: Rgb = [61, 92, 115];
const MID: Rgb = [228, 177, 90];
const HOT: Rgb = [224, 90, 63];
const OVER: Rgb = [255, 59, 31];
const MUTED: Rgb = [74, 69, 60];

type Rgb = [number, number, number];

function snapshotFrom(result: TankAssessment, propellant: PropellantId, wall: WallTemperature, magnify: boolean): StandSnapshot {
  const status = liveStatus(result);
  const station = governingStation(result, status);
  const stressPa = station?.stress.vonMisesPa ?? 0;
  const factor = magnify ? DISPLACEMENT_MAGNIFICATION : 1;
  const hoop = result.elasticHoopStrain ?? 0;
  const axial = result.elasticAxialStrain ?? 0;
  return {
    ok: true,
    temperatureK: result.temperatureK,
    temperatureLabel: temperatureLabel(propellant, wall, result.temperatureK),
    pressureLabel: formatPsi(result.pressurePa),
    stressLabel: formatMpa(stressPa),
    stationLabel: station?.label ?? "No station",
    statusLabel: statusText(status),
    requirement: result.headline,
    reason: result.reason,
    heatmap: heatmapOf(result, status),
    radialScale: 1 + factor * Math.max(0, hoop),
    axialScale: 1 + factor * Math.max(0, axial),
    stressPa,
    proofPressurePa: result.proofPressurePa,
    requiredBurstPressurePa: result.requiredBurstPressurePa,
    yieldLimitPa: result.predictedYieldPressurePa,
    limitPressurePa: result.predictedBurstPressurePa,
    disposition: result.disposition,
  };
}

function governingStation(result: TankAssessment, status: ReturnType<typeof liveStatus>): StationReport | null {
  if (status === "burst") return result.governingBurst ?? result.governingYield;
  if (status === "yielded") return result.governingYield ?? result.governingBurst;
  return result.governingYield ?? result.governingBurst;
}

function heatmapOf(result: TankAssessment, status: ReturnType<typeof liveStatus>): Heatmap {
  const byId = new Map(result.stations.map((station) => [station.id, station]));
  const colorOf = (id: StationId): string | null => {
    const station = byId.get(id);
    if (!station) return null;
    return utilizationColor(heatUtilization(station));
  };
  let failed: StationId | null = null;
  if (status === "yielded") failed = result.governingYield?.id ?? null;
  if (status === "burst") failed = result.governingBurst?.id ?? null;
  return {
    cylinder: colorOf("cylinder_membrane") ?? utilizationColor(null),
    longitudinal: colorOf("longitudinal_weld"),
    girth: colorOf("girth_weld"),
    apex: colorOf("dome_apex") ?? utilizationColor(null),
    knuckle: colorOf("dome_knuckle"),
    failed,
  };
}

function heatUtilization(station: StationReport): number | null {
  if (!station.qualified) return null;
  const values = [station.yieldUtilization, station.ultimateUtilization].filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function temperatureLabel(propellant: PropellantId, wall: WallTemperature, temperatureK: number): string {
  const fluid = PROPELLANTS[propellant].name;
  switch (wall) {
    case "ambient":
      return `${temperatureK.toFixed(2)} K shop ambient. ${fluid} is not setting the wall temperature.`;
    case "propellant":
      return `${temperatureK.toFixed(2)} K, the ${fluid} card temperature.`;
    default:
      return assertNever(wall);
  }
}

function statusText(status: ReturnType<typeof liveStatus>): string {
  switch (status) {
    case "elastic":
      return "Elastic";
    case "yielded":
      return "Yielded";
    case "burst":
      return "Burst";
    case "not_qualified":
      return "Not signable";
    default:
      return assertNever(status);
  }
}

function onePropellant(value: string): PropellantId | null {
  switch (value) {
    case "lox":
    case "lch4":
    case "rp1":
      return value;
    default:
      return null;
  }
}

function lerp(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function rgb(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
