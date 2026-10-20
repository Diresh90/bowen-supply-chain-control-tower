"use client";

import { useMemo, useState } from "react";
import type { ProcurementJob, ProductionStage, SupplierCapacityOverride } from "@/lib/database.types";
import { jobLabel, pendingDispatch } from "@/lib/dashboard";
import { capacityMetrics, capacityMonth, dateKey, mondayOf } from "@/lib/production";

const MONTHS = 3;
const WEEK_MS = 7 * 86_400_000;

// date = dispatch date (goods ready to leave the supplier). pending = tentative stage or order awaiting confirmation.
type Row = { id: string; po: string; detail: string; containers: number; date: string; pending: boolean; late: boolean; stage?: ProductionStage };

function poOf(job: ProcurementJob) {
  const po = job.supplier_po_number?.trim();
  return po && po.toUpperCase() !== "NA" ? po : jobLabel(job);
}

// Second line under the PO: client (when not already in the PO / job name) and the stage number.
function detailOf(job: ProcurementJob, po: string, extra: string) {
  const client = job.client_name.toLowerCase().includes(po.toLowerCase()) ? null : job.client_name;
  return [client, extra].filter(Boolean).join(" · ");
}

const shortDate = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date);
const monthName = (key: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));

// Option B: one row per PO / stage, one column per dispatch week, capacity per month across the top.
export function DispatchGrid({ stages, pendingJobs, overrides, supplierId, loading, onEdit }: { stages: ProductionStage[]; pendingJobs: ProcurementJob[]; overrides: SupplierCapacityOverride[]; supplierId: string; loading: boolean; onEdit: (stage: ProductionStage) => void }) {
  const [showPending, setShowPending] = useState(true);
  const today = dateKey(new Date());
  const now = new Date(`${today}T00:00:00Z`);
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + MONTHS, 1));
  const monthKeys = Array.from({ length: MONTHS }, (_, i) => capacityMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))));
  const rangeStart = dateKey(firstMonth), rangeEnd = dateKey(new Date(endExclusive.getTime() - 86_400_000));
  const thisWeek = dateKey(mondayOf(now));

  const weeks = useMemo(() => {
    const values: string[] = [];
    for (let week = mondayOf(firstMonth); week < endExclusive; week = new Date(week.getTime() + WEEK_MS)) values.push(dateKey(week));
    return values;
  }, [rangeStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => {
    const planned = stages.filter(s => (showPending || !s.tentative) && s.goods_ready_date >= rangeStart && s.goods_ready_date <= rangeEnd).map(s => ({
      id: s.id, po: poOf(s.procurement_jobs), detail: detailOf(s.procurement_jobs, poOf(s.procurement_jobs), [s.stage_reference.replace(s.procurement_jobs.client_name, "").trim() || s.stage_reference, s.tentative ? "Tentative" : null].filter(Boolean).join(" · ")), containers: s.container_quantity,
      date: s.goods_ready_date, pending: !!s.tentative, late: !s.tentative && s.timing_status.startsWith("Late"), stage: s,
    }));
    // Orders awaiting confirmation with no stage yet are placed at an estimated dispatch date.
    const jobsWithStages = new Set(stages.map(s => s.procurement_job_id));
    const pending = !showPending ? [] : pendingJobs
      .filter(job => (supplierId === "all" || job.supplier_id === supplierId) && !jobsWithStages.has(job.id))
      .map(job => ({ id: job.id, po: poOf(job), detail: detailOf(job, poOf(job), "Awaiting confirmation · estimated"), containers: job.total_containers ?? 0, date: pendingDispatch(job, today), pending: true, late: false }))
      .filter(row => row.containers > 0 && row.date >= rangeStart && row.date <= rangeEnd);
    return [...planned, ...pending].sort((a, b) => a.date.localeCompare(b.date) || Number(a.pending) - Number(b.pending));
  }, [stages, pendingJobs, showPending, supplierId, rangeStart, rangeEnd, today]);

  const months = monthKeys.map(key => {
    const capacityValues = overrides.filter(o => o.capacity_month === key && (supplierId === "all" || o.supplier_id === supplierId)).map(o => o.container_capacity);
    const capacity = capacityValues.length ? capacityValues.reduce((n, v) => n + v, 0) : null;
    const planned = stages.filter(s => !s.tentative && capacityMonth(s.goods_ready_date) === key).reduce((n, s) => n + s.container_quantity, 0);
    const pending = rows.filter(r => r.pending && capacityMonth(r.date) === key).reduce((n, r) => n + r.containers, 0);
    const metrics = capacityMetrics(capacity, planned);
    return { key, label: monthName(key), capacity, planned, pending, metrics, span: weeks.filter(w => capacityMonth(w) === key || (key === monthKeys[0] && w < key)).length };
  });
  const weekTotal = (week: string) => rows.filter(r => !r.pending && dateKey(mondayOf(new Date(`${r.date}T00:00:00Z`))) === week).reduce((n, r) => n + r.containers, 0);

  return <section className="panel dispatch-panel">
    <div className="panel-title"><div><h2>Dispatch weeks</h2><p>Containers by the week they leave the supplier (dispatch), with capacity for this month and the next two. Select a number to edit its stage.</p></div>
      <label className="check dispatch-toggle"><input type="checkbox" checked={showPending} onChange={e => setShowPending(e.target.checked)} /> Show tentative and awaiting confirmation</label>
    </div>
    <div className="table-wrap"><table className="dispatch-grid">
      <thead>
        <tr><th rowSpan={2} className="dispatch-po">PO / job</th>{months.map(m => {
          const tone = m.metrics.status.toLowerCase().replaceAll(" ", "-");
          const width = m.capacity ? Math.min(100, m.planned / m.capacity * 100) : 0;
          const pendingWidth = m.capacity ? Math.min(100 - width, m.pending / m.capacity * 100) : 0;
          return <th key={m.key} colSpan={m.span} className="dispatch-month">
            <div className="dispatch-month-head"><strong>{m.label}</strong><span className={`dispatch-cap ${tone}`}>{m.planned} / {m.capacity ?? "—"}{m.metrics.remaining !== null && <em>{m.metrics.remaining >= 0 ? `${m.metrics.remaining} free` : `${-m.metrics.remaining} over`}</em>}</span></div>
            <div className="dispatch-cap-bar"><span className={tone} style={{ width: `${width}%` }} />{showPending && <span className="pending" style={{ width: `${pendingWidth}%` }} />}</div>
          </th>;
        })}<th rowSpan={2} className="dispatch-total-head">Ctns</th></tr>
        <tr>{weeks.map(w => <th key={w} className={w === thisWeek ? "this-week" : ""}>{w === thisWeek ? "This wk" : shortDate(new Date(`${w}T00:00:00Z`))}</th>)}</tr>
      </thead>
      <tbody>
        {loading ? <tr><td colSpan={weeks.length + 2} className="empty">Loading dispatch plan…</td></tr> : rows.length === 0 ? <tr><td colSpan={weeks.length + 2} className="empty"><strong>Nothing dispatching in the next {MONTHS} months</strong><span>Plan production stages to see them here.</span></td></tr> : rows.map(row => {
          const rowWeek = dateKey(mondayOf(new Date(`${row.date}T00:00:00Z`)));
          return <tr key={`${row.pending ? "p" : "s"}-${row.id}`} className={row.pending ? "pending-row" : ""}>
            <td className="dispatch-po"><strong>{row.po}</strong><small>{row.detail}</small></td>
            {weeks.map(w => <td key={w} className={w === thisWeek ? "this-week" : ""}>{w === rowWeek && (row.stage
              ? <button className={`dispatch-chip${row.late ? " late" : ""}${row.pending ? " pending tentative" : ""}`} onClick={() => onEdit(row.stage!)} title={`Dispatch ${row.date} · ETD ${row.stage.planned_etd}${row.pending ? " · tentative" : ""}${row.late ? ` · ${row.stage.timing_status}` : ""}`}>{row.containers}</button>
              : <span className="dispatch-chip pending" title={`Estimated dispatch ${row.date} if confirmed`}>{row.containers}</span>)}</td>)}
            <td className="dispatch-total">{row.containers}</td>
          </tr>;
        })}
      </tbody>
      {!loading && rows.length > 0 && <tfoot><tr><td className="dispatch-po">Shipping per week</td>{weeks.map(w => <td key={w} className={w === thisWeek ? "this-week" : ""}>{weekTotal(w) || ""}</td>)}<td className="dispatch-total">{rows.filter(r => !r.pending).reduce((n, r) => n + r.containers, 0)}</td></tr></tfoot>}
    </table></div>
    <p className="dispatch-legend"><span className="dispatch-chip">8</span> Planned <span className="dispatch-chip late">8</span> Forecast late <span className="dispatch-chip pending">8</span> Tentative or awaiting confirmation (not counted in capacity) · capacity counts by dispatch month</p>
  </section>;
}
