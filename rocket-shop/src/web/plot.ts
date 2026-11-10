import { psiFromPa } from "../units.js";
import type { StandRun } from "./stand.js";

export interface PlotSample {
  timeS: number;
  pressurePa: number;
  stressPa: number;
}

export interface PlotMarks {
  proofPa: number;
  burstRequiredPa: number;
  run: StandRun | null;
}

export class Plot {
  private samples: PlotSample[] = [];
  private marks: PlotMarks = { proofPa: 0, burstRequiredPa: 0, run: null };

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(marks: PlotMarks): void {
    this.samples = [];
    this.marks = marks;
    this.draw();
  }

  push(sample: PlotSample): void {
    this.samples.push(sample);
    if (this.samples.length > 360) this.samples.shift();
    this.draw();
  }

  draw(): void {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width < 2 || height < 2) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#161410";
    context.fillRect(0, 0, width, height);

    const pad = { left: 46, right: 42, top: 16, bottom: 22 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    context.strokeStyle = "#3c362e";
    context.lineWidth = 1;
    context.strokeRect(pad.left, pad.top, plotW, plotH);

    if (this.samples.length < 2) {
      context.fillStyle = "#a79e90";
      context.font = "12px IBM Plex Sans, sans-serif";
      context.fillText("Pressure and stress land here.", pad.left + 8, pad.top + 22);
      return;
    }

    const maxTime = Math.max(this.samples[this.samples.length - 1]?.timeS ?? 1, 1);
    const maxPressure = Math.max(...this.samples.map((sample) => sample.pressurePa), this.marks.proofPa, this.marks.burstRequiredPa, 1);
    const maxStress = Math.max(...this.samples.map((sample) => sample.stressPa), 1);
    const xOf = (time: number) => pad.left + (time / maxTime) * plotW;
    const yPressure = (pressure: number) => pad.top + plotH - (pressure / maxPressure) * plotH;
    const yStress = (stress: number) => pad.top + plotH - (stress / maxStress) * plotH;

    this.mark(context, yPressure(this.marks.proofPa), pad.left, plotW, "#b7c7a3");
    this.mark(context, yPressure(this.marks.burstRequiredPa), pad.left, plotW, "#e07a5f");

    this.line(context, this.samples, (sample) => xOf(sample.timeS), (sample) => yPressure(sample.pressurePa), "#e4b15a");
    this.line(context, this.samples, (sample) => xOf(sample.timeS), (sample) => yStress(sample.stressPa), "#8fb4c9");

    context.fillStyle = "#a79e90";
    context.font = "11px IBM Plex Sans, sans-serif";
    context.fillText(`${Math.round(psiFromPa(maxPressure))} psi`, 4, pad.top + 10);
    context.fillText("0", 4, pad.top + plotH);
    context.fillText(`${(maxStress / 1e6).toFixed(0)} MPa`, width - pad.right + 4, pad.top + 10);
    if (width < 460) return;
    context.fillStyle = "#e4b15a";
    context.fillText("pressure", pad.left + 6, height - 6);
    context.fillStyle = "#8fb4c9";
    context.fillText("von Mises", pad.left + 72, height - 6);
    context.fillStyle = "#b7c7a3";
    context.fillText("proof", pad.left + 150, height - 6);
    context.fillStyle = "#e07a5f";
    context.fillText("burst req.", pad.left + 196, height - 6);
  }

  private line(
    context: CanvasRenderingContext2D,
    samples: PlotSample[],
    xOf: (sample: PlotSample) => number,
    yOf: (sample: PlotSample) => number,
    color: string,
  ): void {
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = xOf(sample);
      const y = yOf(sample);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = color;
    context.lineWidth = 1.75;
    context.stroke();
  }

  private mark(context: CanvasRenderingContext2D, y: number, left: number, width: number, color: string): void {
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + width, y);
    context.stroke();
    context.restore();
  }
}
