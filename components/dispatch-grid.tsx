"use client";

import { useMemo } from "react";
import { dispatchStatuses, type DispatchStatus, type ProcurementJob, type ProductionStage, type SupplierCapacityOverride } from "@/lib/database.types";
import { stageStatusOf } from "@/lib/jobs";
import { jobLabel } from "@/lib/dashboard";
import { capacityMetrics, capacityMonth, dateKey, mondayOf } from "@/lib/production";

const MONTHS = 3;
const WEEK_MS = 7 * 86_400_000;

// date = planned dispatch date (goods leave the supplier).
type Row = { id: string; po: string; detail: string; containers: number; date: string; status: DispatchStatus; stage: ProductionStage };

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

// Planning board: one row per PO / stage, one column per dispatch week, capacity per month across the top.
// Every stage with a planned dispatch date counts against that month's capacity, tentative or not.
export function DispatchGrid({ stages, overrides, supplierId, loading, onEdit }: { stages: ProductionStage[]; overrides: SupplierCapacityOverride[]; supplierId: string; loading: boolean; onEdit: (stage: ProductionStage) => void }) {
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

  const rows = useMemo<Row[]>(() => stages
    .filter(s => s.goods_ready_date >= rangeStart && s.goods_ready_date <= rangeEnd)
    .map(s => ({
      id: s.id, po: poOf(s.procurement_jobs),
      detail: detailOf(s.procurement_jobs, poOf(s.procurement_jobs), `${s.stage_reference.replace(s.procurement_jobs.client_name, "").trim() || s.stage_reference} · ${stageStatusOf(s)}`),
      containers: s.container_quantity, date: s.goods_ready_date, status: stageStatusOf(s), stage: s,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)), [stages, rangeStart, rangeEnd]);

  const months = monthKeys.map(key => {
    const capacityValues = overrides.filter(o => o.capacity_month === key && (supplierId === "all" || o.supplier_id === supplierId)).map(o => o.container_capacity);
    const capacity = capacityValues.length ? capacityValues.reduce((n, v) => n + v, 0) : null;
    const planned = stages.filter(s => capacityMonth(s.goods_ready_date) === key).reduce((n, s) => n + s.container_quantity, 0);
    const metrics = capacityMetrics(capacity, planned);
    return { key, label: monthName(key), capacity, planned, metrics, span: weeks.filter(w => capacityMonth(w) === key || (key === monthKeys[0] && w < key)).length };
  });
  const weekOf = (date: string) => dateKey(mondayOf(new Date(`${date}T00:00:00Z`)));
  const weekTotal = (week: string) => rows.filter(r => weekOf(r.date) === week).reduce((n, r) => n + r.containers, 0);

  return <section className="panel dispatch-panel">
    <div className="panel-title"><div><h2>Dispatch weeks</h2><p>Containers by the week they leave the supplier, with capacity for this month and the next two. Every planned dispatch counts toward capacity. Select a number to edit it.</p></div></div>
    <div className="table-wrap"><table className="dispatch-grid">
      <thead>
        <tr><th rowSpan={2} className="dispatch-po">PO / job</th>{months.map(m => {
          const tone = m.metrics.status.toLowerCase().replaceAll(" ", "-");
          const width = m.capacity ? Math.min(100, m.planned / m.capacity * 100) : 0;
          return <th key={m.key} colSpan={m.span} className="dispatch-month">
            <div className="dispatch-month-head"><strong>{m.label}</strong><span className={`dispatch-cap ${tone}`}>{m.planned} / {m.capacity ?? "—"}{m.metrics.remaining !== null && <em>{m.metrics.remaining >= 0 ? `${m.metrics.remaining} free` : `${-m.metrics.remaining} over`}</em>}</span></div>
            <div className="dispatch-cap-bar"><span className={tone} style={{ width: `${width}%` }} /></div>
          </th>;
        })}<th rowSpan={2} className="dispatch-total-head">Ctns</th></tr>
        <tr>{weeks.map(w => <th key={w} className={w === thisWeek ? "this-week" : ""}>{w === thisWeek ? "This wk" : shortDate(new Date(`${w}T00:00:00Z`))}</th>)}</tr>
      </thead>
      <tbody>
        {loading ? <tr><td colSpan={weeks.length + 2} className="empty">Loading dispatch plan…</td></tr> : rows.length === 0 ? <tr><td colSpan={weeks.length + 2} className="empty"><strong>Nothing dispatching in the next {MONTHS} months</strong><span>Add a stage with a planned dispatch date to see it here.</span></td></tr> : rows.map(row => {
          const rowWeek = weekOf(row.date);
          return <tr key={row.id} className={row.status === "Tentative" ? "pending-row" : ""}>
            <td className="dispatch-po"><strong>{row.po}</strong><small>{row.detail}</small></td>
            {weeks.map(w => <td key={w} className={w === thisWeek ? "this-week" : ""}>{w === rowWeek &&
              <button className={`dispatch-chip status-${row.status.toLowerCase()}${row.status === "Tentative" ? " pending tentative" : ""}`} onClick={() => onEdit(row.stage)} title={`${row.status} · planned dispatch ${row.date}`}>{row.containers}</button>}</td>)}
            <td className="dispatch-total">{row.containers}</td>
          </tr>;
        })}
      </tbody>
      {!loading && rows.length > 0 && <tfoot><tr><td className="dispatch-po">Dispatching per week</td>{weeks.map(w => <td key={w} className={w === thisWeek ? "this-week" : ""}>{weekTotal(w) || ""}</td>)}<td className="dispatch-total">{rows.reduce((n, r) => n + r.containers, 0)}</td></tr></tfoot>}
    </table></div>
    <p className="dispatch-legend">{dispatchStatuses.map(status => <span key={status} className="dispatch-legend-item"><span className={`dispatch-chip status-${status.toLowerCase()}${status === "Tentative" ? " pending tentative" : ""}`}>8</span> {status}</span>)}<span>· every stage counts toward its month&apos;s capacity</span></p>
  </section>;
}
