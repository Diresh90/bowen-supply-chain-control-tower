// Dashboard calculations. Everything here is derived from the live records,
// so the dashboard flags problems even when a manually set status is out of date.
import type { FreightBooking, OrderType, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride } from "@/lib/database.types";
import { orderTypeOf } from "@/lib/jobs";
import { addWeeks, capacityMetrics, capacityMonth, plannedBySupplierMonth, type CapacityStatus } from "@/lib/production";

// Standard lead times (weeks) used to estimate delivery for a new order.
export const STANDARD_WEEKS = { production: 5, dispatch: 2, transit: 6, delivery: 1 };

export const SHIPPED_STATUSES = ["Dispatched", "In Transit", "Completed"];
export const FREIGHT_DUE_DAYS = 21;
export const AWAITING_CONFIRMATION_DAYS = 14;

const DAY_MS = 86_400_000;

export type Severity = "high" | "medium" | "low";

export type AttentionItem = {
  id: string;
  severity: Severity;
  category: "Late" | "Freight to book" | "Freight off track" | "Status check" | "Waiting on supplier" | "Capacity" | "To plan";
  jobId: string | null;
  title: string;
  detail: string;
  href: string;
};

export type JobSummary = {
  job: ProcurementJob;
  orderType: OrderType;
  forecastOnSite: string | null;
  stages: ProductionStage[];
  ordered: number;
  planned: number;
  booked: number;
  shipped: number;
  toPlan: number;
  toBook: number;
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

function bookedByStage(bookings: FreightBooking[]) {
  return bookings.reduce<Record<string, number>>((totals, booking) => {
    totals[booking.production_stage_id] = (totals[booking.production_stage_id] || 0) + booking.container_quantity;
    return totals;
  }, {});
}

export function summariseJobs(jobs: ProcurementJob[], stages: ProductionStage[], bookings: FreightBooking[]): JobSummary[] {
  const booked = bookedByStage(bookings);
  return jobs.map(job => {
    // Tentative stages are not part of the confirmed plan yet.
    const jobStages = stages.filter(stage => stage.procurement_job_id === job.id && !stage.tentative);
    const jobBookings = bookings.filter(booking => booking.procurement_job_id === job.id);
    const ordered = job.total_containers ?? 0;
    const planned = jobStages.reduce((sum, stage) => sum + stage.container_quantity, 0);
    const bookedTotal = jobBookings.reduce((sum, booking) => sum + booking.container_quantity, 0);
    const shipped = jobBookings.filter(booking => SHIPPED_STATUSES.includes(booking.status)).reduce((sum, booking) => sum + booking.container_quantity, 0);
    const toBook = jobStages.reduce((sum, stage) => sum + Math.max(0, stage.container_quantity - (booked[stage.id] || 0)), 0);
    const worstLateDays = Math.max(0, ...jobStages.map(stage => lateDays(stage.timing_status)));
    const forecastOnSite = jobStages.reduce<string | null>((latest, stage) => !latest || stage.forecast_site_eta > latest ? stage.forecast_site_eta : latest, null);
    return {
      job, orderType: orderTypeOf(job), forecastOnSite, stages: jobStages, ordered, planned, booked: bookedTotal, shipped,
      toPlan: Math.max(0, ordered - planned), toBook, worstLateDays,
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

export function attentionItems(summaries: JobSummary[], bookings: FreightBooking[], capacity: CapacityRow[], today: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const booked = bookedByStage(bookings);

  for (const summary of summaries) {
    const { job } = summary;
    const label = jobLabel(job);
    const allShipped = summary.ordered > 0 && summary.shipped >= summary.ordered;

    if (summary.worstLateDays > 0 && !allShipped) {
      const stage = summary.stages.reduce((worst, current) => lateDays(current.timing_status) > lateDays(worst.timing_status) ? current : worst);
      items.push({
        id: `late-${job.id}`, severity: "high", category: "Late", jobId: job.id,
        title: `${label} is forecast ${plural(summary.worstLateDays, "day")} late`,
        detail: `${stage.stage_reference} arrives on site ${formatDate(stage.forecast_site_eta)}; required ${formatDate(stage.required_site_date)}.`,
        href: "/production",
      });
    }

    for (const stage of summary.stages) {
      const unbooked = stage.container_quantity - (booked[stage.id] || 0);
      if (unbooked <= 0) continue;
      const daysToEtd = daysBetween(today, stage.planned_etd);
      if (daysToEtd > FREIGHT_DUE_DAYS) continue;
      items.push({
        id: `book-${stage.id}`, severity: daysToEtd < 0 ? "high" : "medium", category: "Freight to book", jobId: job.id,
        title: `${plural(unbooked, "container")} not booked for ${label}`,
        detail: daysToEtd < 0
          ? `${stage.stage_reference} ETD was ${formatDate(stage.planned_etd)} (${plural(-daysToEtd, "day")} ago).`
          : `${stage.stage_reference} ETD ${formatDate(stage.planned_etd)} (in ${plural(daysToEtd, "day")}).`,
        href: `/freight?stage=${stage.id}`,
      });
    }

    if (job.status === "Fully Dispatched" && !allShipped) {
      items.push({
        id: `status-dispatched-${job.id}`, severity: "medium", category: "Status check", jobId: job.id,
        title: `${label} is marked Fully Dispatched`,
        detail: `But only ${summary.shipped} of ${summary.ordered} containers have a dispatched freight booking.`,
        href: "/procurement",
      });
    } else if (job.status === "Awaiting Confirmation" && summary.stages.length > 0) {
      items.push({
        id: `status-awaiting-${job.id}`, severity: "medium", category: "Status check", jobId: job.id,
        title: `${label} is still Awaiting Confirmation`,
        detail: `But ${plural(summary.planned, "container")} are already in the production plan.`,
        href: "/procurement",
      });
    } else if ((job.status === "In Production" || job.status === "Production Completed") && summary.stages.length === 0) {
      items.push({
        id: `status-noplan-${job.id}`, severity: "medium", category: "Status check", jobId: job.id,
        title: `${label} is marked ${job.status}`,
        detail: "But it has no production stages planned.",
        href: "/production",
      });
    }

    if (job.status === "Awaiting Confirmation" && summary.stages.length === 0) {
      const waiting = daysBetween(job.created_at, today);
      if (waiting >= AWAITING_CONFIRMATION_DAYS) {
        items.push({
          id: `waiting-${job.id}`, severity: "low", category: "Waiting on supplier", jobId: job.id,
          title: `${label} awaiting confirmation for ${plural(waiting, "day")}`,
          detail: `Created ${formatDate(job.created_at)}${job.suppliers ? ` · ${job.suppliers.name}` : ""}.`,
          href: "/procurement",
        });
      }
    } else if (job.status !== "Fully Dispatched" && summary.toPlan > 0) {
      items.push({
        id: `plan-${job.id}`, severity: "low", category: "To plan", jobId: job.id,
        title: `${plural(summary.toPlan, "container")} of ${label} not in the production plan`,
        detail: `${summary.planned} of ${summary.ordered} ordered containers are planned.`,
        href: "/production",
      });
    }
  }

  const stageLate = new Map(summaries.flatMap(summary => summary.stages.map(stage => [stage.id, lateDays(stage.timing_status)] as const)));
  for (const booking of bookings) {
    if (booking.status === "Completed") continue;
    const label = booking.procurement_jobs ? jobLabel(booking.procurement_jobs) : booking.shipment_reference;
    if (booking.risk === "Off Track") {
      items.push({
        id: `offtrack-${booking.id}`, severity: "high", category: "Freight off track", jobId: booking.procurement_job_id,
        title: `${booking.shipment_reference} is off track`,
        detail: `${label} · ETA ${formatDate(booking.planned_eta)}${booking.comments ? ` · ${booking.comments}` : ""}.`,
        href: "/freight",
      });
    } else if ((stageLate.get(booking.production_stage_id) || 0) > 0) {
      items.push({
        id: `risk-${booking.id}`, severity: "medium", category: "Status check", jobId: booking.procurement_job_id,
        title: `${booking.shipment_reference} is marked On Track`,
        detail: `But its production stage is forecast ${plural(stageLate.get(booking.production_stage_id) || 0, "day")} late.`,
        href: "/freight",
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
