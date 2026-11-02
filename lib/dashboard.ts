// Dashboard calculations. Everything here is derived from the live records: each job's status and
// progress come from its stages' dispatch statuses, set on the Dispatch Plan.
import type { OrderType, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride } from "@/lib/database.types";
import { type JobStatus, isDispatched, jobStatusOf, orderTypeOf, stageStatusOf } from "@/lib/jobs";
import { addWeeks, capacityMetrics, capacityMonth, plannedBySupplierMonth, type CapacityStatus } from "@/lib/production";

// Standard lead times (weeks) used to estimate delivery for a new order.
export const STANDARD_WEEKS = { production: 5, dispatch: 2, transit: 6, delivery: 1 };

export const AWAITING_CONFIRMATION_DAYS = 14;

const DAY_MS = 86_400_000;

export type Severity = "high" | "medium" | "low";

export type AttentionItem = {
  id: string;
  severity: Severity;
  category: "Late" | "Update dispatch" | "Waiting on supplier" | "Capacity" | "To plan";
  jobId: string | null;
  title: string;
  detail: string;
  href: string;
};

export type JobSummary = {
  job: ProcurementJob;
  status: JobStatus;
  orderType: OrderType;
  forecastOnSite: string | null;
  // Confirmed stages (not tentative).
  stages: ProductionStage[];
  currentStage: string | null;
  ordered: number;
  planned: number;
  dispatched: number;
  arrived: number;
  tentative: number;
  toPlan: number;
  worstLateDays: number;
  timing: "Not planned" | "Within target" | "Late";
};

export type CapacityRow = {
  supplier: Pick<Supplier, "id" | "name">;
  months: { month: string; label: string; capacity: number | null; planned: number; free: number | null; status: CapacityStatus }[];
};

export function lateDays(timingStatus: string | null | undefined) {
  const match = /^Late (\d+)/.exec(timingStatus ?? "");
  return match ? Number(match[1]) : 0;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}

export function jobLabel(job: Pick<ProcurementJob, "sales_order_number" | "client_name">) {
  const order = job.sales_order_number?.trim();
  return order && order.toUpperCase() !== "NA" ? order : job.client_name;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function summariseJobs(jobs: ProcurementJob[], stages: ProductionStage[]): JobSummary[] {
  return jobs.map(job => {
    const all = stages.filter(stage => stage.procurement_job_id === job.id).map(stage => ({ ...stage, procurement_jobs: stage.procurement_jobs ?? job }));
    const jobStages = all.filter(stage => stageStatusOf(stage) !== "Tentative");
    const ordered = job.total_containers ?? 0;
    const sum = (list: ProductionStage[]) => list.reduce((n, stage) => n + stage.container_quantity, 0);
    const planned = sum(jobStages);
    const dispatched = sum(jobStages.filter(isDispatched));
    const arrived = sum(jobStages.filter(stage => stageStatusOf(stage) === "Arrived"));
    const tentative = sum(all.filter(stage => stageStatusOf(stage) === "Tentative"));
    const notArrived = jobStages.filter(stage => stageStatusOf(stage) !== "Arrived");
    const worstLateDays = Math.max(0, ...notArrived.map(stage => lateDays(stage.timing_status)));
    const forecastOnSite = jobStages.reduce<string | null>((latest, stage) => !latest || stage.forecast_site_eta > latest ? stage.forecast_site_eta : latest, null);
    // The stage the job is up to: the earliest one not yet arrived, tentative included.
    const next = all.filter(stage => stageStatusOf(stage) !== "Arrived").sort((a, b) => a.goods_ready_date.localeCompare(b.goods_ready_date))[0];
    const currentStage = next ? `${next.stage_reference.replace(job.client_name, "").trim() || next.stage_reference} · ${stageStatusOf(next)}` : jobStages.length ? "All arrived" : null;
    return {
      job, status: jobStatusOf(job, stages), orderType: orderTypeOf(job), forecastOnSite, stages: jobStages, currentStage, ordered, planned, dispatched, arrived, tentative,
      toPlan: Math.max(0, ordered - planned), worstLateDays,
      timing: jobStages.length === 0 ? "Not planned" : worstLateDays > 0 ? "Late" : "Within target",
    };
  });
}

export function capacityRows(suppliers: Supplier[], overrides: SupplierCapacityOverride[], stages: ProductionStage[], monthsAhead = 3, now = new Date()): CapacityRow[] {
  const planned = plannedBySupplierMonth(stages);
  const months = Array.from({ length: monthsAhead }, (_, offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)));
  return suppliers
    .map(supplier => ({
      supplier,
      months: months.map(date => {
        const month = capacityMonth(date);
        const capacity = overrides.find(row => row.supplier_id === supplier.id && row.capacity_month === month)?.container_capacity ?? null;
        const metrics = capacityMetrics(capacity, planned[`${supplier.id}:${month}`] || 0);
        return { month, label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date), capacity, planned: metrics.planned, free: metrics.remaining, status: metrics.status };
      }),
    }))
    // Only show suppliers that have capacity set or work planned in the window.
    .filter(row => row.months.some(month => month.capacity !== null || month.planned > 0));
}

export function attentionItems(summaries: JobSummary[], capacity: CapacityRow[], today: string): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const summary of summaries) {
    const { job } = summary;
    const label = jobLabel(job);
    const allArrived = summary.ordered > 0 && summary.arrived >= summary.ordered;

    if (summary.worstLateDays > 0 && !allArrived) {
      const stage = summary.stages.reduce((worst, current) => lateDays(current.timing_status) > lateDays(worst.timing_status) ? current : worst);
      items.push({
        id: `late-${job.id}`, severity: "high", category: "Late", jobId: job.id,
        title: `${label} is forecast ${plural(summary.worstLateDays, "day")} late`,
        detail: `${stage.stage_reference} arrives on site ${formatDate(stage.forecast_site_eta)}; required ${formatDate(stage.required_site_date)}.`,
        href: "/production",
      });
    }

    // Confirmed stages whose planned dispatch date has passed but are not marked dispatched yet.
    for (const stage of summary.stages) {
      if (stageStatusOf(stage) !== "Confirmed" || stage.goods_ready_date >= today) continue;
      items.push({
        id: `dispatch-${stage.id}`, severity: "medium", category: "Update dispatch", jobId: job.id,
        title: `Has ${label} ${stage.stage_reference.replace(job.client_name, "").trim() || stage.stage_reference} dispatched?`,
        detail: `Planned dispatch was ${formatDate(stage.goods_ready_date)} (${plural(daysBetween(stage.goods_ready_date, today), "day")} ago). Update its status on the Dispatch Plan.`,
        href: "/production",
      });
    }

    if (summary.status === "Awaiting Confirmation") {
      const waiting = daysBetween(job.created_at, today);
      if (waiting >= AWAITING_CONFIRMATION_DAYS) {
        items.push({
          id: `waiting-${job.id}`, severity: "low", category: "Waiting on supplier", jobId: job.id,
          title: `${label} awaiting confirmation for ${plural(waiting, "day")}`,
          detail: `Created ${formatDate(job.created_at)}${job.suppliers ? ` · ${job.suppliers.name}` : ""}.`,
          href: "/procurement",
        });
      }
    } else if (summary.status !== "Fully Dispatched" && summary.toPlan > 0) {
      items.push({
        id: `plan-${job.id}`, severity: "low", category: "To plan", jobId: job.id,
        title: summary.tentative >= summary.toPlan
          ? `${plural(summary.toPlan, "container")} of ${label} still tentative`
          : `${plural(summary.toPlan, "container")} of ${label} not confirmed on the dispatch plan`,
        detail: `${summary.planned} of ${summary.ordered} ordered containers have a confirmed stage${summary.tentative ? `; ${summary.tentative} are tentative` : ""}.`,
        href: "/production",
      });
    }
  }

  for (const row of capacity) {
    for (const month of row.months) {
      if (month.status !== "Over Capacity") continue;
      items.push({
        id: `capacity-${row.supplier.id}-${month.month}`, severity: "high", category: "Capacity", jobId: null,
        title: `${row.supplier.name} is over capacity in ${month.label}`,
        detail: `${month.planned} containers planned against capacity of ${month.capacity}.`,
        href: "/production",
      });
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export type NewOrderEstimate = { dispatch: string; etd: string; onSite: string; month: string; free: number } | { etd: null; reason: string };

// Earliest delivery for a new order confirmed today: standard production time to the first dispatch
// month with enough free supplier capacity, then loading / origin transport, sea transit and delivery.
export function estimateNewOrder(row: CapacityRow | undefined, containers: number, today: string): NewOrderEstimate {
  if (!row) return { etd: null, reason: "No supplier capacity has been set." };
  const earliestDispatch = addWeeks(today, STANDARD_WEEKS.production);
  const month = row.months.find(m => m.month >= capacityMonth(earliestDispatch) && m.free !== null && m.free >= containers);
  if (!month) {
    const lastSet = [...row.months].reverse().find(m => m.capacity !== null);
    const unset = row.months.some(m => m.month >= capacityMonth(earliestDispatch) && m.capacity === null);
    return { etd: null, reason: unset && lastSet
      ? `No month up to ${lastSet.label} has ${containers} containers free, and capacity isn't set after ${lastSet.label} (Production → Capacity).`
      : `No month in the next ${row.months.length} has ${containers} containers free.` };
  }
  const dispatch = month.month > earliestDispatch ? month.month : earliestDispatch;
  const etd = addWeeks(dispatch, STANDARD_WEEKS.dispatch);
  return { dispatch, etd, onSite: addWeeks(etd, STANDARD_WEEKS.transit + STANDARD_WEEKS.delivery), month: month.label, free: month.free ?? 0 };
}

// Estimated dispatch (ETD) date for an order still awaiting confirmation, so it can be shown
// as a tentative booking: project orders work back from the required on-site date, stock orders
// (or orders without a date) use the earliest possible dispatch.
export function pendingEtd(job: ProcurementJob, today: string) {
  const earliest = addWeeks(today, STANDARD_WEEKS.production + STANDARD_WEEKS.dispatch);
  if (orderTypeOf(job) !== "Project" || !job.required_onsite_date) return earliest;
  const fromSite = addWeeks(job.required_onsite_date, -(STANDARD_WEEKS.transit + STANDARD_WEEKS.delivery));
  return fromSite > earliest ? fromSite : earliest;
}

// Estimated dispatch date (goods leaving the supplier) for an order awaiting confirmation.
export function pendingDispatch(job: ProcurementJob, today: string) {
  return addWeeks(pendingEtd(job, today), -STANDARD_WEEKS.dispatch);
}
