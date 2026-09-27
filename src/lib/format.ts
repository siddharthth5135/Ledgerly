export function inr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function inrExact(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

export function statusColor(status: string) {
  switch (status) {
    case "paid":
    case "verified":
    case "sent":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "overdue":
    case "flagged":
    case "critical":
    case "failed":
      return "bg-red-50 text-red-800 ring-red-200";
    case "draft":
    case "pending":
    case "partial":
      return "bg-amber-50 text-amber-900 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}
