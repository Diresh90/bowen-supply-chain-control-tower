"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { ProcurementJob, ProductionPriority, ProductionStage, productionPriorities, Supplier, SupplierCapacityOverride, SupplierProductionSetting } from "@/lib/database.types";
import { calculateProductionSchedule, capacityMetrics, capacityMonth, dateKey, mondayOf, plannedBySupplierMonth } from "@/lib/production";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;
const WEEK_WIDTH = 60;
const MAX_RANGE_MONTHS = 24;
const visibleStatuses = new Set(["Confirmed", "In Production", "Production Completed", "Fully Dispatched"]);
const plannableStatuses = new Set(["Confirmed", "In Production"]);
const emptyForm = {
  procurement_job_id: "", stage_reference: "", container_quantity: "", priority: "Normal" as ProductionPriority,
  queue_sequence: "1", destination: "", production_start: "", production_duration_weeks: "5",
  dispatch_duration_weeks: "1", transit_duration_weeks: "6", destination_duration_weeks: "1",
  required_site_date: "", allocation_override: false,
};

type Tab = "available" | "plan" | "capacity";
type StageForm = typeof emptyForm;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function jobLabel(job: ProcurementJob) {
  return job.sales_order_number || job.client_name;
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addUtcMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export default function ProductionPage() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [capacitySettings, setCapacitySettings] = useState<SupplierProductionSetting[]>([]);
  const [capacityOverrides, setCapacityOverrides] = useState<SupplierCapacityOverride[]>([]);
  const [capacityReady, setCapacityReady] = useState(true);
  const [freightAllocated, setFreightAllocated] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState("all");
  const [tab, setTab] = useState<Tab>("available");
  const [form, setForm] = useState<StageForm>(emptyForm);
  const [editing, setEditing] = useState<ProductionStage | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const [jobRows, stageRows, supplierRows] = await Promise.all([
        supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&status=neq.Awaiting%20Confirmation&order=required_onsite_date.asc.nullslast"),
        supabaseRequest<ProductionStage[]>("production_stages?select=*,procurement_jobs(*,suppliers(id,name,active)),suppliers(id,name,active)&order=queue_sequence.asc,production_start.asc"),
        supabaseRequest<Supplier[]>("suppliers?select=*&order=name.asc"),
      ]);
      setJobs(jobRows.filter(job => job.status && visibleStatuses.has(job.status)));
      setStages(stageRows); setSuppliers(supplierRows);
      try {
        const freightRows = await supabaseRequest<{ production_stage_id: string; container_quantity: number }[]>("freight_bookings?select=production_stage_id,container_quantity&archived_at=is.null");
        setFreightAllocated(freightRows.reduce<Record<string, number>>((totals, booking) => { totals[booking.production_stage_id] = (totals[booking.production_stage_id] || 0) + booking.container_quantity; return totals; }, {}));
      } catch { setFreightAllocated({}); }
      try {
        const [settings, overrides] = await Promise.all([
          supabaseRequest<SupplierProductionSetting[]>("supplier_production_settings?select=*"),
          supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*&order=capacity_month.asc"),
        ]);
        setCapacitySettings(settings); setCapacityOverrides(overrides); setCapacityReady(true);
      } catch { setCapacityReady(false); }
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const allocatedByJob = useMemo(() => stages.reduce<Record<string, number>>((totals, stage) => {
    totals[stage.procurement_job_id] = (totals[stage.procurement_job_id] || 0) + stage.container_quantity;
    return totals;
  }, {}), [stages]);
  const filteredJobs = jobs.filter(job => supplierId === "all" || job.supplier_id === supplierId);
  const filteredStages = stages.filter(stage => supplierId === "all" || stage.supplier_id === supplierId);
  const productionSuppliers = suppliers.filter(supplier => supplier.active);

  function startAdd(job: ProcurementJob) {
    const allocated = allocatedByJob[job.id] || 0;
    const remaining = Math.max(0, (job.total_containers || 0) - allocated);
    setEditing(null);
    setForm({ ...emptyForm, procurement_job_id: job.id, stage_reference: `${job.client_name} Stage ${stages.filter(s => s.procurement_job_id === job.id).length + 1}`, container_quantity: remaining ? String(remaining) : "", queue_sequence: String(stages.length + 1), required_site_date: job.required_onsite_date || "" });
    setOpen(true); setMessage(null);
  }

  function startEdit(stage: ProductionStage) {
    setEditing(stage);
    setForm({ procurement_job_id: stage.procurement_job_id, stage_reference: stage.stage_reference, container_quantity: String(stage.container_quantity), priority: stage.priority, queue_sequence: String(stage.queue_sequence), destination: stage.destination || "", production_start: stage.production_start, production_duration_weeks: String(stage.production_duration_weeks), dispatch_duration_weeks: String(stage.dispatch_duration_weeks), transit_duration_weeks: String(stage.transit_duration_weeks), destination_duration_weeks: String(stage.destination_duration_weeks), required_site_date: stage.required_site_date, allocation_override: stage.allocation_override });
    setOpen(true); setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const job = jobs.find(item => item.id === form.procurement_job_id);
    if (!job?.supplier_id) { setMessage({ text: "This procurement job must have an approved supplier before it can be planned.", kind: "error" }); return; }
    const quantity = Number(form.container_quantity);
    const allocatedElsewhere = (allocatedByJob[job.id] || 0) - (editing?.container_quantity || 0);
    const total = job.total_containers;
    if (total !== null && allocatedElsewhere + quantity > total && !form.allocation_override) {
      setMessage({ text: `This stage would allocate ${allocatedElsewhere + quantity} of ${total} containers. Review the warning and confirm the override to continue.`, kind: "error" });
      return;
    }
    const schedule = calculateProductionSchedule({ productionStart: form.production_start, productionWeeks: Number(form.production_duration_weeks), dispatchWeeks: Number(form.dispatch_duration_weeks), transitWeeks: Number(form.transit_duration_weeks), destinationWeeks: Number(form.destination_duration_weeks), requiredSiteDate: form.required_site_date });
    const payload = { procurement_job_id: job.id, supplier_id: job.supplier_id, stage_reference: form.stage_reference.trim(), container_quantity: quantity, priority: form.priority, queue_sequence: Number(form.queue_sequence), destination: form.destination.trim() || null, production_start: form.production_start, production_duration_weeks: Number(form.production_duration_weeks), dispatch_duration_weeks: Number(form.dispatch_duration_weeks), transit_duration_weeks: Number(form.transit_duration_weeks), destination_duration_weeks: Number(form.destination_duration_weeks), required_site_date: form.required_site_date, allocation_override: form.allocation_override, ...schedule };
    setSaving(true); setMessage(null);
    try {
      if (editing) await supabaseRequest(`production_stages?id=eq.${editing.id}`, { method: "PATCH", body: payload });
      else await supabaseRequest("production_stages", { method: "POST", body: payload });
      setOpen(false); await load(); setTab("plan"); setMessage({ text: `Production stage ${editing ? "updated" : "created"} in Supabase.`, kind: "success" });
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setSaving(false); }
  }

  async function remove(stage: ProductionStage) {
    if (!confirm(`Delete ${stage.stage_reference}? The procurement job will be preserved.`)) return;
    try { await supabaseRequest(`production_stages?id=eq.${stage.id}`, { method: "DELETE" }); await load(); setMessage({ text: "Production stage deleted. Its containers are available for planning again.", kind: "success" }); }
    catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
  }

  const selectedJob = jobs.find(job => job.id === form.procurement_job_id);
  const otherAllocation = selectedJob ? (allocatedByJob[selectedJob.id] || 0) - (editing?.container_quantity || 0) : 0;
  const proposedAllocation = otherAllocation + (Number(form.container_quantity) || 0);
  const exceedsTotal = selectedJob?.total_containers !== null && selectedJob?.total_containers !== undefined && proposedAllocation > selectedJob.total_containers;
  const capacityForecast = useMemo(() => {
    if (!selectedJob?.supplier_id || !form.production_start || !form.required_site_date) return null;
    const schedule = calculateProductionSchedule({ productionStart: form.production_start, productionWeeks: Number(form.production_duration_weeks), dispatchWeeks: Number(form.dispatch_duration_weeks), transitWeeks: Number(form.transit_duration_weeks), destinationWeeks: Number(form.destination_duration_weeks), requiredSiteDate: form.required_site_date });
    const month = capacityMonth(schedule.planned_etd);
    const capacity = capacityOverrides.find(row => row.supplier_id === selectedJob.supplier_id && row.capacity_month === month)?.container_capacity ?? null;
    const alreadyPlanned = stages.filter(stage => stage.supplier_id === selectedJob.supplier_id && capacityMonth(stage.planned_etd) === month && stage.id !== editing?.id).reduce((sum, stage) => sum + stage.container_quantity, 0);
    return { month, capacity, alreadyPlanned, stage: Number(form.container_quantity) || 0, metrics: capacityMetrics(capacity, alreadyPlanned + (Number(form.container_quantity) || 0)) };
  }, [selectedJob, form, capacityOverrides, stages, editing]);

  return <AppShell>
    <header className="page-header production-header"><div><p className="eyebrow">SUPPLIER PLANNING</p><h1>Production</h1><p>Allocate procurement containers and manage the end-to-end supplier production plan.</p></div><div className="supplier-filter"><label htmlFor="supplier-filter">Supplier</label><select id="supplier-filter" value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="all">All approved suppliers</option>{productionSuppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div></header>
    {message && <Notice message={message.text} kind={message.kind} />}{configurationError() && !message && <Notice message={configurationError()!} />}
    <section className="metric-row production-metrics"><div className="metric"><span>Eligible jobs</span><strong>{filteredJobs.length}</strong></div><div className="metric"><span>Production stages</span><strong>{filteredStages.length}</strong></div><div className="metric"><span>Containers allocated</span><strong>{filteredStages.reduce((sum, stage) => sum + stage.container_quantity, 0)}</strong></div></section>
    <div className="module-tabs" role="tablist"><button className={tab === "available" ? "selected" : ""} onClick={() => setTab("available")}>Available for Planning</button><button className={tab === "plan" ? "selected" : ""} onClick={() => setTab("plan")}>Production Plan</button><button className={tab === "capacity" ? "selected" : ""} onClick={() => setTab("capacity")}>Capacity</button></div>

    {tab === "available" && <AvailableJobs jobs={filteredJobs} allocatedByJob={allocatedByJob} loading={loading} onCreate={startAdd} />}
    {tab === "plan" && <><ProductionPlan stages={filteredStages} loading={loading} onEdit={startEdit} onDelete={remove} /><FreightAllocation stages={filteredStages} allocated={freightAllocated} /></>}
    {tab === "capacity" && <CapacityView supplierId={supplierId} suppliers={productionSuppliers} stages={stages} settings={capacitySettings} overrides={capacityOverrides} ready={capacityReady} onEdit={startEdit} onRefresh={load} onMessage={setMessage} />}

    {open && <div className="modal-backdrop" onMouseDown={() => !saving && setOpen(false)}><div className="modal production-modal" role="dialog" aria-modal="true" aria-labelledby="stage-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">PRODUCTION STAGE</p><h2 id="stage-title">{editing ? "Edit stage" : "Create stage"}</h2><p className="modal-context">{selectedJob ? `${jobLabel(selectedJob)} · ${selectedJob.client_name}` : "Linked procurement plan"}</p></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div><form onSubmit={save}><div className="form-grid stage-form">
      <label className="full">Procurement job<select required disabled={!!editing} value={form.procurement_job_id} onChange={e => { const job = jobs.find(item => item.id === e.target.value); setForm({ ...form, procurement_job_id: e.target.value, required_site_date: job?.required_onsite_date || "" }); }}><option value="">Select a job</option>{jobs.filter(job => plannableStatuses.has(job.status || "") && job.supplier_id).map(job => <option key={job.id} value={job.id}>{jobLabel(job)} — {job.client_name}</option>)}</select></label>
      <label>Stage reference *<input required value={form.stage_reference} onChange={e => setForm({...form, stage_reference:e.target.value})} /></label><label>Container quantity *<input required type="number" min="1" value={form.container_quantity} onChange={e => setForm({...form, container_quantity:e.target.value})} /></label>
      <label>Priority<select value={form.priority} onChange={e => setForm({...form, priority:e.target.value as ProductionPriority})}>{productionPriorities.map(priority => <option key={priority}>{priority}</option>)}</select></label><label>Queue sequence<input required type="number" min="1" value={form.queue_sequence} onChange={e => setForm({...form, queue_sequence:e.target.value})} /></label>
      <label className="full">Destination<input value={form.destination} onChange={e => setForm({...form, destination:e.target.value})} placeholder="Optional destination" /></label>
      <label>Production start *<input required type="date" value={form.production_start} onChange={e => setForm({...form, production_start:e.target.value})} /></label><label>Production duration (weeks)<input required type="number" min="0" value={form.production_duration_weeks} onChange={e => setForm({...form, production_duration_weeks:e.target.value})} /></label>
      <label>Dispatch duration (weeks)<input required type="number" min="0" value={form.dispatch_duration_weeks} onChange={e => setForm({...form, dispatch_duration_weeks:e.target.value})} /></label><label>Sea transit duration (weeks)<input required type="number" min="0" value={form.transit_duration_weeks} onChange={e => setForm({...form, transit_duration_weeks:e.target.value})} /></label>
      <label>Destination duration (weeks)<input required type="number" min="0" value={form.destination_duration_weeks} onChange={e => setForm({...form, destination_duration_weeks:e.target.value})} /></label><label>Required on-site date *<input required type="date" value={form.required_site_date} onChange={e => setForm({...form, required_site_date:e.target.value})} /></label>
      {exceedsTotal && <div className="allocation-warning full"><strong>Allocation warning</strong><span>This saves {proposedAllocation} containers against a procurement total of {selectedJob?.total_containers}. An explicit override is required.</span><label className="check"><input type="checkbox" checked={form.allocation_override} onChange={e => setForm({...form, allocation_override:e.target.checked})} /> Confirm allocation override</label></div>}
      {capacityForecast && <div className={`capacity-warning full ${capacityForecast.metrics.status === "Over Capacity" ? "danger" : ""}`}><strong>{formatDate(capacityForecast.month)} supplier capacity</strong><span>Capacity: {capacityForecast.capacity ?? "Not set"} · Already planned: {capacityForecast.alreadyPlanned} · This stage: {capacityForecast.stage} · Forecast: {capacityForecast.metrics.planned}</span>{capacityForecast.capacity !== null && <b>{capacityForecast.metrics.remaining! < 0 ? `OVER CAPACITY BY ${Math.abs(capacityForecast.metrics.remaining!)} CONTAINERS` : `Remaining after stage: ${capacityForecast.metrics.remaining}`}</b>}</div>}
      {form.production_start && form.required_site_date && <SchedulePreview form={form} />}
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving to Supabase…" : "Save production stage"}</button></div></form></div></div>}
  </AppShell>;
}

function AvailableJobs({ jobs, allocatedByJob, loading, onCreate }: { jobs: ProcurementJob[]; allocatedByJob: Record<string, number>; loading: boolean; onCreate: (job: ProcurementJob) => void }) {
  return <section className="panel"><div className="panel-title"><div><h2>Available for planning</h2><p>Confirmed and in-production orders can be allocated. Completed and dispatched orders remain visible as history.</p></div></div><div className="table-wrap"><table className="planning-table"><thead><tr><th>Job / Sales Order</th><th>Client</th><th>Supplier</th><th>Supplier PO</th><th>Destination</th><th>Required On-Site</th><th>Total</th><th>Allocated</th><th>Remaining</th><th>Status</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={11} className="empty">Loading production source data…</td></tr> : jobs.length === 0 ? <tr><td colSpan={11} className="empty"><strong>No eligible procurement jobs</strong><span>Jobs appear here after leaving Awaiting Confirmation.</span></td></tr> : jobs.map(job => { const allocated = allocatedByJob[job.id] || 0; const remaining = job.total_containers === null ? null : job.total_containers - allocated; const canPlan = plannableStatuses.has(job.status || "") && !!job.supplier_id && (remaining === null || remaining > 0); return <tr key={job.id}><td><strong>{job.sales_order_number || "—"}</strong></td><td>{job.client_name}</td><td>{job.suppliers?.name || "—"}</td><td>{job.supplier_po_number || "—"}</td><td>—</td><td>{formatDate(job.required_onsite_date)}</td><td>{job.total_containers ?? "—"}</td><td>{allocated}</td><td><strong className={remaining !== null && remaining < 0 ? "negative" : "remaining"}>{remaining ?? "—"}</strong></td><td><span className="badge status">{job.status}</span></td><td className="actions"><button disabled={!canPlan} title={!canPlan ? "This job is not open for new production planning" : ""} onClick={() => onCreate(job)}>＋ Create stage</button></td></tr>; })}</tbody></table></div></section>;
}

function FreightAllocation({ stages, allocated }: { stages: ProductionStage[]; allocated: Record<string, number> }) {
  return <section className="panel production-freight"><div className="panel-title"><div><h2>Freight allocation</h2><p>Production remains the source for freight. Create one or many bookings up to each stage total.</p></div></div><div className="table-wrap"><table><thead><tr><th>Production Stage</th><th>Job</th><th>Stage Containers</th><th>Allocated to Freight</th><th>Remaining for Freight</th><th /></tr></thead><tbody>{stages.map(stage => { const used = allocated[stage.id] || 0; const remaining = stage.container_quantity - used; return <tr key={stage.id}><td><strong>{stage.stage_reference}</strong></td><td>{stage.procurement_jobs.sales_order_number || stage.procurement_jobs.client_name}</td><td>{stage.container_quantity}</td><td>{used}</td><td className={remaining < 0 ? "negative" : "remaining"}><strong>{remaining}</strong></td><td className="actions">{remaining > 0 && <Link href={`/freight?stage=${stage.id}`}>＋ Create freight</Link>}</td></tr>; })}</tbody></table></div></section>;
}

function ProductionPlan({ stages, loading, onEdit, onDelete }: { stages: ProductionStage[]; loading: boolean; onEdit: (stage: ProductionStage) => void; onDelete: (stage: ProductionStage) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = dateKey(new Date());
  const defaultEnd = dateKey(addUtcMonths(utcDate(today), 6));
  const initialRange = { start: today, end: defaultEnd };
  const [range, setRange] = useState(initialRange);
  const [from, setFrom] = useState(initialRange.start);
  const [to, setTo] = useState(initialRange.end);
  const [rangeError, setRangeError] = useState("");
  const start = utcDate(range.start);
  const end = utcDate(range.end);
  const endExclusive = new Date(end.getTime() + DAY_MS);
  const totalDays = Math.max(1, (endExclusive.getTime() - start.getTime()) / DAY_MS);
  const timelineWidth = totalDays * (WEEK_WIDTH / 7);
  const weeks = useMemo(() => {
    const values: Date[] = [];
    for (let week = mondayOf(utcDate(range.start)); week <= utcDate(range.end); week = new Date(week.getTime() + WEEK_MS)) values.push(week);
    return values;
  }, [range]);
  const months = useMemo(() => {
    const values: { key: string; label: string; width: number }[] = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor < endExclusive) {
      const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      const visibleStart = Math.max(cursor.getTime(), start.getTime());
      const visibleEnd = Math.min(next.getTime(), endExclusive.getTime());
      values.push({ key: dateKey(cursor), label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor), width: ((visibleEnd - visibleStart) / DAY_MS) * (WEEK_WIDTH / 7) });
      cursor = next;
    }
    return values;
  }, [range]);
  const visibleStages = useMemo(() => stages.filter(stage => stage.production_start <= range.end && stage.forecast_site_eta >= range.start), [stages, range]);
  const outsideCount = stages.length - visibleStages.length;
  const scrollToDate = (date: Date) => scrollRef.current?.scrollTo({ left: Math.max(0, ((date.getTime() - start.getTime()) / DAY_MS) * (WEEK_WIDTH / 7) - WEEK_WIDTH), behavior: "smooth" });
  const move = (weeksToMove: number) => scrollRef.current?.scrollBy({ left: weeksToMove * WEEK_WIDTH, behavior: "smooth" });
  const todayVisible = today >= range.start && today <= range.end;
  const todayLeft = ((utcDate(today).getTime() - start.getTime()) / DAY_MS) * (WEEK_WIDTH / 7);
  function applyRange(nextStart = from, nextEnd = to) {
    if (!nextStart || !nextEnd) { setRangeError("Please select both a From and To date."); return; }
    const nextStartDate = utcDate(nextStart), nextEndDate = utcDate(nextEnd);
    if (nextEndDate < nextStartDate) { setRangeError("To date must be on or after From date."); return; }
    if (nextEndDate > addUtcMonths(nextStartDate, MAX_RANGE_MONTHS)) { setRangeError("Please select a date range of 24 months or less."); return; }
    setRangeError(""); setFrom(nextStart); setTo(nextEnd); setRange({ start: nextStart, end: nextEnd });
    sessionStorage.setItem("production-gantt-range", JSON.stringify({ start: nextStart, end: nextEnd }));
    scrollRef.current?.scrollTo({ left: 0 });
  }
  function quickRange(monthsAhead: number | "year") {
    const now = utcDate(today);
    const nextStart = monthsAhead === "year" ? `${now.getUTCFullYear()}-01-01` : today;
    const nextEnd = monthsAhead === "year" ? `${now.getUTCFullYear()}-12-31` : dateKey(addUtcMonths(now, monthsAhead));
    applyRange(nextStart, nextEnd);
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("production-gantt-range") || "null") as { start?: string; end?: string } | null;
      if (saved?.start && saved?.end) applyRange(saved.start, saved.end);
    } catch { /* Ignore an invalid browser preference and retain the safe default. */ }
    // This preference is intentionally restored only when the Gantt first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <section className="panel gantt-panel"><div className="panel-title gantt-title"><div><h2>Weekly production Gantt</h2><p>Monday-based weeks · daily-precision bars · select a row to edit.</p></div><div className="gantt-actions"><div className="gantt-legend"><span className="production">Production</span><span className="dispatch">Dispatch</span><span className="transit">Sea transit</span><span className="destination">Destination</span><span className="milestone">On-site</span></div><div className="timeline-controls"><button onClick={() => move(-4)}>← Previous</button>{todayVisible && <button onClick={() => scrollToDate(utcDate(today))}>Today</button>}<button onClick={() => move(4)}>Next →</button></div></div></div>
    <form className="gantt-range" onSubmit={event => { event.preventDefault(); applyRange(); }}><div className="gantt-date-fields"><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label><button className="primary" type="submit">Apply</button></div><div className="gantt-quick-ranges" aria-label="Quick date ranges"><button type="button" onClick={() => quickRange(3)}>3 Months</button><button type="button" onClick={() => quickRange(6)}>6 Months</button><button type="button" onClick={() => quickRange(12)}>12 Months</button><button type="button" onClick={() => quickRange("year")}>This Year</button></div>{rangeError && <p className="gantt-range-error" role="alert">{rangeError}</p>}<p className="gantt-range-summary">Showing {formatDate(range.start)} – {formatDate(range.end)}{outsideCount > 0 && ` · ${outsideCount} stage${outsideCount === 1 ? "" : "s"} outside selected range`}</p></form>
    <div className="gantt-board">
      <div className="gantt-fixed"><div className="gantt-fixed-month-spacer" /><div className="gantt-fixed-head"><span>Queue</span><span>Job / Order</span><span>Production Stage</span><span>Ctns</span><span>Destination</span><span>Required On-Site</span><span>Timing</span><span /></div>{loading ? <div className="gantt-side-empty">Loading plan…</div> : visibleStages.map(stage => <StageDetails key={stage.id} stage={stage} onEdit={onEdit} onDelete={onDelete} />)}</div>
      <div className="gantt-timeline" ref={scrollRef}><div className="timeline-canvas" style={{ width: timelineWidth } as CSSProperties}><div className="months-head">{months.map(month => <div key={month.key} style={{ width: month.width }}>{month.label}</div>)}</div><div className="weeks-head">{weeks.map(week => { const weekStart = Math.max(week.getTime(), start.getTime()); const weekEnd = Math.min(week.getTime() + WEEK_MS, endExclusive.getTime()); return <div key={dateKey(week)} style={{ width: ((weekEnd - weekStart) / DAY_MS) * (WEEK_WIDTH / 7) }}>W/C {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(week)}</div>; })}</div>{todayVisible && <span className="today-line" style={{ left: todayLeft }} title={`Today · ${formatDate(today)}`} />}{loading ? <div className="gantt-empty">Loading production plan…</div> : visibleStages.length === 0 ? <div className="gantt-empty"><strong>No production stages in this date range</strong><span>Choose another range to see scheduled activity.</span></div> : visibleStages.map(stage => <GanttRow key={stage.id} stage={stage} rangeStart={range.start} rangeEnd={range.end} onEdit={onEdit} />)}</div></div>
    </div>
  </section>;
}

function StageDetails({ stage, onEdit, onDelete }: { stage: ProductionStage; onEdit: (stage: ProductionStage) => void; onDelete: (stage: ProductionStage) => void }) {
  return <div className="stage-details" onClick={() => onEdit(stage)}><span className="queue">{stage.queue_sequence}</span><strong title={stage.procurement_jobs.client_name}>{stage.procurement_jobs.sales_order_number || stage.procurement_jobs.client_name}</strong><span title={stage.stage_reference}>{stage.stage_reference}</span><b>{stage.container_quantity}</b><span title={stage.destination || ""}>{stage.destination || "—"}</span><span>{formatDate(stage.required_site_date)}</span><span className={`timing ${stage.timing_status.startsWith("Late") ? "late" : ""}`}>{stage.timing_status}</span><button className="row-delete" onClick={event => { event.stopPropagation(); void onDelete(stage); }} aria-label={`Delete ${stage.stage_reference}`}>×</button></div>;
}

function GanttRow({ stage, rangeStart, rangeEnd, onEdit }: { stage: ProductionStage; rangeStart: string; rangeEnd: string; onEdit: (stage: ProductionStage) => void }) {
  const anchor = utcDate(rangeStart), rangeFinish = new Date(utcDate(rangeEnd).getTime() + DAY_MS);
  const px = (value: Date) => ((value.getTime() - anchor.getTime()) / DAY_MS) * (WEEK_WIDTH / 7);
  const segment = (className: string, start: string, finish: string, label: string, weeks: number) => {
    const visibleStart = new Date(Math.max(utcDate(start).getTime(), anchor.getTime()));
    const visibleFinish = new Date(Math.min(utcDate(finish).getTime(), rangeFinish.getTime()));
    if (visibleFinish <= visibleStart) return null;
    return <span className={`phase ${className}`} style={{ left: px(visibleStart), width: Math.max(px(visibleFinish) - px(visibleStart), 4) }} title={`${label}\n${formatDate(start)} → ${formatDate(finish)}\n${weeks} week${weeks === 1 ? "" : "s"}`}>{weeks >= 1 ? label : ""}</span>;
  };
  const onsiteVisible = stage.forecast_site_eta >= rangeStart && stage.forecast_site_eta <= rangeEnd;
  return <div className="timeline-row" onClick={() => onEdit(stage)}>{segment("production", stage.production_start, stage.production_finish, "Production", stage.production_duration_weeks)}{segment("dispatch", stage.production_finish, stage.planned_etd, "Dispatch", stage.dispatch_duration_weeks)}{segment("transit", stage.planned_etd, stage.port_eta, "Sea transit", stage.transit_duration_weeks)}{segment("destination", stage.port_eta, stage.forecast_site_eta, "Destination", stage.destination_duration_weeks)}{onsiteVisible && <span className="onsite" style={{ left: px(utcDate(stage.forecast_site_eta)) - 6 }} title={`On-site\n${formatDate(stage.forecast_site_eta)}`} />}</div>;
}

function CapacityView({ supplierId, suppliers, stages, overrides, ready, onEdit, onRefresh, onMessage }: { supplierId: string; suppliers: Supplier[]; stages: ProductionStage[]; settings: SupplierProductionSetting[]; overrides: SupplierCapacityOverride[]; ready: boolean; onEdit: (stage: ProductionStage) => void; onRefresh: () => Promise<void>; onMessage: (message: { text: string; kind: "error" | "success" } | null) => void }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [saving, setSaving] = useState(false);
  const [bulkCapacity, setBulkCapacity] = useState("");
  const selectedSupplier = suppliers.find(supplier => supplier.id === supplierId);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, index, 1))), [year]);
  const planned = useMemo(() => plannedBySupplierMonth(stages), [stages]);
  const allocations = (key: string) => stages.filter(stage => stage.supplier_id === supplierId && capacityMonth(stage.planned_etd) === key);
  async function saveCapacity(key: string, value: string) {
    setSaving(true);
    try {
      if (value === "") await supabaseRequest(`supplier_capacity_overrides?supplier_id=eq.${supplierId}&capacity_month=eq.${key}`, { method: "DELETE" });
      else await supabaseRequest("supplier_capacity_overrides?on_conflict=supplier_id,capacity_month", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: { supplier_id: supplierId, capacity_month: key, container_capacity: Number(value) } });
      await onRefresh(); onMessage({ text: value === "" ? "Capacity configuration removed; production stages were not changed." : `Capacity saved for ${formatDate(key)}.`, kind: "success" });
    } catch (error) { onMessage({ text: (error as Error).message, kind: "error" }); } finally { setSaving(false); }
  }
  async function applyYear() {
    if (!bulkCapacity || !confirm(`Set ${bulkCapacity} containers for all currently unconfigured months in ${year}? Existing monthly values will be preserved.`)) return;
    const body = months.map(capacityMonth).filter(month => !overrides.some(row => row.supplier_id === supplierId && row.capacity_month === month)).map(capacity_month => ({ supplier_id: supplierId, capacity_month, container_capacity: Number(bulkCapacity) }));
    if (!body.length) { onMessage({ text: "Every month already has an override; nothing was changed.", kind: "success" }); return; }
    setSaving(true); try { await supabaseRequest("supplier_capacity_overrides?on_conflict=supplier_id,capacity_month", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body }); await onRefresh(); onMessage({ text: `Capacity applied to ${body.length} unconfigured months.`, kind: "success" }); } catch (error) { onMessage({ text: (error as Error).message, kind: "error" }); } finally { setSaving(false); }
  }
  if (supplierId === "all") return <section className="panel"><div className="panel-title"><div><h2>Supplier capacity</h2><p>Capacity is supplier-specific and based on each stage&apos;s Planned ETD month.</p></div></div><div className="empty"><strong>Select an active supplier</strong><span>Use the Supplier selector at the top of Production.</span></div></section>;
  if (!ready) return <section className="panel"><div className="panel-title"><div><h2>Supplier capacity</h2></div></div><div className="empty"><strong>Capacity migration required</strong><span>Run 20260928020000_add_supplier_production_capacity.sql in Supabase.</span></div></section>;
  return <section className="panel capacity-panel"><div className="panel-title capacity-heading"><div><h2>{selectedSupplier?.name} capacity</h2><p>Monthly capacity is configured explicitly; blank means Capacity Not Set.</p></div><div className="capacity-setting"><label>Year<select value={year} onChange={event => setYear(Number(event.target.value))}>{Array.from({length:5},(_,i)=>now.getUTCFullYear()-1+i).map(value=><option key={value}>{value}</option>)}</select></label><label>Set unconfigured months<input min="0" type="number" value={bulkCapacity} onChange={event => setBulkCapacity(event.target.value)} placeholder="Containers" /></label><button className="primary" disabled={saving} onClick={applyYear}>Apply</button></div></div><div className="capacity-grid">{months.map(month => { const key = capacityMonth(month); const rows = allocations(key); const allocated = planned[`${supplierId}:${key}`] || 0; const override = overrides.find(item => item.supplier_id === supplierId && item.capacity_month === key); const metrics = capacityMetrics(override?.container_capacity ?? null, allocated); const ratio = metrics.utilisation === null ? 0 : Math.min(metrics.utilisation, 100); return <article className={`capacity-card ${metrics.status.toLowerCase().replaceAll(" ", "-")}`} key={key}><button className="capacity-card-main" onClick={() => setSelectedMonth(selectedMonth === key ? null : key)}><span>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</span><strong>{override ? override.container_capacity : "—"} <small>capacity</small> · {allocated} <small>planned</small></strong><i style={{ width: `${ratio}%` }} /><b>{metrics.remaining === null ? "Capacity not configured" : metrics.remaining >= 0 ? `Remaining: ${metrics.remaining}` : `Over capacity: ${Math.abs(metrics.remaining)}`}</b><em>{metrics.utilisation === null ? "—" : Number.isFinite(metrics.utilisation) ? `${metrics.utilisation.toFixed(2)}% · ` : "∞ · "}{metrics.status}</em></button><label className="override-field">Monthly capacity<input type="number" min="0" key={`${key}-${override?.container_capacity ?? "unset"}`} defaultValue={override?.container_capacity ?? ""} placeholder="Not set" onBlur={event => event.target.value !== String(override?.container_capacity ?? "") && void saveCapacity(key, event.target.value)} /></label>{selectedMonth === key && <div className="capacity-detail"><strong>Production stages using this month</strong>{rows.length ? rows.map(stage => <button className="capacity-stage-link" key={stage.id} onClick={() => onEdit(stage)}><span>{stage.procurement_jobs.sales_order_number || stage.procurement_jobs.client_name} · {stage.stage_reference}<small>ETD {formatDate(stage.planned_etd)}</small></span><b>{stage.container_quantity}</b></button>) : <span>No stages dispatching this month.</span>}<span className="capacity-total">Total<b>{allocated}</b></span></div>}</article>; })}</div></section>;
}
function SchedulePreview({ form }: { form: StageForm }) {
  const schedule = calculateProductionSchedule({ productionStart: form.production_start, productionWeeks: Number(form.production_duration_weeks), dispatchWeeks: Number(form.dispatch_duration_weeks), transitWeeks: Number(form.transit_duration_weeks), destinationWeeks: Number(form.destination_duration_weeks), requiredSiteDate: form.required_site_date });
  return <div className="schedule-preview full"><span><small>Production finish</small>{formatDate(schedule.production_finish)}</span><span><small>Planned ETD</small>{formatDate(schedule.planned_etd)}</span><span><small>Port ETA</small>{formatDate(schedule.port_eta)}</span><span><small>Forecast site ETA</small>{formatDate(schedule.forecast_site_eta)}</span><span><small>Timing</small><b className={schedule.timing_status.startsWith("Late") ? "negative" : "remaining"}>{schedule.timing_status}</b></span></div>;
}
