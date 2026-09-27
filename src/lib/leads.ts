import type { Lead } from "./types";

const g = globalThis as typeof globalThis & { __ledgerlyLeads?: Lead[] };

function leadsBag() {
  if (!g.__ledgerlyLeads) g.__ledgerlyLeads = [];
  return g.__ledgerlyLeads;
}

export function addLead(lead: Omit<Lead, "id" | "createdAt">) {
  const row: Lead = {
    ...lead,
    id: `lead-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const leads = leadsBag();
  leads.unshift(row);
  return row;
}

export function listLeads() {
  return [...leadsBag()];
}
