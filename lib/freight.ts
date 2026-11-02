// Freight cost sums for production stages (one stage = one shipment of 40ft containers).
// Craftsman ships from Nhava Sheva (India); stages are grouped by their destination port.
import type { ProductionStage } from "@/lib/database.types";
import { capacityMonth } from "@/lib/production";

export const ORIGIN_PORT = "Nhava Sheva";
export const DESTINATION_PORTS = ["Brisbane", "Sydney", "Melbourne"] as const;

const n = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? 0 : Number(value) || 0);

// Normalises free-text destinations ("Melboune", "sydney") to a port name, or null if unknown.
export function destinationPort(destination: string | null | undefined) {
  const key = (destination ?? "").trim().toLowerCase();
  return DESTINATION_PORTS.find(port => key.startsWith(port.slice(0, 3).toLowerCase())) ?? null;
}

export type FreightInput = Pick<ProductionStage, "container_quantity" | "ocean_freight_usd" | "peak_season_surcharge_usd" | "other_surcharges_usd" | "local_charges_aud" | "usd_aud_rate">;

// USD all-in sea rate per container (ocean + peak season + other surcharges); null when no ocean freight is entered.
export function seaRateUsd(stage: FreightInput) {
  if (stage.ocean_freight_usd === null || stage.ocean_freight_usd === undefined) return null;
  return n(stage.ocean_freight_usd) + n(stage.peak_season_surcharge_usd) + n(stage.other_surcharges_usd);
}

export function freightTotals(stage: FreightInput) {
  const containers = n(stage.container_quantity);
  const rate = seaRateUsd(stage);
  const seaUsd = rate === null ? null : rate * containers;
  const fx = stage.usd_aud_rate ? n(stage.usd_aud_rate) : null;
  const seaAud = seaUsd !== null && fx ? seaUsd * fx : null;
  const localAud = stage.local_charges_aud === null || stage.local_charges_aud === undefined ? null : n(stage.local_charges_aud) * containers;
  const hasAny = seaUsd !== null || localAud !== null;
  // The AUD total needs an exchange rate whenever there are USD charges.
  const totalAud = !hasAny || (seaUsd !== null && seaAud === null) ? null : (seaAud ?? 0) + (localAud ?? 0);
  return { containers, seaRateUsd: rate, seaUsd, seaAud, localAud, totalAud, fx };
}

export type SpendMonth = { month: string; label: string; totalAud: number; stages: number; missingFx: number; tentativeAud: number };

// Freight spend in AUD by planned dispatch month. Stages with USD charges but no exchange rate are counted in missingFx.
export function spendByMonth(stages: (ProductionStage & { isTentative: boolean })[], months: string[]): SpendMonth[] {
  return months.map(month => {
    const inMonth = stages.filter(stage => capacityMonth(stage.goods_ready_date) === month);
    let totalAud = 0, tentativeAud = 0, missingFx = 0, counted = 0;
    for (const stage of inMonth) {
      const totals = freightTotals(stage);
      if (totals.seaUsd !== null && totals.seaAud === null) { missingFx++; continue; }
      if (totals.totalAud === null) continue;
      counted++; totalAud += totals.totalAud;
      if (stage.isTentative) tentativeAud += totals.totalAud;
    }
    return { month, label: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`)), totalAud, stages: counted, missingFx, tentativeAud };
  });
}

export type RatePoint = { month: string; port: string; rateUsd: number; containers: number };

// Average USD all-in 40ft rate from Nhava Sheva per destination port and dispatch month, weighted by containers.
export function rateTrend(stages: ProductionStage[]): RatePoint[] {
  const buckets = new Map<string, { month: string; port: string; total: number; containers: number }>();
  for (const stage of stages) {
    const rate = seaRateUsd(stage), port = destinationPort(stage.destination);
    if (rate === null || !port || !stage.container_quantity) continue;
    const month = capacityMonth(stage.goods_ready_date), key = `${port}:${month}`;
    const bucket = buckets.get(key) ?? { month, port, total: 0, containers: 0 };
    bucket.total += rate * stage.container_quantity; bucket.containers += stage.container_quantity;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(b => ({ month: b.month, port: b.port, rateUsd: b.total / b.containers, containers: b.containers })).sort((a, b) => a.month.localeCompare(b.month));
}
