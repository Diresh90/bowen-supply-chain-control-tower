export type ProductionScheduleInput = {
  productionStart: string;
  productionWeeks: number;
  dispatchWeeks: number;
  transitWeeks: number;
  destinationWeeks: number;
  requiredSiteDate: string;
};

const DAY_MS = 86_400_000;

export function addWeeks(date: string, weeks: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + weeks * 7);
  return value.toISOString().slice(0, 10);
}

export function calculateProductionSchedule(input: ProductionScheduleInput) {
  const productionFinish = addWeeks(input.productionStart, input.productionWeeks);
  const plannedEtd = addWeeks(productionFinish, input.dispatchWeeks);
  const portEta = addWeeks(plannedEtd, input.transitWeeks);
  const forecastSiteEta = addWeeks(portEta, input.destinationWeeks);
  const difference = Math.round(
    (new Date(`${forecastSiteEta}T00:00:00Z`).getTime() -
      new Date(`${input.requiredSiteDate}T00:00:00Z`).getTime()) /
      DAY_MS,
  );

  return {
    production_finish: productionFinish,
    goods_ready_date: productionFinish,
    planned_etd: plannedEtd,
    port_eta: portEta,
    forecast_site_eta: forecastSiteEta,
    timing_status: difference <= 0 ? "Within target" : `Late ${difference} day${difference === 1 ? "" : "s"}`,
  };
}

export function mondayOf(date: Date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type CapacityStatus = "Capacity Not Set" | "Available" | "Near Capacity" | "Full" | "Over Capacity";

export function capacityMonth(value: string | Date) {
  const key = typeof value === "string" ? value : dateKey(value);
  return `${key.slice(0, 7)}-01`;
}

export function capacityMetrics(capacity: number | null, planned: number) {
  if (capacity === null) return { capacity, planned, remaining: null, utilisation: null, status: "Capacity Not Set" as CapacityStatus };
  const utilisation = capacity === 0 ? (planned === 0 ? 0 : Infinity) : planned / capacity * 100;
  const status: CapacityStatus = utilisation > 100 ? "Over Capacity" : utilisation === 100 ? "Full" : utilisation >= 80 ? "Near Capacity" : "Available";
  return { capacity, planned, remaining: capacity - planned, utilisation, status };
}

export function plannedBySupplierMonth<T extends { supplier_id: string; planned_etd: string; container_quantity: number }>(stages: T[]) {
  return stages.reduce<Record<string, number>>((totals, stage) => {
    const key = `${stage.supplier_id}:${capacityMonth(stage.planned_etd)}`;
    totals[key] = (totals[key] || 0) + stage.container_quantity;
    return totals;
  }, {});
}
