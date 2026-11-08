// Freight cost sums for production stages (one stage = one shipment of 40ft containers).
// Craftsman ships from Nhava Sheva (India); stages are grouped by their destination port.
import type { FreightRate, ProductionStage } from "@/lib/database.types";
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

// entered = from freight on Dispatch Plan stages; history = imported monthly market rates.
// Dashboard rate lanes, all into Melbourne. Craftsman ships from Nhava Sheva; Shanghai is market history for comparison.
export const RATE_LANES = [
  { lane: "Nhava Sheva → MEL", originCode: "NSA" },
  { lane: "Shanghai → MEL", originCode: "CNSHA" },
] as const;
export type RateLane = (typeof RATE_LANES)[number]["lane"];

// entered = from freight on Dispatch Plan stages; history = imported monthly market rates.
export type RatePoint = { month: string; lane: RateLane; rateUsd: number; containers: number; source: "entered" | "history" };

// Imported historical 40ft rates into Melbourne for the dashboard lanes.
export function historicalRates(rates: FreightRate[]): RatePoint[] {
  const points: RatePoint[] = [];
  for (const rate of rates) {
    const lane = RATE_LANES.find(item => item.originCode === rate.origin_code)?.lane;
    if (!lane || rate.original_currency !== "USD" || rate.sea_freight_rate_original === null || !/^40/.test(rate.container_type ?? "40")) continue;
    if (destinationPort(rate.destination?.name) !== "Melbourne") continue;
    points.push({ month: capacityMonth(rate.rate_month), lane, rateUsd: Number(rate.sea_freight_rate_original), containers: 0, source: "history" });
  }
  return points;
}

// Rate trend per lane and month: rates entered on stages, falling back to imported history for months without them.
export function rateTrend(stages: ProductionStage[], history: RatePoint[] = []): RatePoint[] {
  const entered = enteredRates(stages);
  const covered = new Set(entered.map(point => `${point.lane}:${point.month}`));
  return [...entered, ...history.filter(point => !covered.has(`${point.lane}:${point.month}`))].sort((a, b) => a.month.localeCompare(b.month));
}

// Average USD all-in 40ft rate on stages shipping Nhava Sheva → Melbourne, per dispatch month, weighted by containers.
function enteredRates(stages: ProductionStage[]): RatePoint[] {
  const buckets = new Map<string, { month: string; total: number; containers: number }>();
  for (const stage of stages) {
    const rate = seaRateUsd(stage);
    if (rate === null || destinationPort(stage.destination) !== "Melbourne" || !stage.container_quantity) continue;
    const month = capacityMonth(stage.goods_ready_date);
    const bucket = buckets.get(month) ?? { month, total: 0, containers: 0 };
    bucket.total += rate * stage.container_quantity; bucket.containers += stage.container_quantity;
    buckets.set(month, bucket);
  }
  return [...buckets.values()].map(b => ({ month: b.month, lane: "Nhava Sheva → MEL" as const, rateUsd: b.total / b.containers, containers: b.containers, source: "entered" as const }));
}
