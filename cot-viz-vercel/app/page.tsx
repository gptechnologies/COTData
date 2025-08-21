"use client";

import { useEffect, useMemo, useState } from "react";
import Plot from "./components/Plot";

type Row = {
  date: string; symbol: string; long: number; short: number; net: number;
  d_long: number; d_short: number; d_net: number;
};

const GREEN = "#10b981";
const RED = "#ef4444";
const GRID = "#334155";
const AXIS = "#475569";
const BG = "#0f172a";
const DATE_FMT = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US");
};

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [symbol, setSymbol] = useState<string>("");
  const [showNet, setShowNet] = useState(false);
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  // Load data once
  useEffect(() => {
    fetch("/api/cot")
      .then(r => r.json())
      .then((data: Row[]) => {
        setRows(data);

        const syms = Array.from(new Set(data.map(r => r.symbol))).sort();
        const url = new URL(window.location.href);
        const qsSym = url.searchParams.get("symbol");
        const qsStart = url.searchParams.get("start");
        const qsEnd = url.searchParams.get("end");

        const initialSym = qsSym && syms.includes(qsSym) ? qsSym : syms[0] || "";
        setSymbol(initialSym);

        if (initialSym) {
          const dates = data.filter(r => r.symbol === initialSym).map(r => +new Date(r.date));
          const max = new Date(Math.max(...dates));
          const toISO = (d: Date) => d.toISOString().slice(0,10);
          // Streamlit default was both = most recent date
          setStart(qsStart ?? toISO(max));
          setEnd(qsEnd ?? toISO(max));
        }
      });
  }, []);

  // Keep URL in sync (shareable deep link)
  useEffect(() => {
    if (!symbol) return;
    const u = new URL(window.location.href);
    u.searchParams.set("symbol", symbol);
    if (start) u.searchParams.set("start", start);
    if (end) u.searchParams.set("end", end);
    history.replaceState(null, "", u.toString());
  }, [symbol, start, end]);

  const symbols = useMemo(
    () => Array.from(new Set(rows.map(r => r.symbol))).sort(),
    [rows]
  );

  // Apply filters
  const subset = useMemo(() => {
    if (!symbol || !start || !end) return [];
    const s = new Date(start); const e = new Date(end);
    const sNum = +s, eNum = +e;
    const minNum = Math.min(sNum, eNum);
    const maxNum = Math.max(sNum, eNum);
    return rows.filter(r => r.symbol === symbol && +new Date(r.date) >= minNum && +new Date(r.date) <= maxNum);
  }, [rows, symbol, start, end]);

  const empty = subset.length === 0;

  // Precompute vectors
  const xs = subset.map(r => r.date);
  const long = subset.map(r => r.long);
  const short = subset.map(r => r.short);
  const net = subset.map(r => r.net);
  const dLong = subset.map(r => r.d_long);
  const invDShort = subset.map(r => -r.d_short); // invert so covering is positive

  const customdata = subset.map(r => [r.long, r.short, r.net, r.d_long, r.d_short, r.d_net]);
  const hoverTemplate =
`<b>%{x|%m/%d/%Y}</b><br>
<span style="color:${GREEN}">● Long</span>: %{customdata[0]:,} &nbsp;&nbsp;
<span style="color:${RED}">● Short</span>: %{customdata[1]:,}<br>
Net: %{customdata[2]:+,}<br>
<span style="color:${GREEN}">ΔLong</span>: %{customdata[3]:+,} &nbsp;&nbsp;
<span style="color:${RED}">ΔShort</span>: %{customdata[4]:+,}<br>
ΔNet: %{customdata[5]:+,}<extra></extra>`;

  // Subplots via domains
  const y1Domain = [0.32, 1.0]; // top
  const y2Domain = [0.0, 0.28]; // bottom

  const traces: any[] = [
    // Hover carrier (invisible)
    {
      x: xs, y: long,
      mode: "lines",
      line: { color: "rgba(0,0,0,0)", width: 0 },
      customdata,
      hovertemplate: hoverTemplate,
      showlegend: false,
      xaxis: "x",
      yaxis: "y"
    },
    // Long / Short lines
    { x: xs, y: long, name: "Long", mode: "lines", line: { width: 2, color: GREEN }, hoverinfo: "skip", xaxis: "x", yaxis: "y" },
    { x: xs, y: short, name: "Short", mode: "lines", line: { width: 2, color: RED }, hoverinfo: "skip", xaxis: "x", yaxis: "y" },
    // Optional Net
    ...(showNet ? [{ x: xs, y: net, name: "Net", mode: "lines", line: { width: 1, dash: "dot", color: "#6b7280" }, hoverinfo: "skip", xaxis: "x", yaxis: "y" }] : []),
    // Bars (bottom)
    { x: xs, y: dLong, name: "ΔLong", type: "bar", marker: { color: GREEN }, opacity: 0.7, hoverinfo: "skip", xaxis: "x2", yaxis: "y2", showlegend: false },
    { x: xs, y: invDShort, name: "–ΔShort", type: "bar", marker: { color: RED }, opacity: 0.7, hoverinfo: "skip", xaxis: "x2", yaxis: "y2", showlegend: false }
  ];

  // Global data range for caption
  const allDates = rows.filter(r => r.symbol === symbol).map(r => +new Date(r.date));
  const globalMin = allDates.length ? new Date(Math.min(...allDates)) : null;
  const globalMax = allDates.length ? new Date(Math.max(...allDates)) : null;

  return (
    <div className="container">
      <h1>COT – Non-Commercial Positions</h1>

      <div className="grid3">
        <div className="select">
          <label>Asset</label>
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            disabled={symbols.length === 0}
          >
            {symbols.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="checkbox">
          <label>Show Net line (Long–Short)</label>
          <div>
            <input
              id="shownet"
              type="checkbox"
              checked={showNet}
              onChange={e => setShowNet(e.target.checked)}
            />{" "}
            <label htmlFor="shownet">Show Net</label>
          </div>
        </div>

        <div className="date" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="date">
            <label>Start date</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div className="date">
            <label>End date</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {empty ? (
        <div className="warn">No data in the selected range.</div>
      ) : (
        <>
          <Plot
            data={traces}
            layout={{
              height: 600,
              hovermode: "x unified",
              barmode: "relative",
              paper_bgcolor: BG,
              plot_bgcolor: BG,
              font: { color: "#ffffff" },
              margin: { l: 20, r: 20, t: 40, b: 40 },

              // axes (two subplots)
              xaxis: { domain: [0, 1], anchor: "y", tickformat: "%m/%d/%Y", showgrid: true, gridcolor: GRID, linecolor: AXIS, tickfont: { color: "#ffffff" }, titlefont: { color: "#ffffff" } },
              yaxis: { domain: [y1Domain[0], y1Domain[1]], title: "Contracts", zeroline: false, showgrid: true, gridcolor: GRID, linecolor: AXIS, tickfont: { color: "#ffffff" }, titlefont: { color: "#ffffff" } },

              xaxis2: { domain: [0, 1], anchor: "y2", matches: "x", title: "Week", tickformat: "%m/%d/%Y", showgrid: true, gridcolor: GRID, linecolor: AXIS, tickfont: { color: "#ffffff" }, titlefont: { color: "#ffffff" } },
              yaxis2: { domain: [y2Domain[0], y2Domain[1]], title: "Weekly Change", zeroline: true, zerolinecolor: AXIS, showgrid: true, gridcolor: GRID, linecolor: AXIS, tickfont: { color: "#ffffff" }, titlefont: { color: "#ffffff" } },

              // legend
              legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0, bgcolor: "rgba(0,0,0,0)" },

              // zero line on top subplot when Net shown
              shapes: [
                ...(showNet ? [{
                  type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
                  line: { width: 1, dash: "dot", color: AXIS }
                }] : []),
                // zero line on bars (bottom)
                {
                  type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: 0, y1: 0,
                  line: { width: 1, color: AXIS }
                }
              ],

              // subplot titles (white)
              annotations: [
                {
                  text: "Positions",
                  x: 0, xref: "paper", xanchor: "left",
                  y: 0.98, yref: "paper", yanchor: "top",
                  showarrow: false, font: { color: "#ffffff", size: 12 }
                },
                {
                  text: "Weekly Changes",
                  x: 0, xref: "paper", xanchor: "left",
                  y: 0.30, yref: "paper", yanchor: "top",
                  showarrow: false, font: { color: "#ffffff", size: 12 }
                }
              ],

              hoverlabel: {
                bgcolor: "#1f2937",
                bordercolor: AXIS,
                font: { size: 12, family: "sans-serif", color: "#ffffff" }
              }
            }}
            config={{ displayModeBar: true, responsive: true }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />

          <div className="caption">
            Showing {symbol || "—"} from {start ? DATE_FMT(start) : "—"} to {end ? DATE_FMT(end) : "—"}
            {globalMin && globalMax ? (
              <> (Data range: {DATE_FMT(globalMin.toISOString())} → {DATE_FMT(globalMax.toISOString())}).</>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
