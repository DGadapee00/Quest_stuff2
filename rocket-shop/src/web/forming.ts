import type { FormingMethod, TankDesign, WeldProcess } from "../types.js";
import { assertNever } from "../types.js";

export type FormingPhase = "roll" | "spin" | "plies" | "long-weld" | "heads" | "girth" | "cure" | "done";

export const FORMING_SECONDS = 8;

interface Segment {
  phase: FormingPhase;
  until: number;
  when?: (weld: WeldProcess) => boolean;
}

const ROLLED: Segment[] = [
  { phase: "roll", until: 0.28 },
  { phase: "long-weld", until: 0.52, when: (weld) => weld !== "none" },
  { phase: "heads", until: 0.74 },
  { phase: "girth", until: 1, when: (weld) => weld !== "none" },
];

const SPUN: Segment[] = [
  { phase: "spin", until: 0.48 },
  { phase: "girth", until: 0.86, when: (weld) => weld !== "none" },
];

const LAID_UP: Segment[] = [
  { phase: "plies", until: 0.62 },
  { phase: "cure", until: 0.92 },
];

export interface FormingFrame {
  phase: FormingPhase;
  /** 0 at the start of the phase, 1 at the end. */
  local: number;
}

export function formingFrame(forming: FormingMethod, weld: WeldProcess, progress: number): FormingFrame {
  const clamped = Math.min(1, Math.max(0, progress));
  let start = 0;
  for (const segment of segments(forming)) {
    if (segment.when && !segment.when(weld)) continue;
    if (clamped < segment.until) {
      const span = segment.until - start;
      return { phase: segment.phase, local: span <= 0 ? 1 : (clamped - start) / span };
    }
    start = segment.until;
  }
  return { phase: "done", local: 1 };
}

export function phaseCaption(phase: FormingPhase, design: TankDesign): string {
  switch (phase) {
    case "roll":
      return "The plate is going through the rolls.";
    case "spin":
      return "The blank is spinning out on the lathe.";
    case "plies":
      return "Quasi-isotropic plies are going down.";
    case "long-weld":
      return design.weldProcess === "fsw"
        ? "The friction-stir tool is running the long seam."
        : "The TIG torch is walking the long seam.";
    case "heads":
      return design.dome === "hemispherical" ? "Hemispherical heads are seating." : "Elliptical heads are seating.";
    case "girth":
      return design.weldProcess === "fsw" ? "Friction-stir welds are closing the heads." : "Girth welds are closing the heads.";
    case "cure":
      return "The autoclave is on the M-cure.";
    case "done":
      return "The tank is on the saddles. The traveler has the numbers.";
    default:
      return assertNever(phase);
  }
}

function segments(forming: FormingMethod): Segment[] {
  switch (forming) {
    case "rolled_welded":
      return ROLLED;
    case "spun":
      return SPUN;
    case "laid_up":
      return LAID_UP;
    default:
      return assertNever(forming);
  }
}
