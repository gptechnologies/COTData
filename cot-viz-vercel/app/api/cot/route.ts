import { NextResponse } from "next/server";
import Papa from "papaparse";

// Revalidate at the edge cache hourly
export const revalidate = 3600;

type Raw = Record<string, any>;
type Tidy = {
  date: string;   // ISO
  symbol: string;
  long: number;
  short: number;
  net: number;
  d_long: number;
  d_short: number;
  d_net: number;
};

function findHeader(headers: string[], ...candidates: string[]) {
  const lower = new Map(headers.map(h => [h.trim().toLowerCase(), h]));
  for (const c of candidates) {
    const found = lower.get(c.trim().toLowerCase());
    if (found) return found;
  }
  return undefined;
}

export async function GET() {
  const url = process.env.DATA_URL;
  if (!url) {
    return NextResponse.json({ error: "DATA_URL env var not set" }, { status: 500 });
  }

  const text = await fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(`Fetch ${r.status}`);
    return r.text();
  });

  const parsed = Papa.parse<Raw>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    return NextResponse.json({ error: parsed.errors[0].message }, { status: 500 });
  }

  const rows = parsed.data;
  if (!rows.length) return NextResponse.json([]);

  const headers = parsed.meta.fields ?? Object.keys(rows[0]);

  const dateH  = findHeader(headers,
    "Report_Date_as_YYYY_MM_DD", "date", "report_date");
  const symH   = findHeader(headers,
    "CONTRACT_MARKET_NAME", "symbol", "market", "asset");
  const longH  = findHeader(headers,
    "NonComm_Positions_Long_All", "long", "noncom_long", "noncomm_positions_long_all");
  const shortH = findHeader(headers,
    "NonComm_Positions_Short_All", "short", "noncom_short", "noncomm_positions_short_all");
  const dLongH = findHeader(headers,
    "Change_in_NonComm_Long_All", "d_long", "change_in_noncomm_long_all");
  const dShorH = findHeader(headers,
    "Change_in_NonComm_Short_All", "d_short", "change_in_noncomm_short_all");

  if (!dateH || !symH || !longH || !shortH) {
    return NextResponse.json({ error: "Missing required headers in CSV" }, { status: 400 });
  }

  // Coerce, drop bad, aggregate duplicates by (symbol, date)
  const byKey = new Map<string, { date: string; symbol: string; long: number; short: number; d_long?: number; d_short?: number }>();

  for (const r of rows) {
    const dateStr = String(r[dateH] ?? "").trim();
    const d = new Date(dateStr);
    if (isNaN(+d)) continue;

    const symbol = String(r[symH] ?? "").trim();
    if (!symbol) continue;

    const long = Number(r[longH] ?? 0);
    const short = Number(r[shortH] ?? 0);
    const d_long = dLongH ? Number(r[dLongH] ?? 0) : undefined;
    const d_short = dShorH ? Number(r[dShorH] ?? 0) : undefined;

    const key = `${symbol}__${d.toISOString().slice(0,10)}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.long += long;
      prev.short += short;
      if (d_long !== undefined) prev.d_long = (prev.d_long ?? 0) + d_long;
      if (d_short !== undefined) prev.d_short = (prev.d_short ?? 0) + d_short;
    } else {
      byKey.set(key, {
        date: new Date(d.toISOString().slice(0,10)).toISOString(),
        symbol, long, short, d_long, d_short
      });
    }
  }

  // Group by symbol, sort by date, compute deltas if missing
  const bySym = new Map<string, { date: string; symbol: string; long: number; short: number; d_long?: number; d_short?: number }[]>();
  for (const v of byKey.values()) {
    if (!bySym.has(v.symbol)) bySym.set(v.symbol, []);
    bySym.get(v.symbol)!.push(v);
  }

  const tidy: Tidy[] = [];
  for (const [sym, arr] of bySym) {
    arr.sort((a,b) => +new Date(a.date) - +new Date(b.date));
    let prev: typeof arr[number] | undefined;
    for (const r of arr) {
      const d_long = r.d_long ?? (prev ? r.long - prev.long : 0);
      const d_short = r.d_short ?? (prev ? r.short - prev.short : 0);
      tidy.push({
        date: r.date,
        symbol: sym,
        long: r.long,
        short: r.short,
        net: r.long - r.short,
        d_long,
        d_short,
        d_net: d_long - d_short
      });
      prev = r;
    }
  }

  return NextResponse.json(tidy, {
    headers: {
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
