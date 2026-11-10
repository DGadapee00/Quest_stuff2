import type { TankDesign } from "../types.js";
import { assertNever } from "../types.js";
import { Plot } from "./plot.js";
import type { TankViewport } from "./scene.js";
import {
  DEFAULT_STAND,
  burstPlan,
  gaugeStep,
  parseStandFields,
  proofPlan,
  standSnapshot,
} from "./stand.js";
import type { StandRun, StandSnapshot } from "./stand.js";

interface StandMount {
  viewport: TankViewport;
  getDesign: () => TankDesign | null;
  setStatus: (text: string) => void;
}

export function mountStand(mount: StandMount): { refresh: () => void; setActive: (active: boolean) => void } {
  const propellant = requiredSelect("propellant");
  const wall = requiredSelect("wall");
  const meop = requiredInput("meop");
  const magnify = requiredInput("magnify");
  const proof = requiredButton("proof");
  const burst = requiredButton("burst-run");
  const plotCanvas = document.querySelector<HTMLCanvasElement>("#plot");
  if (!plotCanvas) throw new Error("The plot canvas is missing.");
  const plot = new Plot(plotCanvas);

  propellant.value = DEFAULT_STAND.propellant;
  wall.value = DEFAULT_STAND.wall;
  meop.value = DEFAULT_STAND.meopPsi;
  magnify.checked = true;

  let active = false;
  let frame = 0;
  let running = false;
  let plan: ReturnType<typeof proofPlan> | ReturnType<typeof burstPlan> | null = null;
  let startedAt = 0;
  let yieldLimit: number | null = null;
  let burstLimit: number | null = null;
  let lastPressure = 0;

  const refresh = (): void => {
    if (!active) return;
    stopRun(false);
    paint(0);
  };

  propellant.addEventListener("change", refresh);
  wall.addEventListener("change", refresh);
  meop.addEventListener("input", refresh);
  magnify.addEventListener("change", () => {
    if (active && !running) paint(lastPressure);
  });
  proof.addEventListener("click", () => start("proof"));
  burst.addEventListener("click", () => start("burst"));
  window.addEventListener("resize", () => plot.draw());

  function start(kind: StandRun): void {
    const snap = paint(0);
    if (!snap) return;
    if (snap.disposition === "not_qualified" || (kind === "burst" && snap.limitPressurePa === null)) return;
    const parsed = read();
    if (!parsed) return;
    plan = kind === "proof" ? proofPlan(parsed.meopPa) : burstPlan(snap.limitPressurePa ?? snap.proofPressurePa);
    yieldLimit = snap.yieldLimitPa;
    burstLimit = snap.limitPressurePa;
    startedAt = performance.now();
    running = true;
    plot.reset({ proofPa: snap.proofPressurePa, burstRequiredPa: snap.requiredBurstPressurePa, run: kind });
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    if (!running || !plan) return;
    const step = gaugeStep(plan, (now - startedAt) / 1000, yieldLimit, burstLimit);
    const snap = paint(step.pressurePa);
    if (snap) {
      plot.push({ timeS: (now - startedAt) / 1000, pressurePa: step.pressurePa, stressPa: snap.stressPa });
    }
    if (step.stop) {
      running = false;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function stopRun(redraw: boolean): void {
    running = false;
    plan = null;
    cancelAnimationFrame(frame);
    if (redraw && active) paint(0);
  }

  function paint(pressurePa: number): StandSnapshot | null {
    lastPressure = pressurePa;
    const design = mount.getDesign();
    const parsed = read();
    if (!design || !parsed) {
      showRejected(parsed ? "The bay has no tank to test." : (readError() ?? "The stand needs a tank."));
      mount.viewport.setHeatmap(null);
      return null;
    }
    const snap = standSnapshot(design, parsed.propellant, parsed.meopPa, parsed.wall, pressurePa, magnify.checked);
    if (!snap.ok) {
      showRejected(snap.headline, snap.detail);
      mount.viewport.setHeatmap(null);
      mount.viewport.setDisplacement(1, 1);
      return null;
    }
    text("#temperature-label", snap.temperatureLabel);
    text("#stand-headline", snap.requirement);
    text("#stand-reason", snap.reason);
    text("#gauge", snap.pressureLabel);
    text("#stress", snap.stressLabel);
    text("#station", snap.stationLabel);
    const stamp = document.querySelector<HTMLElement>("#stand-stamp");
    if (stamp) {
      stamp.dataset.stamp = stampKind(snap.disposition);
      stamp.textContent = stampLabel(snap.disposition);
    }
    const blocked = snap.disposition === "not_qualified";
    proof.disabled = blocked;
    burst.disabled = blocked || snap.limitPressurePa === null;
    mount.viewport.setHeatmap(snap.heatmap);
    mount.viewport.setDisplacement(snap.radialScale, snap.axialScale);
    mount.setStatus(`${snap.statusLabel} · ${snap.pressureLabel} · ${snap.stationLabel}`);
    return snap;
  }

  function read() {
    const parsed = parseStandFields({
      propellant: propellant.value,
      meopPsi: meop.value,
      wall: wall.value,
    });
    return parsed.ok ? parsed : null;
  }

  function readError(): string | null {
    const parsed = parseStandFields({ propellant: propellant.value, meopPsi: meop.value, wall: wall.value });
    return parsed.ok ? null : parsed.error;
  }

  return {
    refresh,
    setActive(next: boolean) {
      active = next;
      if (!next) {
        stopRun(false);
        mount.viewport.setHeatmap(null);
        mount.viewport.setDisplacement(1, 1);
        return;
      }
      requestAnimationFrame(() => {
        const snap = paint(0);
        if (snap) {
          plot.reset({ proofPa: snap.proofPressurePa, burstRequiredPa: snap.requiredBurstPressurePa, run: null });
        }
      });
    },
  };
}

function showRejected(headline: string, detail = "Fix the tank card before a pressure test."): void {
  text("#stand-headline", headline);
  text("#stand-reason", detail);
  text("#gauge", "—");
  text("#stress", "—");
  text("#station", "—");
  const stamp = document.querySelector<HTMLElement>("#stand-stamp");
  if (stamp) {
    stamp.dataset.stamp = "rejected";
    stamp.textContent = "Rejected";
  }
}

function stampKind(disposition: StandSnapshot["disposition"]): string {
  switch (disposition) {
    case "pass":
    case "pass_with_notes":
      return "signable";
    case "fail":
      return "rejected";
    case "not_qualified":
      return "not_signable";
    default:
      return assertNever(disposition);
  }
}

function stampLabel(disposition: StandSnapshot["disposition"]): string {
  switch (disposition) {
    case "pass":
    case "pass_with_notes":
      return "Meets requirement";
    case "fail":
      return "Fails requirement";
    case "not_qualified":
      return "Hold";
    default:
      return assertNever(disposition);
  }
}

function requiredSelect(id: string): HTMLSelectElement {
  const element = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function requiredInput(id: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function requiredButton(id: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function text(selector: string, value: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
