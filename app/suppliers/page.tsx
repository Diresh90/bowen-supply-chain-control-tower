"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import type { Supplier } from "@/lib/database.types";
import { configurationError, supabaseRequest } from "@/lib/supabase";

const emptyForm = { name: "", country: "", contact_name: "", email: "", active: true };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const rows = await supabaseRequest<Supplier[]>("suppliers?select=*&order=name.asc");
      setSuppliers(rows);
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function startAdd() { setEditing(null); setForm(emptyForm); setOpen(true); setMessage(null); }
  function startEdit(row: Supplier) {
    setEditing(row);
    setForm({ name: row.name, country: row.country ?? "", contact_name: row.contact_name ?? "", email: row.email ?? "", active: row.active });
    setOpen(true); setMessage(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const payload = { ...form, country: form.country || null, contact_name: form.contact_name || null, email: form.email || null };
    try {
      if (editing) await supabaseRequest<Supplier[]>(`suppliers?id=eq.${editing.id}`, { method: "PATCH", body: payload });
      else await supabaseRequest<Supplier[]>("suppliers", { method: "POST", body: payload });
      setOpen(false); await load();
      setMessage({ text: `Supplier ${editing ? "updated" : "added"} in Supabase.`, kind: "success" });
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
    finally { setSaving(false); }
  }

  async function toggleActive(row: Supplier) {
    setMessage(null);
    try {
      await supabaseRequest(`suppliers?id=eq.${row.id}`, { method: "PATCH", body: { active: !row.active } });
      await load(); setMessage({ text: `${row.name} is now ${row.active ? "inactive" : "active"}.`, kind: "success" });
    } catch (error) { setMessage({ text: (error as Error).message, kind: "error" }); }
  }

  async function remove(row: Supplier) {
    if (!confirm(`Permanently delete ${row.name}? Suppliers linked to jobs cannot be deleted; archive them instead.`)) return;
    setMessage(null);
    try {
      await supabaseRequest(`suppliers?id=eq.${row.id}`, { method: "DELETE" });
      await load(); setMessage({ text: `${row.name} was deleted.`, kind: "success" });
    } catch (error) { setMessage({ text: `${(error as Error).message} Deactivate this supplier to archive it safely.`, kind: "error" }); }
  }

  return <AppShell>
    <header className="page-header"><div><p className="eyebrow">PROCUREMENT DIRECTORY</p><h1>Approved Suppliers</h1><p>Manage the supplier network used for procurement jobs.</p></div><button className="primary" onClick={startAdd}>＋ Add supplier</button></header>
    {message && <Notice message={message.text} kind={message.kind} />}
    {configurationError() && !message && <Notice message={configurationError()!} />}
    <section className="metric-row"><div className="metric"><span>Total suppliers</span><strong>{suppliers.length}</strong></div><div className="metric"><span>Active</span><strong>{suppliers.filter(s => s.active).length}</strong></div><div className="metric"><span>Inactive / archived</span><strong>{suppliers.filter(s => !s.active).length}</strong></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Supplier directory</h2><p>Records are loaded directly from Supabase.</p></div><button className="secondary" onClick={() => void load()}>↻ Refresh</button></div>
      <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Country</th><th>Contact</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5} className="empty">Loading suppliers…</td></tr> : suppliers.length === 0 ? <tr><td colSpan={5} className="empty"><strong>No suppliers yet</strong><span>Add the first approved supplier to begin.</span></td></tr> : suppliers.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.email || "No email"}</small></td><td>{row.country || "—"}</td><td>{row.contact_name || "—"}</td><td><span className={`badge ${row.active ? "active" : "inactive"}`}>{row.active ? "Active" : "Inactive"}</span></td><td className="actions"><button onClick={() => startEdit(row)}>Edit</button><button onClick={() => void toggleActive(row)}>{row.active ? "Archive" : "Activate"}</button><button className="danger-link" onClick={() => void remove(row)}>Delete</button></td></tr>)}
      </tbody></table></div>
    </section>
    {open && <div className="modal-backdrop" onMouseDown={() => !saving && setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="supplier-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">SUPPLIER RECORD</p><h2 id="supplier-title">{editing ? "Edit supplier" : "Add supplier"}</h2></div><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>×</button></div><form onSubmit={save}><div className="form-grid"><label className="full">Supplier name *<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label><label>Country<input value={form.country} onChange={e => setForm({...form, country: e.target.value})} /></label><label>Contact name<input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} /></label><label className="full">Email<input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></label><label className="check full"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} /> Approved and active</label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving to Supabase…" : "Save supplier"}</button></div></form></div></div>}
  </AppShell>;
}
