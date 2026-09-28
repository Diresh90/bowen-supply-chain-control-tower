"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { ProcurementJob, procurementStatuses, Supplier } from "@/lib/database.types";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const emptyForm = { client_name: "", sales_order_number: "", supplier_po_number: "", supplier_id: "", project_manager: "", required_onsite_date: "", total_containers: "", status: "Awaiting Confirmation" };

export default function ProcurementPage() {
  const [jobs, setJobs] = useState<ProcurementJob[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<ProcurementJob | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const [jobRows, supplierRows] = await Promise.all([
        supabaseRequest<ProcurementJob[]>("procurement_jobs?select=*,suppliers(id,name,active)&order=created_at.desc"),
        supabaseRequest<Supplier[]>("suppliers?select=*&order=name.asc"),
      ]);
      setJobs(jobRows); setSuppliers(supplierRows);
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function startAdd() { setEditing(null); setForm(emptyForm); setOpen(true); setMessage(null); }
  function startEdit(job: ProcurementJob) {
    setEditing(job); setForm({ client_name: job.client_name, sales_order_number: job.sales_order_number ?? "", supplier_po_number: job.supplier_po_number ?? "", supplier_id: job.supplier_id ?? "", project_manager: job.project_manager ?? "", required_onsite_date: job.required_onsite_date ?? "", total_containers: job.total_containers?.toString() ?? "", status: job.status ?? "Awaiting Confirmation" }); setOpen(true); setMessage(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const payload = { client_name: form.client_name, sales_order_number: form.sales_order_number || null, supplier_po_number: form.supplier_po_number || null, supplier_id: form.supplier_id || null, project_manager: form.project_manager || null, required_onsite_date: form.required_onsite_date || null, total_containers: form.total_containers === "" ? null : Number(form.total_containers), status: form.status };
    try {
      if (editing) await supabaseRequest(`procurement_jobs?id=eq.${editing.id}`, { method: "PATCH", body: payload });
      else await supabaseRequest("procurement_jobs", { method: "POST", body: payload });
      setOpen(false); await load(); setMessage({ text: `Procurement job ${editing ? "updated" : "added"} in Supabase.`, kind: "success" });
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setSaving(false); }
  }
  async function remove(job: ProcurementJob) {
    if (!confirm(`Permanently delete the procurement job for ${job.client_name}? This cannot be undone.`)) return;
    setMessage(null);
    try { await supabaseRequest(`procurement_jobs?id=eq.${job.id}`, { method: "DELETE" }); await load(); setMessage({ text: "Procurement job deleted.", kind: "success" }); }
    catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
  }
  const selectableSuppliers = suppliers.filter(s => s.active || s.id === editing?.supplier_id);

  return <AppShell>
    <header className="page-header"><div><p className="eyebrow">ORDER PIPELINE</p><h1>Procurement</h1><p>Track customer orders and their approved supplier.</p></div><button className="primary" onClick={startAdd}>＋ Add job</button></header>
    {message && <Notice message={message.text} kind={message.kind} />}{configurationError() && !message && <Notice message={configurationError()!} />}
    <section className="metric-row"><div className="metric"><span>Total jobs</span><strong>{jobs.length}</strong></div><div className="metric"><span>Awaiting confirmation</span><strong>{jobs.filter(j => j.status === "Awaiting Confirmation").length}</strong></div><div className="metric"><span>In progress</span><strong>{jobs.filter(j => j.status === "In Production").length}</strong></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Procurement jobs</h2><p>Every change is written to Supabase before this list updates.</p></div><button className="secondary" onClick={() => void load()}>↻ Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Client / order</th><th>Supplier</th><th>Project manager</th><th>Required onsite</th><th>Containers</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {loading ? <tr><td colSpan={7} className="empty">Loading procurement jobs…</td></tr> : jobs.length === 0 ? <tr><td colSpan={7} className="empty"><strong>No procurement jobs yet</strong><span>Add a job after creating an approved supplier.</span></td></tr> : jobs.map(job => <tr key={job.id}><td><strong>{job.client_name}</strong><small>{job.sales_order_number || "No sales order"}{job.supplier_po_number ? ` · PO ${job.supplier_po_number}` : ""}</small></td><td>{job.suppliers?.name || "—"}</td><td>{job.project_manager || "—"}</td><td>{job.required_onsite_date ? new Date(`${job.required_onsite_date}T00:00:00`).toLocaleDateString("en-GB") : "—"}</td><td>{job.total_containers ?? "—"}</td><td><span className="badge status">{job.status || "—"}</span></td><td className="actions"><button onClick={() => startEdit(job)}>Edit</button><button className="danger-link" onClick={() => void remove(job)}>Delete</button></td></tr>)}
    </tbody></table></div></section>
    {open && <div className="modal-backdrop" onMouseDown={() => !saving && setOpen(false)}><div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="job-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">PROCUREMENT RECORD</p><h2 id="job-title">{editing ? "Edit job" : "Add job"}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div><form onSubmit={save}><div className="form-grid"><label>Client name *<input required value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} /></label><label>Approved supplier<select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}><option value="">Not assigned</option>{selectableSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}{!s.active ? " (inactive)" : ""}</option>)}</select></label><label>Sales order number<input value={form.sales_order_number} onChange={e => setForm({...form, sales_order_number: e.target.value})} /></label><label>Supplier PO number<input value={form.supplier_po_number} onChange={e => setForm({...form, supplier_po_number: e.target.value})} /></label><label>Project manager<input value={form.project_manager} onChange={e => setForm({...form, project_manager: e.target.value})} /></label><label>Required onsite date<input type="date" value={form.required_onsite_date} onChange={e => setForm({...form, required_onsite_date: e.target.value})} /></label><label>Total containers<input type="number" min="0" value={form.total_containers} onChange={e => setForm({...form, total_containers: e.target.value})} /></label><label>Status<select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{procurementStatuses.map(status => <option key={status}>{status}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving to Supabase…" : "Save job"}</button></div></form></div></div>}
  </AppShell>;
}
