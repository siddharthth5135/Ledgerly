/**
 * Parse bank/UPI CSV exports (PhonePe / GPay / common bank statement) and suggest invoice matches.
 * Keep simple: amount + optional name/reference fuzzy match. No ML.
 */
export type CsvTxn = {
  date: string;
  amount: number;
  reference: string;
  counterparty: string;
  raw: string;
};

export type UnpaidBill = {
  id: string;
  number: string;
  customer_name: string;
  balance: number;
  due_date?: string;
};

export type MatchSuggestion = {
  txn: CsvTxn;
  invoiceId: string | null;
  invoiceNumber: string | null;
  confidence: number;
  reason: string;
};

function parseAmount(s: string) {
  const n = Number(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Split CSV line respecting quotes */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parsePaymentCsv(text: string): CsvTxn[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = idx(["date", "txn date", "transaction date", "value date"]);
  const iAmt = idx(["credit", "deposit", "amount", "cr"]);
  const iDebit = idx(["debit", "withdrawal", "dr"]);
  const iRef = idx(["ref", "utr", "narration", "description", "particular", "remarks"]);
  const iParty = idx(["name", "party", "from", "payer", "beneficiary"]);

  const txns: CsvTxn[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (cols.length < 2) continue;
    let amount = iAmt >= 0 ? parseAmount(cols[iAmt]) : 0;
    if (!amount && iDebit >= 0) {
      // skip pure debits for collections matching
      continue;
    }
    if (!amount) {
      // try last numeric-looking column
      for (let i = cols.length - 1; i >= 0; i--) {
        const a = parseAmount(cols[i]);
        if (a > 0) {
          amount = a;
          break;
        }
      }
    }
    if (amount < 1) continue;
    const reference = iRef >= 0 ? cols[iRef] : cols.join(" ");
    const counterparty = iParty >= 0 ? cols[iParty] : "";
    const date = iDate >= 0 ? cols[iDate] : "";
    txns.push({ date, amount, reference, counterparty, raw: line });
  }
  return txns;
}

function nameScore(a: string, b: string) {
  const x = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.75;
  return 0;
}

export function suggestPaymentMatches(txns: CsvTxn[], bills: UnpaidBill[]): MatchSuggestion[] {
  const used = new Set<string>();
  return txns.map((txn) => {
    let best: UnpaidBill | null = null;
    let bestScore = 0;
    let reason = "No close match — pick manually";
    for (const b of bills) {
      if (used.has(b.id)) continue;
      let score = 0;
      const bal = b.balance;
      if (Math.abs(bal - txn.amount) < 0.5) score += 0.7;
      else if (Math.abs(bal - txn.amount) / Math.max(bal, 1) < 0.02) score += 0.55;
      else if (txn.amount > 0 && bal > 0 && txn.amount <= bal + 1) score += 0.15;
      const ns = nameScore(txn.counterparty || txn.reference, b.customer_name);
      score += ns * 0.3;
      if (txn.reference.toLowerCase().includes(b.number.toLowerCase())) score += 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = b;
        reason =
          Math.abs(bal - txn.amount) < 0.5
            ? `Amount matches ${b.number}`
            : ns > 0.5
              ? `Name + amount near ${b.number}`
              : `Possible ${b.number}`;
      }
    }
    if (best && bestScore >= 0.55) used.add(best.id);
    return {
      txn,
      invoiceId: best && bestScore >= 0.55 ? best.id : null,
      invoiceNumber: best && bestScore >= 0.55 ? best.number : null,
      confidence: Math.min(0.99, +bestScore.toFixed(2)),
      reason,
    };
  });
}
