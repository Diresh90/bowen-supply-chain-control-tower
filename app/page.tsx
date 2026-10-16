"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { FreightBooking, ProcurementJob, ProductionStage, Supplier, SupplierCapacityOverride, procurementStatuses } from "@/lib/database.types";
import { AttentionItem, FREIGHT_DUE_DAYS, Severity, attentionItems, capacityRows, formatDate, jobLabel, summariseJobs } from "@/lib/dashboard";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const statusColours: Record<string, string> = { "Awaiting Confirmation": "#8b9aa6", Confirmed: "#168cff", "In Production": "#f1870d", "Production Completed": "#7555e6", "Fully Dispatched": "#20af63" };
const severityLabel: Record<Severity, string> = { high: "Act now", medium: "Check", low: "Follow up" };

export default function Home() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [bookings, setBookings] = useState<FreightBooking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [capacities, setCapacities] = useState<SupplierCapacityOverride[]>([]);
  const [capacityAvailable, setCapacityAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    const coreData = Promise.all([
      supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&order=updated_at.desc"),
      supabaseRequest<ProductionStage[]>("production_stages?select=*,procurement_jobs(*,suppliers(id,name,active)),suppliers(id,name,active)&order=planned_etd.asc"),
      supabaseRequest<FreightBooking[]>("freight_bookings?select=*,procurement_jobs(*,suppliers(id,name,active)),production_stages(*),suppliers(id,name,active),freight_references(*),freight_forwarders(*),origin:locations!freight_bookings_origin_location_id_fkey(*),destination:locations!freight_bookings_destination_location_id_fkey(*)&archived_at=is.null&order=updated_at.desc"),
    ]);
    const capacityData = Promise.all([
      supabaseRequest<Supplier[]>("suppliers?select=*&active=eq.true&order=name.asc"),
      supabaseRequest<SupplierCapacityOverride[]>("supplier_capacity_overrides?select=*"),
    ]);
    const [coreResult, capacityResult] = await Promise.allSettled([coreData, capacityData]);
    if (coreResult.status === "fulfilled") {
      const [jobRows, stageRows, bookingRows] = coreResult.value;
      setJobs(jobRows); setStages(stageRows); setBookings(bookingRows);
    } else setMessage((coreResult.reason as Error).message);
    if (capacityResult.status === "fulfilled") {
      const [supplierRows, capacityRows] = capacityResult.value;
      setSuppliers(supplierRows); setCapacities(capacityRows); setCapacityAvailable(true);
    } else { setSuppliers([]); setCapacities([]); setCapacityAvailable(false); }
    setLoadedAt(new Date()); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = useMemo(() => (loadedAt ?? new Date()).toISOString().slice(0, 10), [loadedAt]);
  const summaries = useMemo(() => summariseJobs(jobs, stages, bookings), [jobs, stages, bookings]);
  const capacity = useMemo(() => capacityRows(suppliers, capacities, stages), [suppliers, capacities, stages]);
  const attention = useMemo(() => attentionItems(summaries, bookings, capacity, today), [summaries, bookings, capacity, today]);
  const attentionByJob = useMemo(() => attention.reduce<Record<string, AttentionItem[]>>((map, item) => { if (item.jobId) (map[item.jobId] ||= []).push(item); return map; }, {}), [attention]);

  const openJobs = summaries.filter(s => s.job.status !== "Fully Dispatched");
  const lateJobs = summaries.filter(s => s.timing === "Late" && s.shipped < s.ordered);
  const totals = summaries.reduce((t, s) => ({ ordered: t.ordered + s.ordered, planned: t.planned + s.planned, booked: t.booked + s.booked, shipped: t.shipped + s.shipped, toPlan: t.toPlan + s.toPlan, toBook: t.toBook + s.toBook }), { ordered: 0, planned: 0, booked: 0, shipped: 0, toPlan: 0, toBook: 0 });
  const highCount = attention.filter(item => item.severity === "high").length;
  const statusCounts = procurementStatuses.map(status => ({ status, count: jobs.filter(job => job.status === status).length }));
  const maxStatus = Math.max(1, ...statusCounts.map(x => x.count));
  const show = (value: number | string) => (loading && !loadedAt ? "—" : value);

  const query = search.trim().toLowerCase();
  const tableRows = summaries
    .filter(s => !query || [s.job.sales_order_number, s.job.client_name, s.job.supplier_po_number, s.job.project_manager, s.job.suppliers?.name].join(" ").toLowerCase().includes(query))
    .sort((a, b) => (attentionByJob[b.job.id]?.length ? 1 : 0) - (attentionByJob[a.job.id]?.length ? 1 : 0) || b.worstLateDays - a.worstLateDays);

  return <AppShell>
    <header className="dashboard-head">
      <div><h1>Supply Chain Dashboard</h1><p className="db-subtitle">What needs attention first, then where every container is.</p></div>
      <div className="dashboard-actions">
        <span className="live-data-indicator"><i /> {loadedAt ? `Live data · updated ${loadedAt.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "Live Supabase data"}</span>
        <button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
    </header>
    {message && <Notice message={message} />} {configurationError() && !message && <Notice message={configurationError()!} />}

    <section className="db-kpis">
      <article className={`db-kpi ${highCount ? "red" : "green"}`}><span>Needs attention</span><strong>{show(attention.length)}</strong><small>{show(highCount ? `${highCount} to act on now` : "Nothing urgent")}</small></article>
      <article className={`db-kpi ${lateJobs.length ? "orange" : "green"}`}><span>Late jobs</span><strong>{show(lateJobs.length)}</strong><small>{show(lateJobs.length ? `Worst: ${Math.max(...lateJobs.map(s => s.worstLateDays))} days late` : "All forecast on time")}</small></article>
      <article className="db-kpi blue"><span>Open jobs</span><strong>{show(openJobs.length)}</strong><small>{show(`${openJobs.reduce((n, s) => n + s.ordered, 0)} containers ordered`)}</small></article>
      <article className="db-kpi purple"><span>Containers to book</span><strong>{show(totals.toBook)}</strong><small>Planned in production, no freight yet</small></article>
    </section>

    <section className="dash-panel db-attention">
      <div className="all-jobs-title"><div><h2>Needs attention{loadedAt && attention.length > 0 && <span className="db-count">{attention.length}</span>}</h2><p>Worked out from the live production, freight and capacity data, so it catches statuses that are out of date.</p></div></div>
      {loading && !loadedAt ? <div className="empty">Checking jobs…</div> : attention.length === 0 ? <div className="db-all-clear">✓ Nothing needs attention right now.</div> : <>
        <ul className="db-attention-list">
          {attention.map(item => <li key={item.id} className={item.severity}>
            <span className={`db-severity ${item.severity}`}>{severityLabel[item.severity]}</span>
            <div><strong>{item.title}</strong><small>{item.category} · {item.detail}</small></div>
            <Link href={item.href}>Open →</Link>
          </li>)}
        </ul>
      </>}
    </section>

    <section className="db-grid">
      <article className="dash-panel db-pipeline">
        <h2>Container pipeline</h2>
        <p className="db-panel-note">Every ordered container should move left to right: planned in production, booked on freight, then shipped.</p>
        {([["Ordered", totals.ordered, "On procurement jobs"], ["Planned in production", totals.planned, `${totals.toPlan} still to plan`], ["Booked on freight", totals.booked, `${totals.toBook} planned but not booked`], ["Shipped", totals.shipped, "Dispatched, in transit or completed"]] as const).map(([label, value, note]) =>
          <div className="db-pipe-row" key={label}>
            <div className="db-pipe-label"><span>{label}</span><small>{show(note)}</small></div>
            <div className="db-pipe-bar"><span style={{ width: `${totals.ordered ? Math.min(100, value / totals.ordered * 100) : 0}%` }} /></div>
            <strong>{show(value)}</strong>
          </div>)}
        <Link className="db-panel-link" href="/freight">Open freight planning →</Link>
      </article>

      <article className="dash-panel db-status">
        <h2>Jobs by status</h2>
        <p className="db-panel-note">As set on each job. The attention list flags any that don&apos;t match the data.</p>
        {statusCounts.map(x => <div className="db-status-row" key={x.status}>
          <span><i style={{ background: statusColours[x.status] }} />{x.status}</span>
          <div className="db-pipe-bar"><span style={{ width: `${x.count / maxStatus * 100}%`, background: statusColours[x.status] }} /></div>
          <strong>{show(x.count)}</strong>
        </div>)}
        <Link className="db-panel-link" href="/procurement">Manage jobs →</Link>
      </article>
    </section>

    <section className="dash-panel capacity-summary">
      <div className="all-jobs-title"><div><h2>Supplier capacity — next 3 months</h2><p>Planned containers / monthly capacity, by each production stage&apos;s ETD month.</p></div><Link href="/production">Manage capacity →</Link></div>
      {!capacityAvailable ? <div className="capacity-unavailable">Capacity data unavailable</div> : loading && !loadedAt ? <div className="empty">Loading capacity…</div> : capacity.length === 0 ? <div className="capacity-unavailable">No supplier capacity set for the next 3 months</div> :
        <div className="table-wrap"><table><thead><tr><th>Supplier</th>{capacity[0].months.map(m => <th key={m.month}>{m.label}</th>)}</tr></thead><tbody>
          {capacity.map(row => <tr key={row.supplier.id}><td><strong>{row.supplier.name}</strong></td>{row.months.map(m => <td key={m.month}>
            <div className="db-capacity-cell"><span>{m.planned} / {m.capacity ?? "—"}</span><span className={`capacity-status ${m.status.toLowerCase().replaceAll(" ", "-")}`}>{m.status}</span></div>
          </td>)}</tr>)}
        </tbody></table></div>}
    </section>

    <section className="dash-panel all-jobs">
      <div className="all-jobs-title">
        <div><h2>All jobs</h2><p>{loading && !loadedAt ? "Loading current records…" : `${jobs.length} procurement job${jobs.length === 1 ? "" : "s"} · jobs needing attention are listed first`}</p></div>
        <div className="db-table-tools"><input aria-label="Search jobs" placeholder="Search order, client, PO, PM…" value={search} onChange={e => setSearch(e.target.value)} /><Link href="/procurement">Manage jobs →</Link></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Job</th><th>Supplier / PO</th><th>Project manager</th><th>Required on-site</th><th>Containers</th><th>Job status</th><th>Timing</th><th>Updated</th></tr></thead><tbody>
        {loading && !loadedAt ? <tr><td colSpan={8} className="empty">Loading live job data…</td></tr> : tableRows.length === 0 ? <tr><td colSpan={8} className="empty"><strong>{query ? "No jobs match your search" : "No procurement jobs found"}</strong><span>{query ? "Try a different order number or client." : "Add a job in Procurement to see it here."}</span></td></tr> : tableRows.map(s => {
          const flags = attentionByJob[s.job.id] || [];
          return <tr key={s.job.id}>
            <td><strong>{flags.length > 0 && <span className={`db-flag ${flags[0].severity}`} title={flags.map(f => f.title).join("\n")}>●</span>}{jobLabel(s.job)}</strong>{jobLabel(s.job) !== s.job.client_name && <small>{s.job.client_name}</small>}</td>
            <td>{s.job.suppliers?.name || "—"}<small>{s.job.supplier_po_number && s.job.supplier_po_number.toUpperCase() !== "NA" ? `PO ${s.job.supplier_po_number}` : "No supplier PO"}</small></td>
            <td>{s.job.project_manager || "—"}</td>
            <td>{formatDate(s.job.required_onsite_date)}</td>
            <td><div className="db-progress" title={`${s.planned} planned · ${s.booked} booked · ${s.shipped} shipped of ${s.ordered}`}>
              <div className="db-progress-bar"><span className="planned" style={{ width: `${s.ordered ? Math.min(100, s.planned / s.ordered * 100) : 0}%` }} /><span className="booked" style={{ width: `${s.ordered ? Math.min(100, s.booked / s.ordered * 100) : 0}%` }} /><span className="shipped" style={{ width: `${s.ordered ? Math.min(100, s.shipped / s.ordered * 100) : 0}%` }} /></div>
              <small>{s.ordered} ordered · {s.planned} planned · {s.booked} booked · {s.shipped} shipped</small>
            </div></td>
            <td><span className={`badge status dashboard-status${s.job.status === "Awaiting Confirmation" ? " awaiting-confirmation" : ""}`}>{s.job.status || "Not set"}</span></td>
            <td><span className={`risk ${s.timing === "Late" ? "delayed" : s.timing === "Within target" ? "on-track" : "not-planned"}`}>{s.timing === "Late" ? `${s.worstLateDays} days late` : s.timing}</span></td>
            <td>{formatDate(s.job.updated_at)}</td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="db-legend"><span className="planned" /> Planned <span className="booked" /> Booked <span className="shipped" /> Shipped · Freight due soon = ETD within {FREIGHT_DUE_DAYS} days</p>
    </section>
  </AppShell>;
}
