/** International avoirdupois pound, exact. */
export const KG_PER_LB = 0.45359237;

/** International inch, exact. */
export const M_PER_IN = 0.0254;

/** Standard gravity, exact, used to define the pound-force. */
export const STANDARD_GRAVITY_M_PER_S2 = 9.80665;

export const N_PER_LBF = KG_PER_LB * STANDARD_GRAVITY_M_PER_S2;

export const PA_PER_PSI = N_PER_LBF / (M_PER_IN * M_PER_IN);

export const PA_PER_KSI = PA_PER_PSI * 1000;

export const KG_PER_M3_PER_LB_PER_IN3 = KG_PER_LB / M_PER_IN ** 3;

/** International Table BTU. */
export const J_PER_BTU_IT = 1055.05585262;

export const S_PER_HOUR = 3600;

export const M2_PER_FT2 = (M_PER_IN * 12) ** 2;

/**
 * Multiply a conductivity in BTU·in/(h·ft²·°F) by this to get W/(m·K).
 * One degree Fahrenheit is 5/9 of a kelvin.
 */
export const W_PER_MK_PER_BTU_IN = (J_PER_BTU_IT * M_PER_IN) / (S_PER_HOUR * M2_PER_FT2 * (5 / 9));

export function fahrenheitToKelvin(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9 + 273.15;
}

export function ksiToPa(ksi: number): number {
  return ksi * PA_PER_KSI;
}

export function psiFromPa(pa: number): number {
  return pa / PA_PER_PSI;
}

export function formatPsi(pa: number): string {
  return `${Math.round(psiFromPa(pa)).toLocaleString("en-US")} psi`;
}

export function formatMpa(pa: number): string {
  const mpa = pa / 1e6;
  const digits = mpa >= 100 ? 0 : 1;
  return `${mpa.toFixed(digits)} MPa`;
}

export function formatKg(kg: number): string {
  return `${kg.toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`;
}

export function formatUsd(usd: number): string {
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
