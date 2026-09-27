import { redirect } from "next/navigation";

/** Legacy AI invoice route → Smart invoice templates */
export default function LegacyNewInvoice() {
  redirect("/smart-invoice");
}
