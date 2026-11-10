import "@fontsource/barlow-condensed/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-sans/400.css";
import { assertNever, type TankDesign } from "../types.js";
import {
  DEFAULT_FIELDS,
  DOME_CHOICES,
  FORMING_CHOICES,
  HEAT_CHOICES,
  MATERIAL_CHOICES,
  WELD_CHOICES,
  parseBuilderFields,
} from "./form.js";
import type { BuilderFields, Choice } from "./form.js";
import { phaseCaption } from "./forming.js";
import { builderReadout } from "./readout.js";
import type { BuilderReadout } from "./readout.js";
import { TankViewport } from "./scene.js";
import "./styles.css";

const form = document.querySelector<HTMLFormElement>("#tank-form");
const host = document.querySelector<HTMLElement>("#viewport");
const replay = document.querySelector<HTMLButtonElement>("#replay");
if (!form || !host || !replay) {
  throw new Error("Tank bay markup is missing.");
}

fillSelect("material", MATERIAL_CHOICES);
fillSelect("dome", DOME_CHOICES);
fillSelect("forming", FORMING_CHOICES);
fillSelect("weld", WELD_CHOICES);
fillSelect("heat", HEAT_CHOICES);
writeFields(DEFAULT_FIELDS);

let current: TankDesign | null = null;
const viewport = new TankViewport(host, (phase) => {
  const status = document.querySelector("#forming-status");
  if (!status || !current) return;
  status.textContent = phaseCaption(phase, current);
});

form.addEventListener("input", () => {
  sync(false);
});

replay.addEventListener("click", () => {
  sync(true);
});

sync(false);
requestAnimationFrame(() => {
  if (current) viewport.replay();
});

function sync(play: boolean): void {
  const parsed = parseBuilderFields(readFields());
  if (!parsed.ok) {
    current = null;
    text("#forming-status", parsed.error);
    paint({
      drawable: false,
      stamp: "rejected",
      headline: parsed.error,
      detail: "The bay is holding this card until the fields are numbers the shop can build.",
      reasons: [parsed.error],
      massLabel: "—",
      materialCostLabel: "—",
      processCostLabel: "—",
      totalCostLabel: "—",
      lengthLabel: "—",
      yieldLabel: "—",
      burstLabel: "—",
    });
    viewport.setDesign(null);
    return;
  }
  current = parsed.design;
  const readout = builderReadout(parsed.design);
  paint(readout);
  viewport.setDesign(readout.drawable ? parsed.design : null);
  if (play) viewport.replay();
}

function paint(readout: BuilderReadout): void {
  const stamp = document.querySelector<HTMLElement>("#stamp");
  if (stamp) {
    stamp.dataset.stamp = readout.stamp;
    stamp.textContent = stampText(readout.stamp);
  }
  text("#headline", readout.headline);
  text("#detail", readout.detail);
  text("#mass-out", readout.massLabel);
  text("#material-cost-out", readout.materialCostLabel);
  text("#process-cost-out", readout.processCostLabel);
  text("#total-cost-out", readout.totalCostLabel);
  text("#length-out", readout.lengthLabel);
  text("#yield-out", readout.yieldLabel);
  text("#burst-out", readout.burstLabel);
  const reasons = document.querySelector("#reasons");
  if (reasons) {
    reasons.replaceChildren();
    for (const reason of readout.reasons) {
      const item = document.createElement("li");
      item.textContent = reason;
      reasons.appendChild(item);
    }
  }
}

function stampText(stamp: BuilderReadout["stamp"]): string {
  switch (stamp) {
    case "signable":
      return "Signable";
    case "not_signable":
      return "Hold";
    case "rejected":
      return "Rejected";
    default:
      return assertNever(stamp);
  }
}

function fillSelect<T extends string>(id: string, choices: Choice<T>[]): void {
  const select = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!select) return;
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.id;
    option.textContent = choice.label;
    select.appendChild(option);
  }
}

function writeFields(fields: BuilderFields): void {
  setValue("material", fields.materialId);
  setValue("diameter", fields.innerDiameterM);
  setValue("length", fields.cylinderLengthM);
  setValue("thickness", fields.wallThicknessMm);
  setValue("dome", fields.dome);
  setValue("forming", fields.forming);
  setValue("weld", fields.weldProcess);
  setValue("heat", fields.heatTreatment);
}

function readFields(): BuilderFields {
  return {
    materialId: valueOf("material"),
    innerDiameterM: valueOf("diameter"),
    cylinderLengthM: valueOf("length"),
    wallThicknessMm: valueOf("thickness"),
    dome: valueOf("dome"),
    forming: valueOf("forming"),
    weldProcess: valueOf("weld"),
    heatTreatment: valueOf("heat"),
  };
}

function valueOf(id: string): string {
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  return element?.value ?? "";
}

function setValue(id: string, value: string): void {
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (element) element.value = value;
}

function text(selector: string, value: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
