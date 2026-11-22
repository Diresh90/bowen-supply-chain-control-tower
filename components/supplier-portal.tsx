"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { DispatchGrid } from "@/components/dispatch-grid";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth";
import { formatDate } from "@/lib/dashboard";
import type { ProductionStage, SupplierCapacityOverride } from "@/lib/database.types";
import { stageStatusOf } from "@/lib/jobs";
import { supabaseRequest } from "@/lib/supabase";

// What public.supplier_portal() returns: only the supplier's own plan, and only these fields.
// (No freight costs, FX, sales order numbers or other suppliers' orders ever reach this page.)
type PortalStage = {
  id: string;
  supplier_id: string;
  stage_reference: string;
  container_quantity: number;
  goods_ready_date: string;
  destination: string | null;
  required_site_date: string | null;
  dispatch_status: string | null;
  tentative: boolean | null;
  procurement_jobs: { client_name: string; supplier_po_number: string | null; order_type: string | null; status: string | null };
};

type Portal = {
  supplier: { id: string; name: string };
  stages: PortalStage[];
  capacity: SupplierCapacityOverride[];
};

// Read-only dispatch plan for supplier staff: the weekly grid plus a list of upcoming dispatches.
export function SupplierPortal({ email }: { email: string }) {
  const [portal, setPortal] = useState<Portal | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseRequest<Portal | null>("rpc/supplier_portal")
      .then(setPortal)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load the dispatch plan."));
  }, []);

  // The grid expects production stages; the portal rows carry every field it reads.
  const stages = (portal?.stages ?? []) as unknown as ProductionStage[];
  const upcoming = stages.filter(stage => stageStatusOf(stage) !== "Arrived");

  return <div className="portal-page">
    <header className="portal-header">
      <div className="portal-brand">
        <span className="portal-logo"><Image src="/bowen-logo.svg" alt="Bowen Engineered Storage Systems" width={741} height={227} priority /></span>
        <div>
          <p className="eyebrow">SUPPLIER DISPATCH PLAN</p>
          <h1>{portal?.supplier.name ?? "Dispatch plan"}</h1>
        </div>
      </div>
      <div className="portal-actions">
        <ThemeToggle />
        <span className="portal-user" title={email}>{email}</span>
        <button type="button" className="sign-out" onClick={() => void signOut()}><LogOut size={15} aria-hidden="true" /> Sign out</button>
      </div>
    </header>

    <p className="portal-intro">Live plan from Bowen: what is due to leave your factory, by week, against your monthly capacity. This view is read-only; contact Bowen to change a date or quantity.</p>

    {error && <div className="notice error">{error}</div>}
    {portal === null && <div className="notice error">Your account is not linked to a supplier yet. Please contact your Bowen representative.</div>}

    {portal !== null && <>
      <DispatchGrid stages={stages} overrides={portal?.capacity ?? []} supplierId={portal?.supplier.id ?? "all"} loading={portal === undefined && !error} />

      <section className="panel portal-list">
        <div className="panel-title"><div><h2>Upcoming dispatches</h2><p>Every order not yet arrived, in planned dispatch order.</p></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>PO</th><th>Client / project</th><th>Stage</th><th>Containers</th><th>Planned dispatch</th><th>Status</th><th>Destination</th><th>Required on site</th></tr></thead>
          <tbody>
            {portal === undefined ? <tr><td colSpan={8} className="empty">Loading…</td></tr>
              : upcoming.length === 0 ? <tr><td colSpan={8} className="empty">No upcoming dispatches.</td></tr>
              : upcoming.map(stage => {
                const status = stageStatusOf(stage);
                return <tr key={stage.id}>
                  <td><strong>{stage.procurement_jobs.supplier_po_number || "—"}</strong></td>
                  <td>{stage.procurement_jobs.client_name}</td>
                  <td>{stage.stage_reference}</td>
                  <td>{stage.container_quantity}</td>
                  <td>{formatDate(stage.goods_ready_date)}</td>
                  <td><span className={`dispatch-chip read-only status-${status.toLowerCase()}${status === "Tentative" ? " pending tentative" : ""}`}>{status}</span></td>
                  <td>{stage.destination || "—"}</td>
                  <td>{formatDate(stage.required_site_date)}</td>
                </tr>;
              })}
          </tbody>
        </table></div>
      </section>
    </>}
  </div>;
}
