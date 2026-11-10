import type { MaterialId, WeldProcess } from "./types.js";
import { assertNever } from "./types.js";

export interface WeldCard {
  allowed: boolean;
  rejection: string | null;
  /**
   * Cross-weld ultimate divided by parent ultimate.
   * Null when this shop has no coupon for the combination.
   */
  hazUltimateKnockdown: number | null;
  /** Cross-weld yield divided by parent yield. Null when yield was not measured. */
  hazYieldKnockdown: number | null;
  /**
   * Extra joint-efficiency multiplier. Stays at 1 when the knockdown already
   * comes from a transverse coupon, so the coupon is not penalized twice.
   */
  jointEfficiency: number;
  /**
   * Retention parallel to the weld. 1 means parallel HAZ softening is not applied.
   */
  parallelRetention: number;
  sourceId: string | null;
  note: string;
}

const NO_COUPON =
  "No transverse weld coupon is on this card. Parent-metal stresses are indicative only and the joint is not signable.";

export function weldCard(materialId: MaterialId, process: WeldProcess): WeldCard {
  switch (process) {
    case "none":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: null,
        note: "No weld.",
      };
    case "tig":
      return tigCard(materialId);
    case "fsw":
      return fswCard(materialId);
    default:
      return assertNever(process);
  }
}

function tigCard(materialId: MaterialId): WeldCard {
  switch (materialId) {
    case "al2219_t87":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: 0.4,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "balaji-2219-weld-2013",
        note: "Fusion-weld joint strength is the paper’s “about 40%” of T87 parent ultimate. Yield was not measured, so yield uses the same ratio. Joint efficiency is 1 because that ratio already failed the joint.",
      };
    case "al2195_t8":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "ntrs-2195-laser-1996",
        note: `Fusion welding of 2195 is crack-sensitive. ${NO_COUPON}`,
      };
    case "ss304l":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: 1,
        hazYieldKnockdown: 1,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "assumption-ss304l-weld",
        note: "Annealed 304L is modeled with no HAZ knockdown. There is no cross-weld coupon behind that 1.0.",
      };
    case "inconel718_aged":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "smc-045-inconel-718",
        note: `Aged 718 is weldable, and the age is lost in the HAZ unless the joint is re-aged. ${NO_COUPON}`,
      };
    case "ti6al4v":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "timet-6-4-datasheet",
        note: `Ti-6Al-4V is weldable with a clean, shielded joint. ${NO_COUPON}`,
      };
    case "im7_8552_qi":
      return {
        allowed: false,
        rejection: "IM7/8552 is a cured laminate. It is not TIG welded.",
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "ncamp-im7-8552",
        note: "Not weldable.",
      };
    default:
      return assertNever(materialId);
  }
}

function fswCard(materialId: MaterialId): WeldCard {
  switch (materialId) {
    case "al2219_t87":
      return {
        allowed: true,
        rejection: null,
        // Table 4 defect-free coupon, 340 MPa, over that plate’s 450 MPa parent ultimate.
        hazUltimateKnockdown: 340 / 450,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "balaji-2219-weld-2013",
        note: "Defect-free friction-stir coupon at 340 MPa ultimate against a 450 MPa parent. The ratio 340/450 is transferred onto the NIST parent. Yield was not measured and uses the same ratio. Joint efficiency is 1 so the coupon is not discounted again.",
      };
    case "al2195_t8":
      return {
        allowed: true,
        rejection: null,
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "ntrs-2195-laser-1996",
        note: `Friction-stir welding is the production route for 2195 tanks. ${NO_COUPON}`,
      };
    case "ss304l":
    case "inconel718_aged":
    case "ti6al4v":
      return {
        allowed: false,
        rejection: "Friction-stir welding in this shop dataset is only offered for the aluminum alloys.",
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "model-weld-directional",
        note: "Process not on the card.",
      };
    case "im7_8552_qi":
      return {
        allowed: false,
        rejection: "IM7/8552 is a cured laminate. It is not friction-stir welded.",
        hazUltimateKnockdown: null,
        hazYieldKnockdown: null,
        jointEfficiency: 1,
        parallelRetention: 1,
        sourceId: "ncamp-im7-8552",
        note: "Not weldable.",
      };
    default:
      return assertNever(materialId);
  }
}

export function transverseUltimateRetention(card: WeldCard): number | null {
  if (card.hazUltimateKnockdown === null) {
    return null;
  }
  return card.hazUltimateKnockdown * card.jointEfficiency;
}

export function transverseYieldRetention(card: WeldCard): { retention: number | null; assumed: boolean } {
  if (card.hazYieldKnockdown !== null) {
    return { retention: card.hazYieldKnockdown * card.jointEfficiency, assumed: false };
  }
  const ultimate = transverseUltimateRetention(card);
  if (ultimate === null) {
    return { retention: null, assumed: false };
  }
  return { retention: ultimate, assumed: true };
}
