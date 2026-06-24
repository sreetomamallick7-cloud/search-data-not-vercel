const { useState, useEffect, useRef } = React;

// ─── Chart.js Wrappers ────────────────────────────────────────────────────────

function useChart(ref, buildConfig, deps) {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(ref.current, buildConfig());
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, deps);
}

function HBarChart({ labels, data, colors, height = 280, onClickIndex, tooltipSuffix = '', overallTotal }) {
  const ref = useRef(null);
  const bg = colors || '#4f46e5';
  useChart(ref, () => ({
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 4, barThickness: 14 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { 
        legend: { display: false }, 
        tooltip: { 
          callbacks: { 
            label: ctx => {
              const val = ctx.parsed.x;
              const formattedVal = typeof val === 'number' ? val.toLocaleString() : val;
              if (overallTotal > 0 && typeof val === 'number') {
                const pct = ((val / overallTotal) * 100).toFixed(1);
                return ` ${formattedVal}${tooltipSuffix} (${pct}%)`;
              }
              return ' ' + formattedVal + tooltipSuffix;
            }
          } 
        } 
      },
      scales: { x: { grid: { color: '#f3f4f6' } }, y: { ticks: { font: { size: 11 } } } },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index); }
    }
  }), [JSON.stringify(labels), JSON.stringify(data), overallTotal]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function VBarChart({ labels, data, colors, height = 240, tooltipSuffix = '', onClickIndex }) {
  const ref = useRef(null);
  const bg = colors || labels.map(() => '#4f46e5');
  useChart(ref, () => ({
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y.toFixed(2) + tooltipSuffix } } },
      scales: { x: { ticks: { maxRotation: 40, font: { size: 11 } } }, y: { grid: { color: '#f3f4f6' } } },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index); }
    }
  }), [JSON.stringify(labels), JSON.stringify(data)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function StackedBarChart({ categories, series, height = 260, onClickIndex }) {
  // series: [{ label, data, color }]
  const ref = useRef(null);
  useChart(ref, () => ({
    type: 'bar',
    data: {
      labels: categories,
      datasets: series.map(s => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 2 }))
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true, grid: { color: '#f3f4f6' } }, y: { stacked: true, ticks: { font: { size: 11 } } } },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index, els[0].datasetIndex); }
    }
  }), [JSON.stringify(categories), JSON.stringify(series)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function DoughnutChart({ labels, data, colors, height = 260, onClickIndex, tooltipSuffix = '' }) {
  const ref = useRef(null);
  const bg = colors || labels.map((_, i) => `hsl(${i * 37}, 70%, 58%)`);
  useChart(ref, () => ({
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { 
        legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } }, 
        tooltip: { 
          callbacks: { 
            label: ctx => {
              const val = ctx.parsed;
              const totalVal = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = totalVal > 0 ? ((val / totalVal) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${fmt(val)}${tooltipSuffix} (${pct}%)`;
            }
          } 
        } 
      },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index); }
    }
  }), [JSON.stringify(labels), JSON.stringify(data), tooltipSuffix]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function ScatterParity({ points, height = 300 }) {
  // points: [{category, search_share, a2c_share, over_index}]
  const ref = useRef(null);
  const maxVal = Math.max(...points.map(p => Math.max(p.search_share, p.a2c_share)), 1) * 1.2;
  useChart(ref, () => ({
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Over-indexing (A2C > Search)',
          data: points.filter(p => p.over_index).map(p => ({ x: p.search_share, y: p.a2c_share, label: p.category })),
          backgroundColor: '#10b981',
          pointRadius: 7
        },
        {
          label: 'Under-indexing',
          data: points.filter(p => !p.over_index).map(p => ({ x: p.search_share, y: p.a2c_share, label: p.category })),
          backgroundColor: '#f43f5e',
          pointRadius: 7
        },
        {
          label: 'Parity Line',
          data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }],
          type: 'line', borderColor: '#94a3b8', borderDash: [6, 4], pointRadius: 0, fill: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => ctx.raw.label
              ? `${ctx.raw.label}: Search ${ctx.raw.x?.toFixed(1)}% / A2C ${ctx.raw.y?.toFixed(1)}%`
              : 'Parity'
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Search Share %' }, min: 0, max: maxVal },
        y: { title: { display: true, text: 'A2C Share %' }, min: 0, max: maxVal }
      }
    }
  }), [JSON.stringify(points)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v)    { return (v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function fmtPct(v) { return ((v ?? 0) * 100).toFixed(2) + '%'; }
function fmtCur(v) { return '$' + (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtN(v, d=1) { return typeof v === 'number' ? v.toFixed(d) : '—'; }

function GrowthPill({ v }) {
  if (v === undefined || v === null) return <span className="text-gray-400 text-xs">—</span>;
  const up = v >= 0;
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{up ? '+' : ''}{v.toFixed(1)}%</span>;
}

function ConvBadge({ v }) {
  const color = v > 1 ? 'bg-emerald-100 text-emerald-800' : v > 0.1 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700';
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${color}`}>{(v ?? 0).toFixed(3)}%</span>;
}

// ─── Insight ──────────────────────────────────────────────────────────────────
function Insight({ text, type = 'info' }) {
  if (!text) return null;
  const s = { info: 'bg-indigo-50 border-indigo-400 text-indigo-900', warn: 'bg-amber-50 border-amber-400 text-amber-900', success: 'bg-emerald-50 border-emerald-400 text-emerald-900', danger: 'bg-rose-50 border-rose-400 text-rose-900' };
  return <div className={`mt-4 border-l-4 px-4 py-3 rounded text-sm ${s[type]}`}><strong>💡 Insight:</strong> {text}</div>;
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ title, badge, children, insight, insightType }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        {title && <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>}
        {badge && <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      {children}
      <Insight text={insight} type={insightType} />
    </div>
  );
}

// ─── Word Cloud ───────────────────────────────────────────────────────────────
function WordCloud({ terms, onWordClick }) {
  if (!terms || terms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="text-xs text-gray-400 font-medium">No intent keywords found</span>
      </div>
    );
  }

  const searches = terms.map(t => t.searches);
  const maxS = Math.max(...searches, 1);
  const minS = Math.min(...searches, 0);

  // Curated premium HSL-derived colors for text
  const colors = [
    'text-indigo-400', 'text-emerald-400', 'text-amber-400',
    'text-rose-400', 'text-cyan-400', 'text-purple-400',
    'text-fuchsia-400', 'text-orange-400', 'text-pink-400',
    'text-sky-400', 'text-teal-400'
  ];

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-3 py-8 px-6 bg-slate-900 rounded-xl shadow-inner min-h-[200px] select-none border border-slate-800 transition-all duration-300 hover:shadow-md">
      {terms.map((t, idx) => {
        // Calculate size using square root scale to balance high volume items
        let size = 1.0; // default rem
        if (maxS > minS) {
          const ratio = (Math.sqrt(t.searches) - Math.sqrt(minS)) / (Math.sqrt(maxS) - Math.sqrt(minS));
          size = 0.85 + ratio * 1.35; // from 0.85rem to 2.2rem
        }
        const fontSize = `${size}rem`;
        const colorClass = colors[idx % colors.length];

        return (
          <span
            key={t.term_norm}
            onClick={() => onWordClick && onWordClick(t)}
            className={`cursor-pointer transition-transform hover:scale-110 font-medium ${colorClass}`}
            style={{ fontSize }}
            title={`${t.searches} searches`}
          >
            {t.term_norm}
          </span>
        );
      })}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ title, value, growth, sub }) {
  const up = growth >= 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      {growth !== undefined && growth !== null && <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{up ? '▲' : '▼'} {Math.abs(growth).toFixed(1)}% MoM</span>}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Drill-Down Modal ─────────────────────────────────────────────────────────
function DrillModal({ title, terms, onClose }) {
  const hasVisitRate = terms && terms.length > 0 && terms[0].visit_rate !== undefined;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-500">#</th>
                <th className="px-4 py-2 text-left text-gray-500">Term</th>
                <th className="px-4 py-2 text-right text-gray-500">Searches</th>
                {hasVisitRate && <th className="px-4 py-2 text-right text-gray-500">Visit Rate</th>}
                <th className="px-4 py-2 text-right text-gray-500">A2C</th>
                <th className="px-4 py-2 text-right text-gray-500">Orders</th>
              </tr>
            </thead>
            <tbody>
              {(terms || []).map((t, i) => (
                <tr key={i} className="border-t hover:bg-indigo-50 transition-colors">
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{t.term_norm}</td>
                  <td className="px-4 py-2 text-right">{fmt(t.searches)}</td>
                  {hasVisitRate && <td className="px-4 py-2 text-right font-semibold text-indigo-600">{fmtN(t.visit_rate * 100, 1)}%</td>}
                  <td className="px-4 py-2 text-right">{fmt(t.a2c_count)}</td>
                  <td className="px-4 py-2 text-right">{fmt(t.orders)}</td>
                </tr>
              ))}
              {(terms || []).length === 0 && <tr><td colSpan={hasVisitRate ? 6 : 5} className="px-4 py-8 text-center text-gray-400">No term data available</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t text-xs text-gray-400">{(terms || []).length} terms · Click outside to close</div>
      </div>
    </div>
  );
}

// ─── Data Table ───────────────────────────────────────────────────────────────
function SortIcon({ active, asc }) {
  return (
    <span className={`inline-flex flex-col ml-1.5 justify-center ${active ? 'text-indigo-600' : 'text-gray-300'}`} style={{ height: '14px', verticalAlign: 'middle' }}>
      <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '-2px', opacity: active && !asc ? 0.3 : 1 }}>
        <path d="M12 6l-6 6h12z" />
      </svg>
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24" style={{ marginTop: '-2px', opacity: active && asc ? 0.3 : 1 }}>
        <path d="M12 18l-6-6h12z" />
      </svg>
    </span>
  );
}

function DataTable({ cols, rows, maxH = 340 }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false); // default to descending (highest first) for metrics
    }
  };

  const sortedRows = React.useMemo(() => {
    if (!rows || rows.length === 0) return [];
    if (!sortKey) return rows;

    const sorted = [...rows];
    sorted.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (valA === undefined || valA === null) {
        if (valB === undefined || valB === null) return 0;
        return 1;
      }
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        return sortAsc ? (valA ? 1 : -1) : (valA ? -1 : 1);
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [rows, sortKey, sortAsc]);

  if (!rows || rows.length === 0) return <p className="text-sm text-gray-400 py-6 text-center">No data</p>;
  return (
    <div className="overflow-auto rounded border border-gray-100" style={{ maxHeight: maxH }}>
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {cols.map(c => {
              const isSortable = !!c.sortable;
              return (
                <th
                  key={c.key}
                  onClick={() => isSortable && handleSort(c.key)}
                  className={`px-3 py-2 font-semibold text-gray-500 select-none ${c.right ? 'text-right' : 'text-left'} ${
                    isSortable ? 'cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors' : ''
                  }`}
                >
                  <div className={`inline-flex items-center ${c.right ? 'justify-end w-full' : ''}`}>
                    <span>{c.label}</span>
                    {isSortable && <SortIcon active={sortKey === c.key} asc={sortAsc} />}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i} className="border-t hover:bg-indigo-50 transition-colors cursor-pointer" onClick={() => r._onClick && r._onClick()}>
              {cols.map(c => (
                <td key={c.key} className={`px-3 py-2 ${c.right ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function Layer2({ layer2 }) {
  const [activeSection, setActiveSection] = useState('2.5');
  const [drill, setDrill] = useState(null);

  const sections = [
    { id: '2.5',  label: '2.5 Long-Tail Depth', both: false },
    { id: '2.7',  label: "2.7 Men's Intent",    both: false },
    { id: '2.9',  label: '2.9 Breakout Index',  both: true  },
    { id: '2.10', label: '2.10 Share Shift',     both: true  },
  ];

  const hasBoth = !!(layer2?.['2.9']?.categories?.length);

  const d25 = layer2?.['2.5'] || {};
  const d27 = layer2?.['2.7'] || {};
  const d29 = layer2?.['2.9'] || {};
  const d210= layer2?.['2.10']|| {};

  return (
    <div className="flex gap-5">
      {/* Sub-nav */}
      <div className="w-44 flex-shrink-0">
        <nav className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-4">
          {sections.map(s => {
            const disabled = s.both && !hasBoth;
            return (
              <button key={s.id} onClick={() => !disabled && setActiveSection(s.id)} disabled={disabled}
                className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-100 last:border-0
                  ${activeSection === s.id ? 'bg-indigo-600 text-white font-semibold' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-indigo-50'}`}>
                {s.label}{s.both && !hasBoth && <span className="ml-1">🔄</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* 2.5 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.5' && (
          <Card title="2.5 · Long-Tail Query Depth by Category" badge="Stacked: head vs long-tail" insight={d25.insight}>
            <StackedBarChart
              categories={(d25.table||[]).map(d=>d.category)}
              series={[
                { label: 'Head Terms', data:(d25.table||[]).map(d=>d.hd_searches||0), color:'#4f46e5' },
                { label: 'Long-Tail', data:(d25.table||[]).map(d=>d.lt_searches||0), color:'#a855f7' },
              ]}
              height={300}
              onClickIndex={(i, dsIndex) => {
                const row = (d25.table||[])[i];
                if(row) {
                  const isLT = dsIndex === 1;
                  setDrill({title: row.category + (isLT ? ' — Long-Tail Terms' : ' — Head Terms'), terms: isLT ? row.lt_terms : row.hd_terms});
                }
              }}
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'hd_searches', label:'Head Searches', right:true, render:(v, r)=><button className="text-indigo-600 hover:underline" onClick={(e)=>{e.stopPropagation(); setDrill({title:r.category+' — Head Terms', terms:r.hd_terms||[]})}}>{fmt(v)}</button> },
              { key:'lt_searches', label:'Long-Tail Searches', right:true, render:(v, r)=><button className="text-purple-600 hover:underline" onClick={(e)=>{e.stopPropagation(); setDrill({title:r.category+' — Long-Tail Terms', terms:r.lt_terms||[]})}}>{fmt(v)}</button> },
              { key:'lt_pct', label:'Long-Tail %', right:true, render:v=>fmtN(v)+'%' },
            ]} rows={d25.table||[]} />
          </Card>
        )}

        {/* 2.7 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.7' && (
          <>
            <Card title="2.7 · Men's Jewelry Intent Summary" insight={d27.insight} insightType="info">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                {[
                  { label: 'Unique Terms',  value: fmt(d27.term_count) },
                  { label: 'Searches',      value: fmt(d27.searches) },
                  { label: '% of Total',    value: fmtN(d27.pct_of_total)+'%' },
                  { label: 'Conversion',    value: fmtN(d27.conversion)+'%' },
                ].map((k,i) => (
                  <div key={i} className="bg-indigo-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-indigo-700">{k.value}</p>
                    <p className="text-xs text-indigo-500 mt-1">{k.label}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="2.7 · Men's Jewelry Terms" badge="Click row for detail">
              <DataTable maxH={340} cols={[
                { key:'term_norm', label:'Term' },
                { key:'category', label:'Category' },
                { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
                { key:'a2c_count', label:'A2C', right:true, render:v=>fmt(v) },
                { key:'orders', label:'Orders', right:true, render:v=>fmt(v) },
              ]} rows={d27.terms||[]} />
            </Card>
          </>
        )}

        {/* 2.9 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.9' && (
          <Card title="2.9 · Category Breakout Index" badge="Both periods" insight={d29.insight} insightType="success">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(d29.categories||[]).map((c,i) => (
                <div key={i} className={`rounded-xl border p-4 ${i===0 ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-800 text-sm">{c.category}</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${c.breakout_score >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>{fmtN(c.breakout_score,0)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Primary driver: <strong>{c.primary_driver}</strong></p>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>Search: <GrowthPill v={c.search_growth} /></span>
                    <span>A2C: <GrowthPill v={c.a2c_rate_change} /></span>
                    <span>Terms: <GrowthPill v={c.term_count_growth} /></span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 2.10 ────────────────────────────────────────────────────────────── */}
        {activeSection === '2.10' && (
          <Card title="2.10 · Category Search Share Shift (Δ pp MoM)" insight={d210.insight}>
            <VBarChart
              labels={(d210.chart||[]).map(d=>d.category)}
              data={(d210.chart||[]).map(d=>d.delta||0)}
              colors={(d210.chart||[]).map(d=>(d.delta||0)>=0?'#10b981':'#f43f5e')}
              tooltipSuffix="pp"
              height={260}
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'prev_share', label:'Prev Share', right:true, render:v=>fmtN(v)+'%' },
              { key:'curr_share', label:'Curr Share', right:true, render:v=>fmtN(v)+'%' },
              { key:'delta', label:'Δ pp', right:true, render:v=><GrowthPill v={v}/> },
            ]} rows={d210.chart||[]} />
          </Card>
        )}

      </div>
      {drill && <DrillModal title={drill.title} terms={drill.terms} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 (unchanged below – full copy kept for single-file deploy)
// ─────────────────────────────────────────────────────────────────────────────
function ClusterRow({ c, onDrill }) {
  const [open, setOpen] = React.useState(false);

  const hasConvDelta  = c.conv_delta != null;
  const hasSrchDelta  = c.searches_delta != null;
  const isZeroConv    = c.orders === 0 && c.searches >= 500;
  const convUp        = (c.conv_delta || 0) >= 0;
  const srchUp        = (c.searches_delta || 0) >= 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">

      {/* ── Header row (always visible) ── */}
      <div
        className="flex items-start justify-between px-4 py-3
                   bg-gray-50 cursor-pointer hover:bg-indigo-50
                   transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Left: name + zero-conv badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-gray-800">
            {c.cluster}
          </span>
          {isZeroConv && (
            <span className="text-xs px-2 py-0.5 rounded-full
                             bg-rose-100 text-rose-700
                             border border-rose-200 font-medium
                             whitespace-nowrap">
              0 orders
            </span>
          )}
        </div>

        {/* Right: metrics */}
        <div className="flex items-center gap-5 ml-4 flex-shrink-0">

          {/* Searches + MoM */}
          <div className="text-right">
            <div className="text-xs font-semibold text-gray-700">
              {fmt(c.searches)}
            </div>
            {hasSrchDelta && (
              <div className={`text-xs font-semibold
                ${srchUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                {srchUp ? '▲' : '▼'}
                {srchUp ? '+' : ''}{c.searches_delta}%
              </div>
            )}
            <div className="text-xs text-gray-400">searches</div>
          </div>

          {/* Conversion rate + conv delta */}
          <div className="text-right">
            <div className={`text-xs font-semibold
              ${c.conv_rate > 0 ? 'text-gray-700' : 'text-rose-500'}`}>
              {c.conv_rate.toFixed(2)}%
            </div>
            {hasConvDelta && (
              <div className={`text-xs font-semibold
                ${convUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                {convUp ? '+' : ''}{c.conv_delta.toFixed(3)}pp
              </div>
            )}
            <div className="text-xs text-gray-400">conv rate</div>
          </div>

          {/* Term count */}
          <div className="text-right">
            <div className="text-xs font-semibold text-gray-700">
              {c.term_count}
            </div>
            <div className="text-xs text-gray-400">terms</div>
          </div>

          {/* Expand / drill controls */}
          <div className="flex items-center gap-2 ml-1">
            <button
              onClick={e => { e.stopPropagation(); onDrill(c); }}
              className="text-xs text-indigo-600 hover:text-indigo-800
                         font-medium whitespace-nowrap"
            >
              drill →
            </button>
            <span className="text-gray-400 text-xs">
              {open ? '▲' : '▼'}
            </span>
          </div>

        </div>
      </div>

      {/* ── Term pills (visible when expanded) ── */}
      {open && (
        <div className="px-4 py-3 flex flex-wrap gap-2
                        border-t border-gray-100 bg-white">
          {(c.terms || []).map((t, j) => (
            <span key={j}
                  className="bg-indigo-50 text-indigo-700 text-xs
                             px-2 py-1 rounded-full border
                             border-indigo-100">
              {t.term_norm}
              <span className="text-indigo-400 ml-1">
                ({fmt(t.searches)})
              </span>
            </span>
          ))}
          {(c.terms || []).length === 0 && (
            <span className="text-xs text-gray-400">No terms</span>
          )}
        </div>
      )}

    </div>
  );
}

function IntentTierHeader({ label, sublabel }) {
  return (
    <div className="flex items-baseline gap-3 mt-2 mb-3">
      <span className="text-xs font-semibold text-gray-700
                       uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xs text-gray-400">{sublabel}</span>
    </div>
  );
}

function Layer1({ layer1 }) {
  const [drill, setDrill] = useState(null);
  const [activeSection, setActiveSection] = useState('1.1');
  const [view11, setView11] = useState('volume');
  const [minSearches15, setMinSearches15] = useState(0);

  // Returns 'green' | 'amber' | 'red' for a given rate value
  // thr = the site-average for that metric (decimal 0–1)
  // val = the term's rate value (decimal 0–1)
  function rateBand(val, thr) {
    if (val == null) return 'amber'; // And in rateBand for purchase_rate, return 'amber' if val is null.
    if (thr == null || thr === 0) return 'amber'; // no baseline, default neutral
    if (val >= thr)           return 'green';  // at or above site average
    if (val >= thr * 0.5)     return 'amber';  // 50–99% of site average
    return 'red';                               // below 50% of site average
  }

  // Returns 'green' | 'amber' | 'red' for composite signal
  // Counts how many of the 3 metrics are 'red'
  function compositeSignal(vBand, aBand, pBand) {
    const reds = [vBand, aBand, pBand].filter(b => b === 'red').length;
    if (reds === 0) return 'green';
    if (reds === 1) return 'amber';
    return 'red';
  }

  // Tailwind classes for each band's rate cell
  function bandClasses(band) {
    return {
      green: 'bg-emerald-50 text-emerald-700 font-semibold',
      amber: 'bg-amber-50   text-amber-700   font-semibold',
      red:   'bg-rose-50    text-rose-700    font-semibold',
    }[band];
  }

  // Tailwind classes for composite signal dot
  function signalDotClass(sig) {
    return {
      green: 'bg-emerald-500',
      amber: 'bg-amber-400',
      red:   'bg-rose-500',
    }[sig];
  }

  const sections = [
    { id: '1.1',  label: '1.1 Top 50 Terms', both: false },
    { id: '1.5',  label: '1.5 Long-Tail',     both: false },
    { id: '1.6',  label: '1.6 Occasions',     both: false },
    { id: '1.9',  label: '1.9 Rising',        both: true  },
    { id: '1.10', label: '1.10 Falling',       both: true  },
    { id: '1.11', label: '1.11 New Terms',     both: true  },
    { id: '1.13', label: '1.13 Breakouts',     both: true  },
  ];

  const d11raw   = layer1?.['1.1'] || {};
  const d11      = d11raw.terms || [];
  const d11thr   = d11raw.thresholds || null;

  const hasPrev  = d11.some(r => r.prev_searches != null && r.prev_searches > 0);

  useEffect(() => {
    if (!hasPrev) {
      setView11('volume');
    }
  }, [hasPrev]);

  const d15  = layer1?.['1.5'] || {};
  const d16  = layer1?.['1.6'] || {};
  const d19  = layer1?.['1.9'] || {};
  const d110 = layer1?.['1.10'] || {};
  const d111 = layer1?.['1.11'] || {};
  const d113 = layer1?.['1.13'] || {};
  const hasBoth = d19?.terms?.length > 0;

  const thrUnavailable = !d11thr || (d11thr.visit_rate === 0 && d11thr.a2c_rate === 0 && d11thr.purchase_rate === 0);

  function TermRow({ t, rank, showBadge }) {
    // t is an enriched term object (has vBand, aBand, pBand, sig, mom)

    // Annotation badge logic
    const badge = (() => {
      if (!showBadge) return null;
      if (t.mom > 30 && (t.vBand === 'red' || t.aBand === 'red'))
        return { label: 'growing — broken funnel', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
      if (t.mom != null && t.mom < -20 && t.sig === 'green')
        return { label: 'declining — rates still healthy', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      return null;
    })();

    return (
      <tr className="border-b border-gray-100 hover:bg-indigo-50 transition-colors">

        {/* Rank */}
        <td className="px-3 py-2 text-xs text-gray-400 w-8">{rank}</td>

        {/* Term + category */}
        <td className="px-3 py-2" style={{ width: '200px' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span 
              className="text-xs font-medium text-gray-800 hover:text-indigo-600 hover:underline cursor-pointer"
              onClick={() => setDrill({ title: t.term_norm, terms: [t] })}
            >
              {t.term_norm}
            </span>
            {badge && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badge.cls}`}>
                {badge.label}
              </span>
            )}
          </div>
          <span 
            className="text-xs bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-700 px-1.5 py-0.5 rounded-full mt-1 inline-block cursor-pointer transition-colors"
            onClick={() => {
              const filtered = d11.filter(item => item.category === t.category);
              setDrill({ title: t.category + ' — Terms', terms: filtered });
            }}
          >
            {t.category}
          </span>
        </td>

        {/* Searches + MoM delta (two-line cell) */}
        <td className="px-3 py-2 text-right" style={{ width: '120px' }}>
          <div className="text-xs font-semibold text-gray-800">
            {fmt(t.searches)}
          </div>
          {t.mom != null ? (
            <div className={`text-xs font-semibold mt-0.5
              ${t.mom > 2 ? 'text-emerald-600' : t.mom < -2 ? 'text-rose-600' : 'text-gray-400'}`}>
              {t.mom > 2 ? '▲' : t.mom < -2 ? '▼' : '~'}
              {t.mom > 0 ? '+' : ''}{t.mom}%
            </div>
          ) : (
            <div className="text-xs text-gray-300 mt-0.5">no prev</div>
          )}
        </td>

        {/* Visit Rate % */}
        <td className="px-3 py-2 text-right" style={{ width: '80px' }}>
          <span className={`text-xs px-2 py-0.5 rounded ${bandClasses(t.vBand)}`}>
            {(t.visit_rate * 100).toFixed(1)}%
          </span>
        </td>

        {/* A2C Rate % */}
        <td className="px-3 py-2 text-right" style={{ width: '75px' }}>
          <span className={`text-xs px-2 py-0.5 rounded ${bandClasses(t.aBand)}`}>
            {(t.a2c_rate_s * 100).toFixed(1)}%
          </span>
        </td>

        {/* Purchase Rate % */}
        <td className="px-3 py-2 text-right" style={{ width: '75px' }}>
          {t.purchase_rate != null
            ? <span className={`text-xs px-2 py-0.5 rounded ${bandClasses(t.pBand)}`}>
                {(t.purchase_rate * 100).toFixed(1)}%
              </span>
            : <span className="text-xs text-gray-400">—</span>
          }
        </td>

        {/* Composite signal dot */}
        <td className="px-3 py-2 text-center" style={{ width: '44px' }}>
          {!thrUnavailable && (
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${signalDotClass(t.sig)}`} />
          )}
        </td>
      </tr>
    );
  }

  const [sortKey, setSortKey] = useState('searches');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'term_norm' ? true : false);
    }
  };

  const sortTerms = (list) => {
    return [...list].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Custom mapping for signal
      if (sortKey === 'sig') {
        const sigMap = { green: 3, amber: 2, red: 1 };
        valA = sigMap[a.sig] || 0;
        valB = sigMap[b.sig] || 0;
      }

      if (valA === undefined || valA === null) {
        if (valB === undefined || valB === null) return 0;
        return sortAsc ? -1 : 1;
      }
      if (valB === undefined || valB === null) {
        return sortAsc ? 1 : -1;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortAsc ? valA - valB : valB - valA;
    });
  };

  function TermTableHead() {
    const renderHeader = (key, label, sortKeyTarget = key) => {
      const active = sortKey === sortKeyTarget;
      return (
        <span 
          onClick={() => handleSort(sortKeyTarget)}
          className={`cursor-pointer hover:text-gray-900 select-none transition-colors inline-flex items-center gap-1 ${active ? 'text-indigo-600 font-bold' : ''}`}
        >
          {label}
          <SortIcon active={active} asc={sortAsc} />
        </span>
      );
    };

    return (
      <thead className="sticky top-0 bg-gray-50 z-10">
        <tr className="border-b border-gray-200 text-xs text-gray-500 font-medium">
          <th className="px-3 py-2 text-left w-8">#</th>
          <th className="px-3 py-2 text-left w-[200px]">
            {renderHeader('term_norm', 'Term')}
          </th>
          <th className="px-3 py-2 text-right w-[120px]">
            {renderHeader('searches', 'Searches')}
            <span className="mx-1 text-gray-300">/</span>
            {renderHeader('mom', 'MoM')}
          </th>
          <th className="px-3 py-2 text-right w-[80px]">
            {renderHeader('visit_rate', 'Visit %')}
          </th>
          <th className="px-3 py-2 text-right w-[75px]">
            {renderHeader('a2c_rate_s', 'A2C %')}
          </th>
          <th className="px-3 py-2 text-right w-[75px]">
            {renderHeader('purchase_rate', 'Purchase %')}
          </th>
          <th className="px-3 py-2 text-center w-[44px]">
            {renderHeader('sig', 'Signal')}
          </th>
        </tr>
      </thead>
    );
  }

  // Per-term enriched objects (add band + signal to each term)
  const enriched = d11.map(t => {
    const vBand = rateBand(t.visit_rate,    d11thr?.visit_rate);
    const aBand = rateBand(t.a2c_rate_s,    d11thr?.a2c_rate);
    const pBand = rateBand(t.purchase_rate, d11thr?.purchase_rate);
    const sig   = compositeSignal(vBand, aBand, pBand);
    const mom   = t.searches_growth != null ? Math.round(t.searches_growth) : null;
    return { ...t, vBand, aBand, pBand, sig, mom };
  });

  // Summary counts
  const growCount    = enriched.filter(t => t.mom != null && t.mom > 2).length;
  const declineCount = enriched.filter(t => t.mom != null && t.mom < -2).length;
  const stableCount  = enriched.length - growCount - declineCount;

  // For growth view
  const growers   = [...enriched].filter(t => t.mom != null && t.mom > 2);
  const decliners = [...enriched].filter(t => t.mom != null && t.mom < -2);
  const stable    = [...enriched].filter(t => t.mom != null && t.mom >= -2 && t.mom <= 2);

  // Volume view: sorted by searches desc (default)
  const byVolume = [...enriched];

  return (
    <div className="flex gap-5">
      <div className="w-44 flex-shrink-0">
        <nav className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-4">
          {sections.map(s => {
            const disabled = s.both && !hasBoth;
            return (
              <button key={s.id} onClick={() => !disabled && setActiveSection(s.id)} disabled={disabled}
                className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-100 last:border-0
                  ${activeSection === s.id ? 'bg-indigo-600 text-white font-semibold' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-indigo-50'}`}>
                {s.label}{s.both && !hasBoth && <span className="ml-1">🔄</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 min-w-0 space-y-5">
        {activeSection === '1.1' && (
          <>
            {/* Summary Bar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {hasPrev ? (
                <>
                  <span className="text-xs px-3 py-1 rounded-full font-semibold
                                   bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ↑ {growCount} growing
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full font-semibold
                                   bg-gray-100 text-gray-600 border border-gray-200">
                    {stableCount} stable
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full font-semibold
                                   bg-rose-50 text-rose-700 border border-rose-200">
                    ↓ {declineCount} declining
                  </span>
                </>
              ) : (
                <span className="text-xs px-3 py-1 rounded-full font-semibold
                                 bg-gray-100 text-gray-600 border border-gray-200">
                  {d11.length} terms
                </span>
              )}

              {/* Threshold reference — helps stakeholders understand the colour scale */}
              {thrUnavailable ? (
                <span className="ml-auto text-xs text-amber-600 font-semibold">
                  ⚠️ Threshold data unavailable — rates shown without colour banding
                </span>
              ) : (
                d11thr && (
                  <span className="ml-auto text-xs text-gray-400">
                    Site avg — Visit: {(d11thr.visit_rate * 100).toFixed(1)}%
                    · A2C: {(d11thr.a2c_rate * 100).toFixed(1)}%
                    · Purch: {(d11thr.purchase_rate * 100).toFixed(1)}%
                    &nbsp;(green = at/above avg, amber = 50–99% of avg, red = below 50%)
                  </span>
                )
              )}
            </div>

            {/* View Toggle Tabs */}
            <div className="flex gap-0 mb-4 border border-gray-200
                            rounded-lg overflow-hidden w-fit text-xs">
              {[
                { id: 'volume', label: 'By volume' },
                { id: 'growth', label: 'By growth / decline', disabled: !hasPrev }
              ].map(tab => (
                <button
                  key={tab.id}
                  disabled={tab.disabled}
                  onClick={() => setView11(tab.id)}
                  className={`px-4 py-2 font-medium transition-colors border-r
                              border-gray-200 last:border-0
                    ${view11 === tab.id
                      ? 'bg-indigo-600 text-white'
                      : tab.disabled
                        ? 'text-gray-300 cursor-not-allowed bg-white'
                        : 'text-gray-600 hover:bg-indigo-50 bg-white'}`}
                >
                  {tab.label}
                  {tab.disabled && <span className="ml-1 text-gray-300">🔄</span>}
                </button>
              ))}
            </div>

            {view11 === 'volume' ? (
              <Card title="1.1 · Top 50 terms by search volume"
                    badge="Click a category pill to drill into that category">
                <div className="flex justify-between items-center mb-2 px-1">
                  <span className="text-xs text-gray-400">
                    Sorted by {sortKey === 'searches' ? 'Volume' : sortKey === 'mom' ? 'Growth (MoM %)' : sortKey === 'term_norm' ? 'Name' : sortKey === 'visit_rate' ? 'Visit %' : sortKey === 'a2c_rate_s' ? 'A2C %' : sortKey === 'purchase_rate' ? 'Purchase %' : 'Signal'} ({sortAsc ? 'ascending' : 'descending'})
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: '520px' }}>
                  <table className="min-w-full text-xs" style={{ tableLayout: 'fixed' }}>
                    <TermTableHead />
                    <tbody>
                      {sortTerms(byVolume).map((t, i) => (
                        <TermRow key={t.term_norm} t={t} rank={i + 1} showBadge={false} />
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Insight box at BOTTOM — standard position for reference context */}
                <Insight text="Sorted by search volume. Signal dot = composite funnel health.
                               Green = all 3 rates at/above site average.
                               Amber = one rate below average. Red = two or more broken." />
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs text-gray-400">
                    Sorted by {sortKey === 'searches' ? 'Volume' : sortKey === 'mom' ? 'Growth (MoM %)' : sortKey === 'term_norm' ? 'Name' : sortKey === 'visit_rate' ? 'Visit %' : sortKey === 'a2c_rate_s' ? 'A2C %' : sortKey === 'purchase_rate' ? 'Purchase %' : 'Signal'} ({sortAsc ? 'ascending' : 'descending'})
                  </span>
                </div>

                {/* GROWERS SECTION */}
                <div>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-xs font-semibold text-emerald-700
                                     bg-emerald-50 border border-emerald-200
                                     px-3 py-1 rounded-full">
                      ↑ Top growers ({growers.length} terms) — are they converting?
                    </span>
                  </div>
                  <div className="overflow-auto rounded-xl border border-gray-200"
                       style={{ maxHeight: '380px' }}>
                    <table className="min-w-full text-xs" style={{ tableLayout: 'fixed' }}>
                      <TermTableHead />
                      <tbody>
                        {sortTerms(growers).map((t, i) => (
                          <TermRow key={t.term_norm} t={t} rank={i + 1} showBadge={true} />
                        ))}
                        {growers.length === 0 && (
                          <tr><td colSpan={7}
                                  className="px-4 py-6 text-center text-gray-400 text-xs">
                            No growing terms this period (or no previous period uploaded)
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* STABLE SECTION */}
                <div>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-xs font-semibold text-slate-700
                                     bg-slate-50 border border-slate-200
                                     px-3 py-1 rounded-full">
                      → Stable terms ({stable.length} terms) — steady performance
                    </span>
                  </div>
                  <div className="overflow-auto rounded-xl border border-gray-200"
                       style={{ maxHeight: '380px' }}>
                    <table className="min-w-full text-xs" style={{ tableLayout: 'fixed' }}>
                      <TermTableHead />
                      <tbody>
                        {sortTerms(stable).map((t, i) => (
                          <TermRow key={t.term_norm} t={t} rank={i + 1} showBadge={true} />
                        ))}
                        {stable.length === 0 && (
                          <tr><td colSpan={7}
                                  className="px-4 py-6 text-center text-gray-400 text-xs">
                            No stable terms this period
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DECLINERS SECTION */}
                <div>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-xs font-semibold text-rose-700
                                     bg-rose-50 border border-rose-200
                                     px-3 py-1 rounded-full">
                      ↓ Declining terms ({decliners.length} terms) — worth fighting for?
                    </span>
                  </div>
                  <div className="overflow-auto rounded-xl border border-gray-200"
                       style={{ maxHeight: '380px' }}>
                    <table className="min-w-full text-xs" style={{ tableLayout: 'fixed' }}>
                      <TermTableHead />
                      <tbody>
                        {sortTerms(decliners).map((t, i) => (
                          <TermRow key={t.term_norm} t={t} rank={i + 1} showBadge={true} />
                        ))}
                        {decliners.length === 0 && (
                          <tr><td colSpan={7}
                                  className="px-4 py-6 text-center text-gray-400 text-xs">
                            No declining terms this period
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Insight
                  text="Growers with amber/red rate cells = demand rising into a broken funnel —
                        fix search relevance or catalog before investing in growth.
                        Decliners with green signal = demand fell but product experience is intact —
                        investigate seasonality, external competition, or marketing pause."
                  type="info"
                />
              </div>
            )}
          </>
        )}
        {activeSection === '1.5' && (() => {
          const d15 = layer1?.['1.5'] || {};
          const hasShareShift = d15.share_shift != null;
          const shiftUp       = (d15.share_shift || 0) > 0;
          const zeroCarts     = d15.zero_cart_terms || [];
          const topTerms      = d15.top_terms || [];

          // Apply minimum searches filter
          const filteredZeroCarts = zeroCarts.filter(t => t.searches >= minSearches15);
          const filteredTopTerms  = topTerms.filter(t => t.searches >= minSearches15);

          return (
            <>
              {/* ── Minimum searches terms filter ── */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 mb-4 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Filter by minimum searches:
                </span>
                <div className="flex gap-2">
                  {[0, 21, 50, 100].map(val => (
                    <button
                      key={val}
                      onClick={() => setMinSearches15(val)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold border transition-all duration-200
                        ${minSearches15 === val
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      {val === 0 ? 'All' : `≥ ${val}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── PART A — SHARE SHIFT HEADLINE ── */}
              {hasShareShift && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl
                                 border mb-4 text-sm font-medium
                  ${Math.abs(d15.share_shift) < 1
                    ? 'bg-gray-50 border-gray-200 text-gray-600'
                    : shiftUp
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                  <span>
                    Long-tail share of total searches:
                    <strong className="mx-1">{d15.pct_of_searches_prev}%</strong>
                    last week →
                    <strong className="mx-1">{d15.pct_of_searches}%</strong>
                    this week
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                                    border ml-auto
                    ${Math.abs(d15.share_shift) < 1
                      ? 'bg-gray-100 text-gray-500 border-gray-200'
                      : shiftUp
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-rose-100 text-rose-700 border-rose-300'
                    }`}>
                    {shiftUp ? '+' : ''}{d15.share_shift}pp MoM
                  </span>
                </div>
              )}

              {/* ── Word Cloud for Actionable High-Volume Keywords ── */}
              <Card
                title="1.5 · Actionable High-Volume Gaps (Word Cloud)"
                badge="Catalog & Relevance Gaps"
              >
                <WordCloud
                  terms={filteredZeroCarts}
                  onWordClick={(t) => setDrill({
                    title: `${t.term_norm} — zero cart actionable context`,
                    terms: [
                      {
                        term_norm: t.term_norm,
                        searches: t.searches,
                        visit_rate: t.visit_rate,
                        a2c_count: 0,
                        orders: 0
                      }
                    ]
                  })}
                />
              </Card>

              {/* ── PART B — ACTION CARD (zero-cart terms) ── */}
              <Card
                title="1.5 · High intent, zero cart — catalog & relevance gaps"
                badge={`${filteredZeroCarts.length} terms`}
                insightType="danger"
                insight={
                  filteredZeroCarts.length > 0
                    ? `These users know exactly what they want but left empty-handed.
                       Low visit rate = search isn't surfacing the right results.
                       Good visit rate + 0 A2C = the product doesn't exist in catalog
                       or price point is wrong.`
                    : null
                }
              >
                {filteredZeroCarts.length > 0
                  ? (
                    <DataTable
                      maxH={360}
                      cols={[
                        { key: 'term_norm',   label: 'Term' },
                        { key: 'category',    label: 'Category' },
                        { key: 'searches',    label: 'Searches',
                          right: true, render: v => fmt(v) },
                        { key: 'visit_rate',  label: 'Visit %',
                          right: true,
                          render: v => {
                            // visit_rate tells you WHERE the funnel breaks:
                            // low = search relevance issue, ok = catalog gap
                            const pct   = (v * 100).toFixed(1);
                            const color = v >= 0.4
                              ? 'text-amber-600'   // visits happening = catalog gap
                              : 'text-rose-600';   // not even clicking = relevance gap
                            return (
                              <span className={`font-semibold ${color}`}>
                                {pct}%
                              </span>
                            );
                          }
                        },
                      ]}
                      rows={filteredZeroCarts}
                    />
                  )
                  : (
                    <p className="text-sm text-gray-400 py-6 text-center">
                      No long-tail terms matching search criteria have zero cart-adds this period.
                    </p>
                  )
                }
              </Card>

              {/* ── PART C — REFERENCE CARD (metrics + top terms) ── */}
              <Card
                title="1.5 · Long-tail overview — reference"
                badge="Not action items"
              >
                {/* Summary metric tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Long-tail terms',     value: fmt(d15.term_count) },
                    { label: '% of unique terms',   value: fmtN(d15.pct_of_unique_terms) + '%' },
                    { label: '% of total searches', value: fmtN(d15.pct_of_searches) + '%' },
                    { label: 'Avg conversion',      value: fmtN(d15.avg_conversion, 3) + '%' },
                  ].map((k, i) => (
                    <div key={i}
                         className="bg-indigo-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-indigo-700">
                        {k.value}
                      </p>
                      <p className="text-xs text-indigo-500 mt-1">{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* Top long-tail terms */}
                <p className="text-xs text-gray-400 mb-2">
                  Top long-tail terms by search volume this period
                </p>
                <DataTable
                  maxH={280}
                  cols={[
                    { key: 'term_norm',  label: 'Term' },
                    { key: 'category',   label: 'Category' },
                    { key: 'searches',   label: 'Searches',
                      right: true, render: v => fmt(v) },
                    { key: 'a2c_count',  label: 'A2C',
                      right: true, render: v => fmt(v) },
                    { key: 'orders',     label: 'Orders',
                      right: true, render: v => fmt(v) },
                  ]}
                  rows={filteredTopTerms}
                />

                <Insight text={d15.insight} type="info" />
              </Card>
            </>
          );
        })()}
        {activeSection === '1.6' && (() => {
          const d16              = layer1?.['1.6'] || {};
          const occasionClusters = d16.occasion_clusters || [];
          const useCaseClusters  = d16.use_case_clusters || [];
          const hasDeltas        = occasionClusters.some(
              c => c.searches_delta != null
          ) || useCaseClusters.some(c => c.searches_delta != null);
          return (
            <Card
              title="1.6 · Intent clusters"
              badge="Click cluster to expand terms"
              insight={d16.insight}
              insightType="info"
            >
              {/* ── Tier 1: Occasion intent ──────────────────────────── */}
              <IntentTierHeader
                label="Occasion intent"
                sublabel="When and why they are buying"
              />

              {occasionClusters.length > 0
                ? (
                  <div className="space-y-2 mb-5">
                    {occasionClusters.map((c, i) => (
                      <ClusterRow
                        key={c.cluster}
                        c={c}
                        onDrill={c => setDrill({
                          title: c.cluster + ' — terms',
                          terms: c.terms || []
                        })}
                      />
                    ))}
                  </div>
                )
                : (
                  <p className="text-xs text-gray-400 mb-5 py-3 text-center">
                    No occasion-intent terms found in this period
                  </p>
                )
              }

              {/* ── Tier 2: Use case intent ───────────────────────────── */}
              <div className="border-t border-gray-200 pt-4">
                <IntentTierHeader
                  label="Use case & modifier intent"
                  sublabel="How they plan to use it or what constraints they have"
                />

                {useCaseClusters.length > 0
                  ? (
                    <div className="space-y-2">
                      {useCaseClusters.map((c, i) => (
                        <ClusterRow
                          key={c.cluster}
                          c={c}
                          onDrill={c => setDrill({
                            title: c.cluster + ' — terms',
                            terms: c.terms || []
                          })}
                        />
                      ))}
                    </div>
                  )
                  : (
                    <p className="text-xs text-gray-400 py-3 text-center">
                      No use-case-intent terms found in this period
                    </p>
                  )
                }
              </div>

            </Card>
          );
        })()}
        {activeSection === '1.9' && (
          <Card title="1.9 · Rising Terms (>20% MoM, ≥200 searches)" insight={d19.insight} insightType="success">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'prev_searches',label:'Prev',right:true,render:v=>fmt(v)},{key:'searches',label:'Current',right:true,sortable:true,render:v=>fmt(v)},{key:'growth',label:'Growth',right:true,render:v=><GrowthPill v={v}/>},{key:'a2c_count',label:'A2C',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d19.terms||[]} />
          </Card>
        )}
        {activeSection === '1.10' && (
          <Card title="1.10 · Falling Terms (<-20% MoM)" insight={d110.insight} insightType="danger">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'prev_searches',label:'Prev',right:true,render:v=>fmt(v)},{key:'searches',label:'Current',right:true,render:v=>fmt(v)},{key:'growth',label:'Decline',right:true,render:v=><GrowthPill v={v}/>},{key:'orders',label:'Orders',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d110.terms||[]} />
          </Card>
        )}
        {activeSection === '1.11' && (
          <Card title="1.11 · New Term Appearances" badge="Not in prev period" insight={d111.insight} insightType="success">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'searches',label:'Searches',right:true,render:v=>fmt(v)},{key:'a2c_count',label:'A2C',right:true,render:v=>fmt(v)},{key:'orders',label:'Purchases',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d111.terms||[]} />
          </Card>
        )}
        {activeSection === '1.13' && (() => {
          const d113 = layer1?.['1.13'] || {};
          const cols = [
            { key: 'term_norm',     label: 'Term' },
            { key: 'category',      label: 'Category' },
            { key: 'prev_searches', label: 'Prev Searches', right: true, render: v => fmt(v) },
            { key: 'searches',      label: 'Searches', right: true, sortable: true, render: v => fmt(v) },
            { key: 'growth',        label: 'Growth', right: true, sortable: true, render: v => <GrowthPill v={v} /> },
            { key: 'a2c_count',     label: 'A2C', right: true, render: v => fmt(v) },
            { key: 'orders',        label: 'Orders', right: true, render: v => fmt(v) }
          ];
          return (
            <div className="space-y-6">
              <Card title="1.13 · High-Volume Breakouts (≥300 searches, >100% MoM)" insight={d113.insight} insightType="success">
                <DataTable cols={cols} rows={d113.terms_300 || []} maxH={300} />
              </Card>
              <Card title="1.13 · Low-Volume Breakouts (100–299 searches, >100% MoM)" insightType="info">
                <DataTable cols={cols} rows={d113.terms_100 || []} maxH={300} />
              </Card>
            </div>
          );
        })()}
      </div>
      {drill && <DrillModal title={drill.title} terms={drill.terms} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — FUNNEL ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
function FunnelScatter({ points, height = 300 }) {
  // points: [{term_norm, visit_rate, a2c_rate_v, category, searches}]
  const ref = useRef(null);
  const cats = [...new Set((points||[]).map(p => p.category))];
  const palette = ['#4f46e5','#10b981','#f59e0b','#f43f5e','#8b5cf6','#06b6d4','#84cc16','#ec4899'];
  const datasets = cats.map((cat, i) => ({
    label: cat,
    data: points.filter(p => p.category === cat).map(p => ({ x: parseFloat((p.visit_rate*100).toFixed(1)), y: parseFloat((p.a2c_rate_v*100).toFixed(1)), label: p.term_norm, searches: p.searches })),
    backgroundColor: palette[i % palette.length] + 'bb',
    pointRadius: 5, pointHoverRadius: 7
  }));
  useChart(ref, () => ({
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, padding: 8 } }, tooltip: { callbacks: { label: ctx => `${ctx.raw.label}: Visit ${ctx.raw.x}% | A2C ${ctx.raw.y}%` } } },
      scales: {
        x: { title: { display: true, text: 'Visit Rate %' }, min: 0 },
        y: { title: { display: true, text: 'A2C Rate (of visits) %' }, min: 0 }
      }
    }
  }), [JSON.stringify(points)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function StageBadge({ stage }) {
  const s = {
    'Stage 1 — Low Click-Through': 'bg-rose-100 text-rose-700',
    'Stage 2 — Low Cart Rate':     'bg-amber-100 text-amber-700',
    'Stage 3 — High Abandonment':  'bg-orange-100 text-orange-700',
    'Healthy':                     'bg-emerald-100 text-emerald-700'
  };
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${s[stage] || 'bg-gray-100 text-gray-500'}`}>{stage}</span>;
}

function DeltaRatePill({ v }) {
  if (v === undefined || v === null) return <span className="text-gray-400">—</span>;
  const pct = (v * 100).toFixed(2);
  const up = v >= 0;
  return <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{up ? '+' : ''}{pct}pp</span>;
}

function Layer3({ layer3 }) {
  const [active, setActive] = useState('3.1');
  const [stageFilter, setStageFilter] = useState('All');
  const [drill, setDrill] = useState(null);
  const hasBoth = !!(layer3?.['3.11']?.improvers?.length);

  // Helper: click a category cell to drill into terms of that category
  function catDrill(cat, terms) {
    const filtered = (terms || []).filter(t => t.category === cat);
    setDrill({ title: cat + ' — Terms', terms: filtered });
  }

  // Category column with clickable badge
  function catCol(terms) {
    return { key: 'category', label: 'Category', render: v => v ? <button onClick={() => catDrill(v, terms)} className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full font-medium transition-colors">{v} →</button> : null };
  }

  const sections = [
    { id: '3.1',  label: '3.1 Visit Rate',      both: false },
    { id: '3.5',  label: '3.5 Cat Funnel',       both: false },
    { id: '3.8',  label: '3.8 0-Conv Traffic',   both: false },
    { id: '3.9',  label: '3.9 Stage Class.',     both: false },
    { id: '3.11', label: '3.11 Visit Δ',          both: true  },
    { id: '3.12', label: '3.12 A2C Rate Δ',       both: true  },
    { id: '3.13', label: '3.13 Purchase Δ',       both: true  },
    { id: '3.15', label: '3.15 Lost Conv',         both: true  },
    { id: '3.16', label: '3.16 New Conv',          both: true  },
    { id: '3.17', label: '3.17 Cat Improvement',  both: true  },
  ];

  const d = key => (layer3?.[key] || {});

  // Grouped bar for 3.5
  function CatFunnelGrouped({ cats }) {
    const ref = useRef(null);
    const labels = cats.map(c => c.category);
    useChart(ref, () => ({
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Visit Rate', data: cats.map(c => +(c.avg_visit_rate*100).toFixed(2)), backgroundColor: '#4f46e5' },
          { label: 'A2C Rate',   data: cats.map(c => +(c.avg_a2c_rate*100).toFixed(2)), backgroundColor: '#10b981' },
          { label: 'Purch Rate', data: cats.map(c => +(c.avg_purchase_rate*100).toFixed(2)), backgroundColor: '#f59e0b' },
          { label: 'E2E Conv',   data: cats.map(c => +(c.avg_e2e_conv*100).toFixed(4)), backgroundColor: '#f43f5e' },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}%` } } },
        scales: { x: { ticks: { maxRotation: 40, font: { size: 10 } } }, y: { grid: { color: '#f3f4f6' }, ticks: { callback: v => v + '%' } } }
      }
    }), [JSON.stringify(cats)]);
    return <div style={{ height: 280 }}><canvas ref={ref} /></div>;
  }

  return (
    <div className="flex gap-5">
      <div className="w-44 flex-shrink-0">
        <nav className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-4">
          {sections.map(s => {
            const disabled = s.both && !hasBoth;
            return (
              <button key={s.id} onClick={() => !disabled && setActive(s.id)} disabled={disabled}
                className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-100 last:border-0
                  ${active === s.id ? 'bg-indigo-600 text-white font-semibold' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-indigo-50'}`}>
                {s.label}{s.both && !hasBoth && <span className="ml-1">🔄</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 min-w-0 space-y-5">

        {/* 3.1 */}
        {active === '3.1' && (() => {
          const d31 = d('3.1');
          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-700">{fmtN((d31.avg_visit_rate||0)*100)}%</p>
                  <p className="text-xs text-indigo-500 mt-1">Avg Visit Rate</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-4 text-center col-span-2">
                  <p className="text-2xl font-bold text-rose-600">{(d31.bottom20||[]).length}</p>
                  <p className="text-xs text-rose-500 mt-1">Top-100 terms with &lt;20% visit rate</p>
                </div>
              </div>
              <Card title="3.1 · Visit Rate Distribution (all terms)" insight={d31.insight}>
                <VBarChart labels={(d31.histogram||[]).map(h => h.label)} data={(d31.histogram||[]).map(h => h.count)} colors={(d31.histogram||[]).map((h,i) => i < 3 ? '#f43f5e' : i < 6 ? '#f59e0b' : '#10b981')} height={220} tooltipSuffix=" terms" onClickIndex={i=>{const h=(d31.histogram||[])[i];if(h)setDrill({title:h.label+' Visit Rate', terms:h.terms||[]})}} />
              </Card>
              <Card title="3.1 · Bottom 20 Terms by Visit Rate (from top 100 search vol)" badge="Low = search relevance issue">
                <DataTable cols={[
                  { key:'term_norm',    label:'Term' },
                  { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                  { key:'search_visits',label:'Visits', right:true, render:v=>fmt(v) },
                  { key:'visit_rate',   label:'Visit Rate', right:true, render:v=><span className="text-rose-600 font-semibold">{fmtN(v*100,1)}%</span> },
                  catCol(d31.bottom20||[]),
                ]} rows={d31.bottom20||[]} />
              </Card>
            </>
          );
        })()}

        {/* 3.5 */}
        {active === '3.5' && (() => {
          const d35 = d('3.5');
          return (
            <Card title="3.5 · Category-Level Funnel Benchmarks" badge="4 metrics per category" insight={d35.insight}>
              <CatFunnelGrouped cats={d35.categories||[]} />
              <DataTable cols={[
                { key:'category',         label:'Category' },
                { key:'avg_visit_rate',   label:'Visit %', right:true, sortable:true, render:v=>fmtN((v||0)*100,1)+'%' },
                { key:'delta_visit_rate', label:'Visit Δ', right:true, sortable:true, render:v=><DeltaRatePill v={v}/> },
                { key:'avg_a2c_rate',     label:'A2C %', right:true, sortable:true, render:v=>fmtN((v||0)*100,2)+'%' },
                { key:'delta_a2c_rate',   label:'A2C Δ', right:true, sortable:true, render:v=><DeltaRatePill v={v}/> },
                { key:'avg_e2e_conv',     label:'E2E %', right:true, sortable:true, render:v=>fmtN((v||0)*100,3)+'%' },
                { key:'delta_e2e_conv',   label:'E2E Δ', right:true, sortable:true, render:v=><DeltaRatePill v={v}/> },
                { key:'searches',         label:'Searches', right:true, sortable:true, render:v=>fmt(v) },
              ]} rows={(d35.categories||[]).map(r=>({...r, _onClick:()=>setDrill({title:r.category+' — Terms', terms:r.terms||[]})}))} maxH={320} />
            </Card>
          );
        })()}

        {/* 3.8 */}
        {active === '3.8' && (() => {
          const d38 = d('3.8');
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 rounded-xl p-4 text-center border border-rose-200">
                  <p className="text-2xl font-bold text-rose-600">{fmt(d38.total_searches)}</p>
                  <p className="text-xs text-rose-400 mt-1">Total zero-conv searches</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-200">
                  <p className="text-2xl font-bold text-amber-600">${fmt(d38.potential_revenue)}</p>
                  <p className="text-xs text-amber-400 mt-1">Est. potential revenue lost</p>
                </div>
              </div>
              <Card title="3.8 · Zero-Conv High-Traffic Terms (≥1000 searches)" badge="Top 15 by volume" insight={d38.insight} insightType="danger">
                <HBarChart
                  labels={(d38.terms||[]).map(t => t.term_norm)}
                  data={(d38.terms||[]).map(t => t.searches||0)}
                  colors="#f43f5e"
                  height={260}
                />
                <DataTable cols={[
                  { key:'term_norm',    label:'Term' },
                  { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                  { key:'search_visits',label:'Visits', right:true, render:v=>fmt(v) },
                  { key:'a2c_count',    label:'A2C', right:true, render:v=>fmt(v) },
                  catCol(d38.terms||[]),
                ]} rows={d38.terms||[]} />
              </Card>
            </>
          );
        })()}

        {/* 3.9 */}
        {active === '3.9' && (() => {
          const d39 = d('3.9');
          const stages = ['All', 'Stage 1 — Low Click-Through', 'Stage 2 — Low Cart Rate', 'Stage 3 — High Abandonment', 'Healthy'];
          const filtered = stageFilter === 'All' ? (d39.terms||[]) : (d39.terms||[]).filter(t => t.funnel_stage === stageFilter);
          const top50 = (d39.terms || []).slice(0, 50);
          const top50Stage1 = top50.filter(t => t.funnel_stage === 'Stage 1 — Low Click-Through').length;
          const top50Stage2 = top50.filter(t => t.funnel_stage === 'Stage 2 — Low Cart Rate').length;
          const top50Stage3 = top50.filter(t => t.funnel_stage === 'Stage 3 — High Abandonment').length;
          const top50Healthy = top50.filter(t => t.funnel_stage === 'Healthy').length;
          return (
            <>
              <Card title="3.9 · Term Funnel Classification" badge="Filter by stage" insight={d39.insight} insightType="warn">
                <div className="flex flex-wrap gap-2 mb-4">
                  {stages.map(st => (
                    <button key={st} onClick={() => setStageFilter(st)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${stageFilter===st ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                      {st}
                    </button>
                  ))}
                </div>
                <DataTable cols={[
                  { key:'term_norm',    label:'Term' },
                  { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                  { key:'visit_rate',   label:'Visit', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'a2c_rate_v',   label:'A2C/Visit', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'purchase_rate',label:'Purch/A2C', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'funnel_stage', label:'Stage', render:v=><StageBadge stage={v} /> },
                  catCol(filtered),
                ]} rows={filtered} maxH={400} />
              </Card>

              <Card title="3.9 · Top 50 Search Terms Funnel Classification Analysis" badge="Top 50 by volume">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-rose-700">{top50Stage1}</p>
                    <p className="text-xs text-rose-500 font-semibold mt-1">Stage 1 (Low CT)</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-amber-700">{top50Stage2}</p>
                    <p className="text-xs text-amber-500 font-semibold mt-1">Stage 2 (Low A2C)</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-orange-700">{top50Stage3}</p>
                    <p className="text-xs text-orange-500 font-semibold mt-1">Stage 3 (Abandon)</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-emerald-700">{top50Healthy}</p>
                    <p className="text-xs text-emerald-500 font-semibold mt-1">Healthy</p>
                  </div>
                </div>
                <DataTable cols={[
                  { key:'term_norm',    label:'Term' },
                  { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                  { key:'visit_rate',   label:'Visit', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'a2c_rate_v',   label:'A2C/Visit', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'purchase_rate',label:'Purch/A2C', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                  { key:'funnel_stage', label:'Stage', render:v=><StageBadge stage={v} /> },
                  catCol(top50),
                ]} rows={top50} maxH={400} />
              </Card>
            </>
          );
        })()}



        {/* 3.11 */}
        {active === '3.11' && (() => {
          const d311 = d('3.11');
          const allRows311 = [...(d311.improvers||[]), ...(d311.degraders||[])];
          const cols = [
            { key:'term_norm', label:'Term' },
            { key:'prev_vr',   label:'Prev Visit %', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
            { key:'visit_rate',label:'Curr Visit %', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
            { key:'vr_delta',  label:'Δ pp', right:true, render:v=><DeltaRatePill v={v} /> },
            { key:'searches',  label:'Searches', right:true, sortable:true, render:v=>fmt(v) },
            catCol(allRows311),
          ];
          return (
            <>
              <Card title="3.11 · Visit Rate Improvers (MoM)" badge="Both periods" insight={d311.insight} insightType="success">
                <DataTable cols={cols} rows={d311.improvers||[]} />
              </Card>
              <Card title="3.11 · Visit Rate Degraders (MoM)" insightType="danger">
                <DataTable cols={cols} rows={d311.degraders||[]} />
              </Card>
            </>
          );
        })()}

        {/* 3.12 */}
        {active === '3.12' && (() => {
          const d312 = d('3.12');
          const allRows312 = [...(d312.improvers||[]), ...(d312.degraders||[])];
          const cols = [
            { key:'term_norm',  label:'Term' },
            { key:'prev_a2c_s', label:'Prev A2C %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
            { key:'a2c_rate_s', label:'Curr A2C %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
            { key:'a2c_delta',  label:'Δ pp', right:true, render:v=><DeltaRatePill v={v} /> },
            { key:'searches',   label:'Searches', right:true, sortable:true, render:v=>fmt(v) },
            catCol(allRows312),
          ];
          return (
            <>
              <Card title="3.12 · A2C Rate Improvers (MoM)" badge="Both periods" insight={d312.insight} insightType="success">
                <DataTable cols={cols} rows={d312.improvers||[]} />
              </Card>
              <Card title="3.12 · A2C Rate Degraders (MoM)" insightType="danger">
                <DataTable cols={cols} rows={d312.degraders||[]} />
              </Card>
            </>
          );
        })()}

        {/* 3.13 */}
        {active === '3.13' && (() => {
          const d313 = d('3.13');
          const allRows313 = [...(d313.improvers||[]), ...(d313.degraders||[])];
          const cols = [
            { key:'term_norm',    label:'Term' },
            { key:'prev_pr',      label:'Prev Purch %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
            { key:'purchase_rate',label:'Curr Purch %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
            { key:'pr_delta',     label:'Δ pp', right:true, render:v=><DeltaRatePill v={v} /> },
            { key:'a2c_count',    label:'A2C', right:true, render:v=>fmt(v) },
            catCol(allRows313),
          ];
          return (
            <>
              <Card title="3.13 · Purchase Rate Improvers (MoM)" badge="Both periods" insight={d313.insight} insightType="success">
                <DataTable cols={cols} rows={d313.improvers||[]} />
              </Card>
              <Card title="3.13 · Purchase Rate Degraders (MoM)" insightType="danger">
                <DataTable cols={cols} rows={d313.degraders||[]} />
              </Card>
            </>
          );
        })()}



        {/* 3.15 */}
        {active === '3.15' && (() => {
          const d315 = d('3.15');
          return (
            <Card title={`3.15 · Stopped Converting (${d315.count||0} terms)`} badge="Had purchases last period → 0 now" insight={d315.insight} insightType="danger">
              <DataTable cols={[
                { key:'term_norm',      label:'Term' },
                { key:'searches',       label:'Curr Searches', right:true, render:v=>fmt(v) },
                { key:'prev_searches',  label:'Prev Searches', right:true, render:v=>fmt(v) },
                { key:'prev_orders',label:'Prev Orders', right:true, render:v=><span className="font-bold text-rose-600">{fmt(v)}</span> },
              ]} rows={d315.terms||[]} />
            </Card>
          );
        })()}

        {/* 3.16 */}
        {active === '3.16' && (() => {
          const d316 = d('3.16');
          return (
            <Card title={`3.16 · Newly Converting Terms (${d316.count||0} terms)`} badge="Was 0 orders → now converting" insight={d316.insight} insightType="success">
              <DataTable cols={[
                { key:'term_norm', label:'Term' },
                { key:'searches',  label:'Searches', right:true, render:v=>fmt(v) },
                { key:'orders',label:'Orders', right:true, render:v=><span className="font-bold text-emerald-600">{fmt(v)}</span> },
                { key:'usd_revenue',label:'Revenue', right:true, render:v=>fmtCur(v) },
              ]} rows={d316.terms||[]} />
            </Card>
          );
        })()}

        {/* 3.17 */}
        {active === '3.17' && (() => {
          const d317 = d('3.17');
          return (
            <Card title="3.17 · Category Funnel Improvement Ranking (% MoM)" insight={d317.insight} insightType="success">
              <VBarChart
                labels={(d317.chart||[]).map(c => c.category)}
                data={(d317.chart||[]).map(c => c.delta||0)}
                colors={(d317.chart||[]).map(c => (c.delta||0) >= 0 ? '#10b981' : '#f43f5e')}
                tooltipSuffix="%"
                height={260}
              />
              <DataTable cols={[
                { key:'category', label:'Category' },
                { key:'prev_e2e', label:'Prev E2E', right:true, render:v=>fmtN((v||0)*100,3)+'%' },
                { key:'curr_e2e', label:'Curr E2E', right:true, render:v=>fmtN((v||0)*100,3)+'%' },
                { key:'delta',    label:'% Change', right:true, render:v=><GrowthPill v={v} /> },
              ]} rows={d317.chart||[]} />
            </Card>
          );
        })()}

      </div>
      {drill && <DrillModal title={drill.title} terms={drill.terms} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD HOME
// ─────────────────────────────────────────────────────────────────────────────
function DashboardHome({ summary, layer1 }) {
  const [drill, setDrill] = useState(null);
  const vol  = layer1?.['1.2']?.chart || [];
  const cat3 = layer1?.['1.3']?.chart || [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">📊 Overview Scorecard</h2>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard title="Total Searches"    value={fmt(summary.searches)}         growth={summary.searches_growth} />
        <KPICard title="A2C Rate"          value={fmtPct(summary.a2c_rate)}      growth={summary.a2c_rate_growth}      sub={fmt(summary.a2c_count)+' events'} />
        <KPICard title="E2E Conversion"    value={fmtPct(summary.e2e_conv)}      growth={summary.e2e_conv_growth} />
        <KPICard title="Total Orders"      value={fmt(summary.orders)}           growth={summary.orders_growth} />
        <KPICard title="Total Revenue"     value={fmtCur(summary.revenue)}       growth={summary.revenue_growth} />
        <KPICard title="Revenue / Search"  value={fmtCur(summary.rev_per_search)} growth={summary.rev_per_search_growth} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="Search Volume Concentration (1.2)" badge="Click slice" insight={layer1?.['1.2']?.insight}>
          <DoughnutChart labels={vol.map(d=>d.name)} data={vol.map(d=>d.value)} colors={['#4f46e5','#7c3aed','#a855f7','#e879f9']} tooltipSuffix=" searches" onClickIndex={i=>setDrill({title:vol[i]?.name+' — Terms',terms:vol[i]?.terms||[]})} />
        </Card>
        <Card title="Top Categories by Search Volume (1.3)" badge="Click bar" insight={layer1?.['1.3']?.insight}>
          <HBarChart labels={cat3.slice(0,10).map(d=>d.category)} data={cat3.slice(0,10).map(d=>d.searches)} color="#6366f1" height={260} overallTotal={summary.searches} tooltipSuffix=" searches" onClickIndex={i=>setDrill({title:(cat3[i]?.category||'')+' — Terms',terms:cat3[i]?.terms||[]})} />
        </Card>
      </div>
      {drill && <DrillModal title={drill.title} terms={drill.terms} onClose={()=>setDrill(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function FileInput({ label, fileKey, files, onChange }) {
  const f = files[fileKey];
  return (
    <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/30 rounded-xl p-5 cursor-pointer hover:border-indigo-400 hover:bg-white/10 transition group">
      <svg className="w-7 h-7 text-white/40 group-hover:text-indigo-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
      <span className="text-xs font-semibold text-white/70 mb-1 text-center">{label}</span>
      {f ? <span className="text-xs text-emerald-300 font-semibold">✓ {f.name}</span> : <span className="text-xs text-white/40">Upload CSV</span>}
      <input type="file" className="hidden" accept=".csv" onChange={e => e.target.files?.[0] && onChange(fileKey, e.target.files[0])} />
    </label>
  );
}

function UploadScreen({ onResult }) {
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const setFile = (k, v) => setFiles(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError(null);
    const fd = new FormData();
    Object.entries(files).forEach(([k, v]) => fd.append(k, v));
    try {
      const r = await fetch('/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.status === 'success') onResult(d);
      else setError(d.message || 'Upload failed');
    } catch (e) { setError(e.toString()); }
    finally { setLoading(false); }
  };

  const curr = [{key:'search_terms_current',label:'Search Terms (Current)'},{key:'a2c_current',label:'Add-to-Cart Events (Current)'}];
  const prev = [{key:'search_terms_previous',label:'Search Terms (Previous)'},{key:'a2c_previous',label:'Add-to-Cart Events (Previous)'}];
  const platform = [
    { key:'platform_terms_current', label:'App vs Web Split (Current)' },
    { key:'platform_terms_previous', label:'App vs Web Split (Previous)' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-block bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold px-4 py-1 rounded-full mb-4">SEARCH INTELLIGENCE PLATFORM</div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Upload Your Analytics CSVs</h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">Upload current (and optionally previous) period data to generate 80+ analyses across 6 intelligence layers.</p>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 mb-4 border border-white/10">
          <h2 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-4">Current Period</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{curr.map(c=><FileInput key={c.key} fileKey={c.key} label={c.label} files={files} onChange={setFile}/>)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-white/10">
          <h2 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-1">Previous Period <span className="text-slate-500 normal-case font-normal ml-2">Optional — enables MoM trend analyses</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">{prev.map(c=><FileInput key={c.key} fileKey={c.key} label={c.label} files={files} onChange={setFile}/>)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-white/10">
          <h2 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-1">
            Platform Split
            <span className="text-slate-500 normal-case font-normal ml-2">
              Optional — enables App vs Web analysis. File must contain web, Android, iOS columns.
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {platform.map(c =>
              <FileInput key={c.key} fileKey={c.key} label={c.label} files={files} onChange={setFile} />
            )}
          </div>
        </div>
        {error && <div className="bg-red-500/20 border border-red-400/50 text-red-300 rounded-xl px-5 py-3 mb-5 text-sm">{error}</div>}
        <div className="flex justify-end">
          <button onClick={submit} disabled={!files.search_terms_current || loading} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white font-semibold px-8 py-3 rounded-xl transition shadow-lg shadow-indigo-900/40">
            {loading ? '⏳ Running analyses...' : '🚀 Generate Intelligence Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — GOOGLE TRENDS INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

function GTScoreBadge({ v }) {
  if (v === null || v === undefined) return <span className="text-gray-400 text-xs">No data</span>;
  const color = v > 40 ? 'bg-emerald-100 text-emerald-700' : v > 15 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${color}`}>{v}</span>;
}

function AlignmentBadge({ v }) {
  const color = v?.includes('Healthy') ? 'text-emerald-700 bg-emerald-50' : v?.includes('Gap') ? 'text-rose-700 bg-rose-50' : v?.includes('brand intent') ? 'text-indigo-700 bg-indigo-50' : 'text-gray-600 bg-gray-50';
  return <span className={`text-xs px-2 py-1 rounded font-semibold ${color}`}>{v || '—'}</span>;
}

function GTLinechart({ series, height = 280 }) {
  // series: [{term, data: [{date,value}] }]
  const ref = useRef(null);
  const palette = ['#4f46e5','#10b981','#f59e0b','#f43f5e','#8b5cf6','#06b6d4','#84cc16','#ec4899','#0ea5e9','#d946ef'];
  const labels = series[0]?.data.map(d => d.date) || [];
  useChart(ref, () => ({
    type: 'line',
    data: {
      labels,
      datasets: series.map((s, i) => ({
        label: s.term,
        data: s.data.map(d => d.value),
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '18',
        pointRadius: 2,
        tension: 0.3,
        fill: false,
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 10 }, padding: 8 } } },
      scales: {
        x: { ticks: { maxTicksLimit: 10, maxRotation: 30, font: { size: 10 } } },
        y: { min: 0, max: 100, title: { display: true, text: 'GT Interest (0–100)' } }
      }
    }
  }), [JSON.stringify(series)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function DualAxisChart({ labels, barData, lineData, barLabel, lineLabel, height = 280 }) {
  const ref = useRef(null);
  useChart(ref, () => ({
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'bar', label: barLabel, data: barData, backgroundColor: '#4f46e5aa', yAxisID: 'y' },
        { type: 'line', label: lineLabel, data: lineData, borderColor: '#f43f5e', backgroundColor: 'transparent', pointRadius: 4, tension: 0.3, yAxisID: 'y2' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y:  { position: 'left',  title: { display: true, text: barLabel }, grid: { color: '#f3f4f6' } },
        y2: { position: 'right', title: { display: true, text: lineLabel }, min: 0, max: 100, grid: { drawOnChartArea: false } }
      }
    }
  }), [JSON.stringify(labels), JSON.stringify(barData), JSON.stringify(lineData)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function Layer4({ trendsInputs }) {
  const [active, setActive] = useState('4.1');
  const [layer4, setLayer4] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [selTerm, setSelTerm] = useState('');   // for 4.5 regional picker
  const [diagOpen, setDiagOpen] = useState(false);

  // Sync selTerm when layer4 data arrives
  useEffect(() => {
    if (layer4?.['4.5']?.terms?.length) setSelTerm(layer4['4.5'].terms[0]);
  }, [layer4]);

  const sections = [
    { id: '4.1', label: '4.1 Internal vs GT' },
    { id: '4.2', label: '4.2 Rising / 0 A2C' },
    { id: '4.3', label: '4.3 GT Breakouts' },
    { id: '4.4', label: '4.4 Seasonal Trend' },
    { id: '4.5', label: '4.5 Regional Demand' },
    { id: '4.6', label: '4.6 0-Conv GT Index' },
    { id: '4.7', label: '4.7 Rising Queries' },
  ];

  const fetchTrends = async () => {
    setLoading(true); setError(null); setDiagOpen(false); setStatusMsg('Connecting to Google Trends…');
    try {
      const r = await fetch('/trends_layer4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trendsInputs)
      });
      const d = await r.json();
      if (d.status === 'success') { setLayer4(d.layer4); setStatusMsg(''); }
      else setError(d.message || 'Trends fetch failed');
    } catch (e) { setError(e.toString()); }
    finally { setLoading(false); }
  };

  const d = key => layer4?.[key] || {};

  if (!layer4) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center max-w-lg">
          <div className="text-5xl mb-4">📈</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Google Trends Intelligence (SerpApi)</h2>
          <p className="text-sm text-gray-500 mb-6">Fetch live Google Trends data for 7 analyses using SerpApi. Improved reliability and depth for national demand, rising queries, and regional interest.</p>
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>}
          {loading
            ? <div className="flex items-center justify-center gap-3 text-indigo-600 font-semibold"><div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />{statusMsg || 'Fetching Trends via SerpApi…'}</div>
            : <button onClick={fetchTrends} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-indigo-200 transition">🚀 Load Google Trends Analysis</button>
          }
          <p className="text-xs text-gray-400 mt-4">Powered by SerpApi Google Trends Engine · geo=IN · last 3 months</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-5">
      <div className="w-44 flex-shrink-0">
        <nav className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-4">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActive(s.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-gray-100 last:border-0 ${active === s.id ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-600 hover:bg-indigo-50'}`}>
              {s.label}
            </button>
          ))}
          <button onClick={() => { setLayer4(null); setError(null); }}
            className="w-full text-left px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 border-t border-gray-100">
            🔄 Refresh
          </button>
        </nav>
      </div>

      <div className="flex-1 min-w-0 space-y-5">

        {/* Diagnostics banner — shown when SerpApi returned errors */}
        {layer4?._errors?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">⚠️ Google Trends data partially unavailable</span>
              <button onClick={() => setDiagOpen(x => !x)} className="text-xs text-amber-600 underline">{diagOpen ? 'Hide' : 'Show details'}</button>
            </div>
            {diagOpen && (
              <ul className="mt-2 space-y-1">
                {layer4._errors.map((e, i) => <li key={i} className="text-xs text-amber-700 font-mono bg-amber-100 rounded px-2 py-1">{e}</li>)}
              </ul>
            )}
          </div>
        )}
        {layer4?._no_data && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-800">
            <strong>⛔ Google Trends data unavailable.</strong> Check SerpApi key configuration or account balance.
            <div className="mt-2 font-mono text-xs bg-rose-100 rounded px-2 py-1">{layer4._no_data}</div>
          </div>
        )}

        {/* 4.1 */}
        {active === '4.1' && (() => {
          const d41 = d('4.1');
          return (
            <Card title="4.1 · Internal Search Rank vs Google Trends Score (Top 20)" badge="Red line = GT interest" insight={d41.insight}>
              <DualAxisChart
                labels={(d41.rows||[]).map(r => r.term_norm)}
                barData={(d41.rows||[]).map(r => r.searches||0)}
                lineData={(d41.rows||[]).map(r => r.gt_score ?? 0)}
                barLabel="Internal Searches"
                lineLabel="GT Interest (0–100)"
                height={280}
              />
              <DataTable cols={[
                { key:'term_norm',     label:'Term' },
                { key:'internal_rank', label:'Int. Rank', right:true },
                { key:'searches',      label:'Searches', right:true, render:v=>fmt(v) },
                { key:'gt_score',      label:'GT Score', right:true, render:v=><GTScoreBadge v={v} /> },
                { key:'category',      label:'Category' },
                { key:'alignment',     label:'Alignment', render:v=><AlignmentBadge v={v} /> },
              ]} rows={d41.rows||[]} maxH={320} />
            </Card>
          );
        })()}

        {/* 4.2 */}
        {active === '4.2' && (() => {
          const d42 = d('4.2');
          return (
            <Card title={`4.2 · Rising GT Queries with Zero Cart-Adds (${d42.count||0} terms)`} badge="National demand — not converting" insight={d42.insight} insightType="danger">
              <DataTable cols={[
                { key:'query',             label:'Rising GT Query' },
                { key:'category',          label:'Category' },
                { key:'gt_value',          label:'GT Breakout', right:true, render:v=><GTScoreBadge v={v} /> },
                { key:'internal_searches', label:'Int. Searches', right:true, render:v=>fmt(v) },
                { key:'internal_a2c',      label:'A2C', right:true, render:v=><span className="text-rose-600 font-bold">{fmt(v)}</span> },
                { key:'status',            label:'Status', render:v=><span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-semibold">{v}</span> },
              ]} rows={d42.rows||[]} />
            </Card>
          );
        })()}

        {/* 4.3 */}
        {active === '4.3' && (() => {
          const d43 = d('4.3');
          const cats = Object.keys(d43.by_category||{});
          return (
            <>
              <Card title={`4.3 · GT Breakout Terms NOT in Your Search Data (${d43.count||0} terms)`} badge="Earliest demand signal" insight={d43.insight} insightType="warn">
                <p className="text-xs text-gray-500 mb-3">These are trending nationally but have 0 internal searches — add them to your catalog and search index immediately.</p>
              </Card>
              {cats.map(cat => {
                const rows = (d43.by_category||{})[cat]||[];
                return rows.length === 0 ? null : (
                  <Card key={cat} title={`📂 ${cat} — ${rows.length} missing terms`}>
                    <div className="flex flex-wrap gap-2">
                      {rows.map((r, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <p className="font-semibold text-sm text-gray-800">{r.query}</p>
                          <p className="text-xs text-amber-600 mt-0.5">GT breakout: {r.gt_value}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </>
          );
        })()}

        {/* 4.4 */}
        {active === '4.4' && (() => {
          const d44 = d('4.4');
          return (
            <Card title="4.4 · Google Trends Seasonal Interest (Last 3 Months — Top 10 Terms)" insight={d44.insight}>
              {(d44.series||[]).length > 0
                ? <GTLinechart series={d44.series||[]} height={320} />
                : <p className="text-sm text-gray-400 py-8 text-center">No time series data returned by Google Trends</p>
              }
            </Card>
          );
        })()}

        {/* 4.5 */}
        {active === '4.5' && (() => {
          const d45 = d('4.5');
          const terms = d45.terms || [];
          const byTerm = d45.by_term || {};
          const rows = byTerm[selTerm] || [];
          return (
            <Card title="4.5 · Regional Google Trends Demand — India" insight={d45.insight}>
              <div className="flex flex-wrap gap-2 mb-4">
                {terms.map(t => (
                  <button key={t} onClick={() => setSelTerm(t)}
                    className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${selTerm===t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
                    {t}
                  </button>
                ))}
              </div>
              {rows.length > 0
                ? <><HBarChart labels={rows.slice(0,15).map(r=>r.region)} data={rows.slice(0,15).map(r=>r.value)} height={280} tooltipSuffix="%" />
                    <DataTable cols={[{key:'region',label:'State/Region'},{key:'value',label:'GT Index',right:true,render:v=><GTScoreBadge v={v}/>}]} rows={rows} maxH={240} /></>
                : <p className="text-sm text-gray-400 py-8 text-center">No regional data — Google Trends may have returned low volume for these terms</p>
              }
            </Card>
          );
        })()}

        {/* 4.6 */}
        {active === '4.6' && (() => {
          const d46 = d('4.6');
          return (
            <Card title={`4.6 · GT Index for Zero-Conversion High-Traffic Terms (${(d46.rows||[]).length} terms)`} badge={`🔴 ${d46.critical_count||0} CRITICAL`} insight={d46.insight} insightType="danger">
              <DataTable cols={[
                { key:'term_norm', label:'Term' },
                { key:'searches',  label:'Int. Searches', right:true, render:v=>fmt(v) },
                { key:'gt_score',  label:'GT Score', right:true, render:v=><GTScoreBadge v={v} /> },
                { key:'category',  label:'Category' },
                { key:'gap_type',  label:'Gap Classification', render:v=>{
                  const color = v?.includes('CRITICAL') ? 'text-rose-700 bg-rose-50' : v?.includes('Moderate') ? 'text-amber-700 bg-amber-50' : v?.includes('Platform') ? 'text-indigo-700 bg-indigo-50' : 'text-gray-600 bg-gray-50';
                  return <span className={`text-xs px-2 py-1 rounded font-semibold ${color}`}>{v}</span>;
                }},
              ]} rows={d46.rows||[]} maxH={420} />
            </Card>
          );
        })()}

        {/* 4.7 */}
        {active === '4.7' && (() => {
          const d47 = d('4.7');
          const cats = Object.keys(d47.by_category||{});
          return (
            <>
              <Card title="4.7 · Google Trends Rising Related Queries Per Category" badge="4–8 week demand forecast" insight={d47.insight} insightType="success">
                <p className="text-xs text-gray-500">Queries rising on Google Trends — these predict your next wave of search demand. Expand catalog now.</p>
              </Card>
              {cats.map(cat => {
                const rows = (d47.by_category||{})[cat]||[];
                return (
                  <Card key={cat} title={`📂 ${cat}`} badge={`${rows.filter(r=>!r.in_internal).length} new`}>
                    <DataTable cols={[
                      { key:'query',             label:'Rising Query' },
                      { key:'gt_value',          label:'GT Breakout', right:true, render:v=><GTScoreBadge v={v} /> },
                      { key:'in_internal',       label:'In Catalog?', render:v=>v ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-semibold">✓ Yes</span> : <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-semibold">✗ Missing</span> },
                      { key:'internal_searches', label:'Int. Searches', right:true, render:v=>fmt(v) },
                      { key:'internal_a2c',      label:'A2C', right:true, render:v=>fmt(v) },
                    ]} rows={rows} maxH={260} />
                  </Card>
                );
              })}
            </>
          );
        })()}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY TRENDS COMPONENTS & MODULE
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ values, width=80, height=28 }) {
  const nums = values.filter(v => v !== null);
  if (nums.length < 2) {
    return <span className="text-xs text-gray-300">—</span>;
  }
  const min   = Math.min(...nums);
  const max   = Math.max(...nums);
  const range = max - min || 1;
  const pad   = 3;
  const w     = width  - pad * 2;
  const h     = height - pad * 2;
  const nVals = values.length;

  const pts = values.map((v, i) => {
    if (v === null) return null;
    const x = pad + (i / (nVals - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return { x, y, v };
  }).filter(Boolean);

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const first    = nums[0];
  const last     = nums[nums.length - 1];
  const color    = last > first ? '#10b981'
                 : last < first ? '#ef4444'
                 : '#9ca3af';

  return (
    <svg viewBox={`0 0 ${width} ${height}`}
         width={width} height={height}
         style={{ display: 'block' }}>
      <polyline points={polyline}
                fill="none" stroke={color} strokeWidth="1.5"
                strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />
      ))}
    </svg>
  );
}

function SparklineCell({ term, weeksMeta, orderedWids }) {
  const [show, setShow] = useState(false);
  const values = orderedWids.map(wid => {
    const w = term.weeks.find(x => x && x.week_id === wid);
    return w?.searches ?? null;
  });

  return (
    <div className="relative inline-block"
         onMouseEnter={() => setShow(true)}
         onMouseLeave={() => setShow(false)}>
      <Sparkline values={values} />

      {show && (
        <div className="absolute bottom-full left-0 mb-2 z-50
                        bg-slate-900 text-white text-[10px]
                        rounded-lg shadow-xl p-3.5
                        min-w-[190px] pointer-events-none">
          {weeksMeta.map((wm, i) => {
            const searches = values[i];
            const wow      = term.wowByWeek[i];
            return (
              <div key={wm.id}
                   className="flex justify-between gap-4 py-0.5 border-b border-slate-800 last:border-0">
                <span className="text-slate-400">
                  {i === 0 ? `${wm.label} (base)` : wm.label}
                </span>
                <span className="font-semibold text-white">
                  {searches != null
                    ? searches.toLocaleString()
                    : '—'}
                </span>
                {wow != null && (
                  <span className={wow >= 0
                    ? 'text-emerald-400 font-bold'
                    : 'text-rose-400 font-bold'}>
                    {wow >= 0 ? '+' : ''}{wow}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeltaPill({ v }) {
  if (v === null || v === undefined)
    return <span className="text-gray-300 text-xs">—</span>;
  const up = v >= 0;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
      ${up
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-rose-50   text-rose-700   border border-rose-200'}`}>
      {up ? '+' : ''}{v}%
    </span>
  );
}

function WeekDetailPanel({ term, weeksMeta, orderedWids, baselineWeekId }) {
  const barRef = useRef(null);
  const searches = orderedWids.map(wid => {
    const w = term.weeks.find(x => x && x.week_id === wid);
    return w?.searches ?? 0;
  });
  const labels = weeksMeta.map(w => w.label);

  useChart(barRef, () => ({
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: searches,
        backgroundColor: orderedWids.map(wid =>
          wid === baselineWeekId ? '#818cf8' : '#4f46e5'
        ),
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toLocaleString()} searches`
          }
        }
      },
      scales: {
        x: { grid: { display: false },
             ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f3f4f6' },
             ticks: {
               font: { size: 10 },
               callback: v => v.toLocaleString()
             }}
      }
    }
  }), [JSON.stringify(searches)]);

  return (
    <div className="flex gap-6 items-center">
      {/* Left: bar chart */}
      <div style={{ width: 260, height: 140, flexShrink: 0 }}>
        <canvas ref={barRef} />
      </div>

      {/* Right: detail table */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs w-full text-left">
          <thead>
            <tr className="text-gray-400 font-medium border-b border-gray-200 text-[10px] uppercase tracking-wider">
              <th className="pb-1 pr-4">Week</th>
              <th className="pb-1 text-right pr-4">Searches</th>
              <th className="pb-1 text-right pr-4">WoW</th>
              <th className="pb-1 text-right pr-4">Visit %</th>
              <th className="pb-1 text-right">Purchase %</th>
            </tr>
          </thead>
          <tbody>
            {weeksMeta.map((wm, i) => {
              const w = term.weeks[i];
              const isBase = wm.id === baselineWeekId;
              return (
                <tr key={wm.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className={`py-1.5 pr-4 font-semibold
                    ${isBase ? 'text-indigo-600 font-bold' : 'text-gray-700'}`}>
                    {wm.label}{isBase && ' (base)'}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-semibold text-gray-800 tabular-nums">
                    {w ? w.searches.toLocaleString() : '—'}
                  </td>
                  <td className="py-1.5 pr-4 text-right">
                    {term.wowByWeek[i] != null
                      ? <DeltaPill v={term.wowByWeek[i]} />
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 pr-4 text-right text-gray-600 tabular-nums">
                    {w ? (w.visit_rate * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td className="py-1.5 text-right text-gray-600 tabular-nums">
                    {w ? (w.purchase_rate * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BumpRankChart({ enrichedTerms, ranksMap, weeksMeta, orderedWids }) {
  const SVG_W   = 680;
  const SVG_H   = Math.max(340, enrichedTerms.length * 36 + 60);
  const PAD_L   = 160;
  const PAD_R   = 160;
  const PAD_T   = 30;
  const PAD_B   = 20;
  const chartW  = SVG_W - PAD_L - PAD_R;
  const chartH  = SVG_H - PAD_T - PAD_B;
  const N       = enrichedTerms.length;
  const nWeeks  = orderedWids.length;

  const COLORS = [
    '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#84cc16','#ec4899','#f97316','#14b8a6'
  ];

  function xPos(weekIdx) {
    if (nWeeks <= 1) return PAD_L + chartW / 2;
    return PAD_L + (weekIdx / (nWeeks - 1)) * chartW;
  }

  function yPos(rank) {
    if (N <= 1) return PAD_T + chartH / 2;
    return PAD_T + ((rank - 1) / (N - 1)) * chartH;
  }

  if (nWeeks < 2) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm font-semibold border rounded-lg bg-gray-50">
        Rank chart requires at least 2 weeks selected.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%">
        {weeksMeta.map((wm, i) => (
          <text key={wm.id}
                x={xPos(i)} y={PAD_T - 10}
                textAnchor="middle"
                fontSize="11" fill="#6b7280" fontWeight="500">
            {wm.label}
          </text>
        ))}

        {enrichedTerms.map((term, ti) => {
          const color  = COLORS[ti % COLORS.length];
          const ranks  = ranksMap[term.term_norm] || [];
          const points = orderedWids.map((_, wi) => ({
            x: xPos(wi),
            y: yPos(ranks[wi] ?? N),
            rank: ranks[wi] ?? null,
            searches: term.weeks[wi]?.searches ?? null,
          })).filter(p => p.rank !== null);

          if (points.length < 2) return null;

          const pathD = points.map((p, i) =>
            i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`
          ).join(' ');

          const firstRank = ranks[0] ?? null;
          const lastRank  = ranks[orderedWids.length - 1] ?? null;

          return (
            <g key={term.term_norm}>
              <path d={pathD} fill="none"
                    stroke={color} strokeWidth="2"
                    strokeLinejoin="round" opacity="0.85" />

              {points.map((p, pi) => (
                <g key={pi}>
                  <circle cx={p.x} cy={p.y} r="5"
                          fill={color} stroke="white"
                          strokeWidth="1.5" />
                  <text x={p.x} y={p.y} dy=".3em"
                        textAnchor="middle"
                        fontSize="8" fill="white" fontWeight="600">
                    {p.rank}
                  </text>
                </g>
              ))}

              {firstRank !== null && (
                <text x={PAD_L - 8}
                      y={yPos(firstRank) + 4}
                      textAnchor="end"
                      fontSize="11" fill={color} fontWeight="500">
                  {term.term_norm.length > 22
                    ? term.term_norm.slice(0, 21) + '…'
                    : term.term_norm}
                </text>
              )}

              {lastRank !== null && (
                <text x={SVG_W - PAD_R + 8}
                      y={yPos(lastRank) + 4}
                      textAnchor="start"
                      fontSize="11" fill={color} fontWeight="500">
                  #{lastRank}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const LINE_COLORS = [
  '#4f46e5', '#7c3aed', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#14b8a6',
];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function TermPill({ term, color, soloTerm, onToggle }) {
  const isSolo   = soloTerm === term.term_norm;
  const isFaded  = soloTerm !== null && !isSolo;
  const wow      = term.latestWoW;  // number or null
  const wowColor = wow > 0 ? '#10b981'
                 : wow < 0 ? '#ef4444'
                 : '#9ca3af';
  return (
    <button
      onClick={() => onToggle(term.term_norm)}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '5px',
        padding:        '4px 10px 4px 8px',
        borderRadius:   '20px',
        fontSize:       '11px',
        fontWeight:     '500',
        cursor:         'pointer',
        border:         `0.5px solid ${isSolo
                          ? color
                          : color + '55'}`,
        background:     isSolo
                          ? hexToRgba(color, 0.1)
                          : 'var(--color-background-primary)',
        color:          isSolo
                          ? color
                          : 'var(--color-text-secondary)',
        opacity:        isFaded ? 0.35 : 1,
        transition:     'all 0.15s',
      }}
    >
      {/* Colored dot */}
      <span style={{
        width: '8px', height: '8px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }} />

      {/* Term name */}
      <span>{term.term_norm}</span>

      {/* WoW delta badge — only when latestWoW is not null */}
      {wow !== null && (
        <span style={{
          fontSize: '10px',
          fontWeight: '600',
          color: wowColor,
        }}>
          {wow >= 0 ? '+' : ''}{wow}%
        </span>
      )}
    </button>
  );
}

function TrendsModule() {
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedWeekIds, setSelectedWeekIds] = useState([]);
  const [baselineWeekId, setBaselineWeekId] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [explorerData, setExplorerData] = useState(null);
  const [materialData, setMaterialData] = useState(null);
  const [allTermNames, setAllTermNames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('top-terms');

  const [soloTerm, setSoloTerm] = useState(null);
  const [soloCategory, setSoloCategory] = useState(null);
  const instanceRef = useRef(null);

  const [viewMode, setViewMode] = useState('table');
  const [topN, setTopN] = useState(10);
  const [expandedTerms, setExpandedTerms] = useState(new Set());

  const [inputVal, setInputVal] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [gemWeekIdx, setGemWeekIdx] = useState(0);
  const [rangeGroup, setRangeGroup] = useState(0);

  const expRef = useRef(null);
  const metalsRef = useRef(null);
  const gemsRef = useRef(null);
  const catsRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch('/weeks').then(r => r.json()),
      fetch('/terms-list').then(r => r.json()),
    ]).then(([weeksRes, termsRes]) => {
      const weeks = weeksRes.weeks || [];
      setAvailableWeeks(weeks);
      const allIds = weeks.map(w => w.id);
      setSelectedWeekIds(allIds);
      if (weeks.length > 0) {
        setBaselineWeekId(weeks[0].id);
        setGemWeekIdx(weeks.length - 1);
      }
      setAllTermNames(termsRes.terms || []);
      setInitialLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedWeekIds.length === 0) return;
    setLoading(true);
    Promise.all([
      fetch('/trends-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_ids: selectedWeekIds, top_n: 50 })
      }).then(r => r.json()),
      fetch('/trends-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_ids: selectedWeekIds })
      }).then(r => r.json()),
    ]).then(([td, md]) => {
      setTrendsData(td);
      setMaterialData(md);
      setLoading(false);
    });
  }, [JSON.stringify(selectedWeekIds)]);

  useEffect(() => {
    if (selectedWeekIds.length === 0 || selectedTerms.length === 0) {
      setExplorerData(null);
      return;
    }
    fetch('/trends-weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_ids: selectedWeekIds, terms: selectedTerms })
    })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') {
          setExplorerData(data);
        }
      });
  }, [JSON.stringify(selectedTerms), JSON.stringify(selectedWeekIds)]);

  useEffect(() => {
    if (!inputVal) {
      setSuggestions([]);
      return;
    }
    const query = inputVal.toLowerCase();
    const prefixMatches = [];
    const otherMatches = [];
    
    for (const t of allTermNames) {
      const lower = t.toLowerCase();
      if (lower.startsWith(query)) {
        prefixMatches.push(t);
      } else if (lower.includes(query)) {
        otherMatches.push(t);
      }
    }
    
    const matches = [...prefixMatches, ...otherMatches].slice(0, 8);
    console.log('Suggestions debug - query:', query, 'count:', matches.length, 'first few:', matches.slice(0, 3));
    setSuggestions(matches);
  }, [inputVal, allTermNames]);

  const handleToggleWeek = (id) => {
    let next;
    if (selectedWeekIds.includes(id)) {
      if (selectedWeekIds.length === 1) return;
      next = selectedWeekIds.filter(x => x !== id);
    } else {
      next = [...selectedWeekIds, id];
    }
    setSelectedWeekIds(next);

    if (selectedWeekIds.includes(id) && baselineWeekId === id) {
      const remainingWeeks = availableWeeks.filter(w => next.includes(w.id));
      if (remainingWeeks.length > 0) {
        setBaselineWeekId(remainingWeeks[0].id);
      }
    }
  };

  const COLORS = [
    '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#84cc16','#ec4899','#f97316','#14b8a6'
  ];

  // (Moved early returns below hook declarations to comply with React hook rules)

  const weeksMeta = trendsData?.weeks_meta || [];
  const orderedWids = weeksMeta.map(w => w.id);
  const baselineIdx = orderedWids.indexOf(baselineWeekId);
  const latestIdx = orderedWids.length - 1;

  const enrichedTerms = (trendsData?.terms || [])
    .slice(0, topN)
    .map(term => {
      const weeks = orderedWids.map(wid => {
        const w = (term.weeks || []).find(x => x && x.week_id === wid);
        return w || null;
      });

      const baseSearches = weeks[baselineIdx]?.searches ?? null;
      const latestSearches = weeks[latestIdx]?.searches ?? null;
      const prevIdx = latestIdx - 1;
      const prevSearches = prevIdx >= 0 ? (weeks[prevIdx]?.searches ?? null) : null;
      const latestWoW = (latestSearches != null && prevSearches != null && prevSearches > 0)
        ? Math.round((latestSearches - prevSearches) / prevSearches * 100)
        : null;
      const vsBaseline = (latestSearches != null && baseSearches != null && baseSearches > 0)
        ? Math.round((latestSearches - baseSearches) / baseSearches * 100)
        : null;

      const wowByWeek = weeks.map((w, i) => {
        if (i === 0 || w === null) return null;
        const prev = weeks[i - 1];
        if (!prev || prev.searches === 0) return null;
        return Math.round((w.searches - prev.searches) / prev.searches * 100);
      });

      return {
        ...term,
        weeks,
        baseSearches,
        latestSearches,
        latestWoW,
        vsBaseline,
        wowByWeek,
      };
    });

  const ranksMap = {};
  orderedWids.forEach((wid, wi) => {
    const sorted = [...enrichedTerms]
      .map(t => ({ term: t.term_norm, s: t.weeks[wi]?.searches ?? 0 }))
      .sort((a, b) => b.s - a.s);
    sorted.forEach((item, ri) => {
      if (!ranksMap[item.term]) ranksMap[item.term] = [];
      ranksMap[item.term][wi] = ri + 1;
    });
  });

  const enrichedTerms_allFifty = (trendsData?.terms || [])
    .map(term => {
      const weeks = orderedWids.map(wid => {
        const w = (term.weeks || []).find(x => x && x.week_id === wid);
        return w || null;
      });
      const baseSearches = weeks[baselineIdx]?.searches ?? null;
      const latestSearches = weeks[latestIdx]?.searches ?? null;
      const prevIdx = latestIdx - 1;
      const prevSearches = prevIdx >= 0 ? (weeks[prevIdx]?.searches ?? null) : null;
      const latestWoW = (latestSearches != null && prevSearches != null && prevSearches > 0)
        ? Math.round((latestSearches - prevSearches) / prevSearches * 100)
        : null;
      const vsBaseline = (latestSearches != null && baseSearches != null && baseSearches > 0)
        ? Math.round((latestSearches - baseSearches) / baseSearches * 100)
        : null;
      return { ...term, weeks, baseSearches, latestSearches, latestWoW, vsBaseline };
    });

  const handleAddTerm = (name) => {
    if (selectedTerms.length < 8 && !selectedTerms.includes(name)) {
      setSelectedTerms([...selectedTerms, name]);
    }
    setInputVal('');
    setShowSuggestions(false);
  };

  const handleRemoveTerm = (name) => {
    setSelectedTerms(selectedTerms.filter(x => x !== name));
  };

  function handleRangeChange(idx) {
    setSoloTerm(null);
    setRangeGroup(idx);
  }

  const explorerTerms = selectedTerms.filter(termName => {
    const termObj = explorerData?.terms?.find(t => t.term_norm === termName);
    if (!termObj) return false;
    const baseW = (termObj.weeks || []).find(w => w && w.week_id === baselineWeekId);
    return baseW && baseW.searches > 0;
  });

  useChart(expRef, () => {
    if (explorerTerms.length === 0 || !explorerData) return {};
    const datasets = explorerTerms.map((termName, idx) => {
      const termObj = explorerData.terms.find(t => t.term_norm === termName);
      const baseW = termObj.weeks.find(x => x && x.week_id === baselineWeekId);
      const baseVal = baseW ? baseW.searches : 0;

      const data = orderedWids.map(wid => {
        const w = termObj.weeks.find(x => x && x.week_id === wid);
        if (!w) return null;
        return baseVal > 0 ? (w.searches / baseVal) * 100 : 0;
      });

      return {
        label: termName,
        data,
        borderColor: COLORS[idx % COLORS.length],
        backgroundColor: COLORS[idx % COLORS.length],
        tension: 0,
        pointRadius: 6,
        pointHoverRadius: 8,
        spanGaps: false
      };
    });

    datasets.push({
      label: 'Baseline Reference',
      data: orderedWids.map(() => 100),
      borderColor: '#cbd5e1',
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      tension: 0
    });

    return {
      type: 'line',
      data: {
        labels: weeksMeta.map(w => w.label),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const label = ctx.dataset.label;
                if (label === 'Baseline Reference') return null;
                const idxVal = ctx.parsed.y.toFixed(0);
                const termObj = explorerData.terms.find(t => t.term_norm === label);
                const w = termObj.weeks[ctx.dataIndex];
                const searches = w ? w.searches : 0;
                let wowStr = '';
                if (ctx.dataIndex > 0) {
                  const prevW = termObj.weeks[ctx.dataIndex - 1];
                  if (prevW && prevW.searches > 0) {
                    const wow = Math.round((searches - prevW.searches) / prevW.searches * 100);
                    wowStr = `  |  WoW: ${wow >= 0 ? '+' : ''}${wow}%`;
                  }
                }
                return ` ${label}: Index ${idxVal}  |  ${searches.toLocaleString()} searches${wowStr}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            title: { display: true, text: 'Index (baseline = 100)', font: { size: 11 } },
            grid: { color: '#f3f4f6' }
          }
        }
      }
    };
  }, [activeTab, JSON.stringify(explorerTerms), baselineWeekId, JSON.stringify(orderedWids), explorerData]);

  useChart(metalsRef, () => {
    if (!materialData) return {};
    const metalsList = ['Gold', 'Diamond', 'Silver', 'Platinum', 'Rose Gold', 'White Gold'];
    const metalColors = {
      'Gold': '#f59e0b', 'Diamond': '#60a5fa', 'Silver': '#94a3b8',
      'Platinum': '#8b5cf6', 'Rose Gold': '#f43f5e', 'White Gold': '#64748b'
    };

    const datasets = metalsList.map(name => {
      const data = (materialData.metals[name] || []).map(w => w.searches);
      return {
        label: name,
        data,
        borderColor: metalColors[name],
        backgroundColor: metalColors[name],
        tension: 0,
        pointRadius: 5,
        pointHoverRadius: 8,
        spanGaps: false
      };
    });

    return {
      type: 'line',
      data: {
        labels: (materialData.weeks_meta || []).map(w => w.label),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const label = ctx.dataset.label;
                const val = ctx.parsed.y;
                let wowStr = '';
                if (ctx.dataIndex > 0) {
                  const prevVal = ctx.dataset.data[ctx.dataIndex - 1];
                  if (prevVal && prevVal > 0) {
                    const wow = Math.round((val - prevVal) / prevVal * 100);
                    wowStr = ` (${wow >= 0 ? '+' : ''}${wow}% WoW)`;
                  }
                }
                return ` ${label}: ${val.toLocaleString()} searches${wowStr}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: '#f3f4f6' } }
        }
      }
    };
  }, [activeTab, JSON.stringify(materialData)]);

  const gemWeeks = materialData?.weeks_meta || [];
  useChart(gemsRef, () => {
    if (!materialData || gemWeeks.length === 0) return {};
    const gemstonesList = ['Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Polki', 'Kundan', 'Tanzanite', 'Coral', 'Opal'];
    const gemData = gemstonesList.map(name => {
      const wVal = (materialData.gemstones[name] || [])[gemWeekIdx];
      const searches = wVal ? wVal.searches : 0;
      return { name, searches };
    }).sort((a, b) => b.searches - a.searches);

    return {
      type: 'bar',
      data: {
        labels: gemData.map(g => g.name),
        datasets: [{
          data: gemData.map(g => g.searches),
          backgroundColor: '#4f46e5',
          borderRadius: 4,
          barThickness: 14
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const name = ctx.label;
                const val = ctx.parsed.x;
                let wowStr = '';
                if (gemWeekIdx > 0) {
                  const prevW = (materialData.gemstones[name] || [])[gemWeekIdx - 1];
                  const prevVal = prevW ? prevW.searches : 0;
                  if (prevVal > 0) {
                    const wow = Math.round((val - prevVal) / prevVal * 100);
                    wowStr = ` (${wow >= 0 ? '+' : ''}${wow}% WoW)`;
                  }
                }
                return ` Searches: ${val.toLocaleString()}${wowStr}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: '#f3f4f6' } },
          y: { ticks: { font: { size: 11 } } }
        }
      }
    };
  }, [activeTab, JSON.stringify(materialData), gemWeekIdx]);

  const mCats = materialData?.categories || {};
  const sortedCatNames = Object.keys(mCats).sort((a, b) => {
    const sumA = mCats[a].reduce((acc, x) => acc + x.searches, 0);
    const sumB = mCats[b].reduce((acc, x) => acc + x.searches, 0);
    return sumB - sumA;
  });
  const top8Cats = sortedCatNames.slice(0, 8);
  const otherCats = sortedCatNames.slice(8);

  useChart(catsRef, () => {
    if (!materialData || Object.keys(mCats).length === 0) return {};
    const mWeeks = materialData.weeks_meta || [];
    
    const datasets = top8Cats.map((catName, idx) => {
      const data = mCats[catName].map(w => w.searches);
      const color = `hsl(${idx * 45}, 70%, 50%)`;
      const fillVal = `hsla(${idx * 45}, 70%, 60%, 0.3)`;
      
      const isSolo = soloCategory === catName;
      const isFaded = soloCategory !== null && !isSolo;

      return {
        label: catName,
        data,
        fill: isSolo ? true : (soloCategory === null ? true : false),
        backgroundColor: isSolo ? fillVal : (soloCategory === null ? fillVal : 'rgba(0,0,0,0)'),
        borderColor: isSolo ? color : (soloCategory === null ? color : 'rgba(156, 163, 175, 0.1)'),
        borderWidth: isSolo ? 3 : (soloCategory === null ? 2 : 1),
        tension: 0.1,
        pointRadius: isSolo ? 4 : (soloCategory === null ? 3 : 0),
        spanGaps: false
      };
    });

    if (otherCats.length > 0) {
      const otherData = mWeeks.map((_, wi) => {
        return otherCats.reduce((acc, catName) => {
          return acc + (mCats[catName][wi]?.searches || 0);
        }, 0);
      });

      const isSolo = soloCategory === 'Other';
      const isFaded = soloCategory !== null && !isSolo;

      datasets.push({
        label: 'Other',
        data: otherData,
        fill: isSolo ? true : (soloCategory === null ? true : false),
        backgroundColor: isSolo ? 'rgba(156, 163, 175, 0.3)' : (soloCategory === null ? 'rgba(156, 163, 175, 0.3)' : 'rgba(0,0,0,0)'),
        borderColor: isSolo ? '#9ca3af' : (soloCategory === null ? '#9ca3af' : 'rgba(156, 163, 175, 0.1)'),
        borderWidth: isSolo ? 3 : (soloCategory === null ? 2 : 1),
        tension: 0.1,
        pointRadius: isSolo ? 4 : (soloCategory === null ? 3 : 0),
        spanGaps: false
      });
    }

    return {
      type: 'line',
      data: {
        labels: mWeeks.map(w => w.label),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const label = ctx.dataset.label;
                const val = ctx.parsed.y;
                const total = ctx.chart.data.datasets.reduce((acc, ds) => acc + (ds.data[ctx.dataIndex] || 0), 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return ` ${label}: ${val.toLocaleString()} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { stacked: soloCategory === null, grid: { color: '#f3f4f6' } }
        },
        onClick: (event, elements) => {
          if (elements.length === 0) return;
          const clickedDatasetIndex = elements[0].datasetIndex;
          const clickedCategory = clickedDatasetIndex < top8Cats.length ? top8Cats[clickedDatasetIndex] : 'Other';
          if (!clickedCategory) return;
          setSoloCategory(prev => prev === clickedCategory ? null : clickedCategory);
        }
      }
    };
  }, [activeTab, JSON.stringify(materialData), soloCategory]);

  const GROUPS = [
    { label: 'Top 1–10',  start: 0  },
    { label: '11–20',     start: 10 },
    { label: '21–30',     start: 20 },
    { label: '31–40',     start: 30 },
    { label: '41–50',     start: 40 },
  ];

  const visibleGroups = GROUPS.filter(
    g => enrichedTerms_allFifty.length > g.start
  );

  const groupTerms = enrichedTerms_allFifty.slice(
    GROUPS[rangeGroup].start,
    GROUPS[rangeGroup].start + 10
  );

  function buildDatasets(terms) {
    return terms.map((t, i) => {
      const color = LINE_COLORS[i];
      return {
        label:              t.term_norm,
        data:               orderedWids.map(wid => {
                              const w = t.weeks.find(
                                x => x && x.week_id === wid
                              );
                              return w?.searches ?? null;
                            }),
        borderColor:        color,
        backgroundColor:    color,
        pointBackgroundColor: color,
        borderWidth:        2.5,
        pointRadius:        5,
        pointHoverRadius:   7,
        tension:            0,
        spanGaps:           false,
      };
    });
  }

  useEffect(() => {
    if (!canvasRef.current || activeTab !== 'volume-lines') return;
    if (instanceRef.current) {
      instanceRef.current.destroy();
      instanceRef.current = null;
    }

    const labels = weeksMeta.map(w => w.label);

    instanceRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: buildDatasets(groupTerms),
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction: {
          mode:      'point',
          intersect: true,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e1b4b',
            titleColor:      '#e0e7ff',
            bodyColor:       '#c7d2fe',
            padding:         12,
            cornerRadius:    8,
            displayColors:   false,
            callbacks: {
              title: items => items[0].dataset.label,
              label: item  => {
                const wi       = item.dataIndex;
                const searches = item.raw;
                const term     = groupTerms[item.datasetIndex];
                if (!term) return '';
                const prevW    = wi > 0
                  ? (term.weeks.find(
                      x => x && x.week_id === orderedWids[wi - 1]
                    )?.searches ?? null)
                  : null;
                const wow = (prevW != null && prevW > 0)
                  ? Math.round((searches - prevW) / prevW * 100)
                  : null;
                const lines = [
                  `  ${weeksMeta[wi]?.label}`,
                  `  ${searches != null
                       ? searches.toLocaleString()
                       : '—'} searches`,
                ];
                if (wow !== null) {
                  lines.push(
                    `  WoW: ${wow >= 0 ? '+' : ''}${wow}%`
                  );
                }
                const vsBase = term.vsBaseline;
                if (vsBase !== null) {
                  lines.push(
                    `  vs baseline: ${vsBase >= 0 ? '+' : ''}${vsBase}%`
                  );
                }
                return lines;
              },
            }
          }
        },
        scales: {
          x: {
            grid:  { display: false },
            ticks: { font: { size: 11 }, color: '#6b7280' },
          },
          y: {
            grid:  { color: '#f3f4f6' },
            border:{ display: false },
            ticks: {
              font:     { size: 11 },
              color:    '#6b7280',
              callback: v => v != null ? v.toLocaleString() : '',
            },
          }
        },
        onClick: (event, elements) => {
          if (elements.length === 0) return;
          const clickedTerm =
            groupTerms[elements[0].datasetIndex]?.term_norm;
          if (!clickedTerm) return;
          setSoloTerm(prev =>
            prev === clickedTerm ? null : clickedTerm
          );
        },
      }
    });

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, [activeTab, rangeGroup, JSON.stringify(weeksMeta), JSON.stringify(orderedWids)]);

  useEffect(() => {
    const chart = instanceRef.current;
    if (!chart) return;

    chart.data.datasets.forEach((ds, i) => {
      const color = LINE_COLORS[i];
      if (soloTerm === null) {
        ds.borderColor        = color;
        ds.backgroundColor    = color;
        ds.pointBackgroundColor = color;
        ds.borderWidth        = 2.5;
        ds.pointRadius        = 5;
      } else if (ds.label === soloTerm) {
        ds.borderColor        = color;
        ds.backgroundColor    = color;
        ds.pointBackgroundColor = color;
        ds.borderWidth        = 3.5;
        ds.pointRadius        = 6;
      } else {
        const faded           = hexToRgba(color, 0.1);
        ds.borderColor        = faded;
        ds.backgroundColor    = faded;
        ds.pointBackgroundColor = faded;
        ds.borderWidth        = 1;
        ds.pointRadius        = 3;
      }
    });

    chart.update('none');
  }, [soloTerm]);

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-gray-500 text-xs font-medium">Loading trends dashboard…</p>
      </div>
    );
  }

  if (availableWeeks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <p className="text-gray-500 text-sm font-medium">No weekly data uploaded yet.</p>
        <a href="/admin" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          Go to /admin to upload your first week.
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mr-2">Toggle Weeks:</span>
          {availableWeeks.map(w => {
            const selected = selectedWeekIds.includes(w.id);
            return (
              <button key={w.id} onClick={() => handleToggleWeek(w.id)}
                className={`text-left px-3 py-1.5 rounded-lg border transition-all ${selected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'border-gray-200 text-gray-600 hover:border-indigo-400 bg-white'}`}>
                <div className="text-xs font-bold">{w.label}</div>
                <div className={`text-[10px] ${selected ? 'text-indigo-200' : 'text-gray-400'}`}>{(w.total_searches || 0).toLocaleString()} searches</div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Baseline:</label>
          <select value={baselineWeekId || ''} onChange={e => setBaselineWeekId(Number(e.target.value))}
            className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500">
            {availableWeeks.filter(w => selectedWeekIds.includes(w.id)).map(w => (
               <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'top-terms', label: '📈 Top Terms' },
          { id: 'explorer', label: '🔍 Term Explorer' },
          { id: 'material', label: '💎 Material Pulse' },
          { id: 'volume-lines', label: '📊 Volume Lines' }
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 -mb-[2px] ${activeTab === t.id ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-gray-500 hover:text-indigo-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="text-gray-500 text-xs font-medium">Fetching trend data…</p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {activeTab === 'top-terms' && trendsData && (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
                  {[{id:'table',label:'Table + Sparklines'}, {id:'rank', label:'Rank chart'}].map(v => (
                    <button key={v.id} onClick={() => setViewMode(v.id)}
                            className={`px-3 py-2 font-medium transition-colors ${viewMode===v.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-indigo-50'}`}>
                      {v.label}
                    </button>
                  ))}
                </div>

                <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
                  {[10, 25, 50].map(n => (
                    <button key={n} onClick={() => { setTopN(n); setExpandedTerms(new Set()); }}
                            className={`px-3 py-2 font-medium transition-colors border-r border-gray-200 last:border-0 ${topN===n ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-indigo-50'}`}>
                      Top {n}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-gray-400 ml-auto font-medium">
                  {viewMode === 'table' ? 'Click any row to expand week-by-week detail' : 'Rank index based on selected baseline'}
                </span>
              </div>

              {viewMode === 'table' ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <table style={{ tableLayout:'fixed', width:'100%' }} className="text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-medium">
                      <tr>
                        <th style={{width:36}}  className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Term</th>
                        <th style={{width:106}}  className="px-3 py-2 text-center">Trend (hover)</th>
                        <th style={{width:98}}  className="px-3 py-2 text-right">Latest WoW</th>
                        <th style={{width:98}}  className="px-3 py-2 text-right">vs Baseline</th>
                        <th style={{width:36}}  className="px-3 py-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedTerms.map((t, i) => {
                        const isExpanded = expandedTerms.has(t.term_norm);
                        return (
                          <React.Fragment key={t.term_norm}>
                            <tr className="border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors"
                              onClick={() => {
                                setExpandedTerms(prev => {
                                  const next = new Set(prev);
                                  if (next.has(t.term_norm)) next.delete(t.term_norm);
                                  else next.add(t.term_norm);
                                  return next;
                                });
                              }}
                            >
                              <td className="px-3 py-2 text-gray-400">{i+1}</td>
                              <td className="px-3 py-2">
                                <div className="font-bold text-gray-800">{t.term_norm}</div>
                                <div className="text-[10px] text-gray-400 mt-0.5">{t.category}</div>
                              </td>
                              <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                                <SparklineCell term={t} weeksMeta={weeksMeta} orderedWids={orderedWids} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <DeltaPill v={t.latestWoW} />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <DeltaPill v={t.vsBaseline} />
                              </td>
                              <td className="px-3 py-2 text-center text-gray-400 text-[10px]">
                                {isExpanded ? '▲' : '▼'}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-indigo-50/20 border-b border-gray-100">
                                <td colSpan={6} className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                  <WeekDetailPanel term={t} weeksMeta={weeksMeta} orderedWids={orderedWids} baselineWeekId={baselineWeekId} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <BumpRankChart enrichedTerms={enrichedTerms} ranksMap={ranksMap} weeksMeta={weeksMeta} orderedWids={orderedWids} />
                </div>
              )}
            </>
          )}

          {activeTab === 'explorer' && trendsData && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="relative">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-2">Search Term</label>
                  <input type="text" value={inputVal} onChange={e => setInputVal(e.target.value)} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Type term name to explore (e.g. gold ring)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-48 overflow-y-auto text-xs">
                      {suggestions.map(s => (
                        <div key={s} onMouseDown={() => handleAddTerm(s)} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer transition-colors font-medium text-gray-800">
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  {selectedTerms.map((t, idx) => {
                    const color = COLORS[idx % COLORS.length];
                    const termObj = explorerData?.terms?.find(item => item.term_norm === t);
                    const baseW = termObj?.weeks?.find(w => w && w.week_id === baselineWeekId);
                    const hasBaselineData = baseW && baseW.searches > 0;
                    return (
                      <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border" style={{ borderColor: color, color: color, backgroundColor: `${color}0d` }}>
                        {t}
                        {explorerData && !hasBaselineData && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 rounded px-1 py-0.5 font-bold">
                            No data in baseline week
                          </span>
                        )}
                        <button onClick={() => handleRemoveTerm(t)} className="hover:opacity-70 font-bold ml-1">×</button>
                      </span>
                    );
                  })}
                  {selectedTerms.length === 0 && (
                    <p className="text-xs text-gray-400 py-1">Type to search and add terms to compare (max 8 terms)</p>
                  )}
                </div>
              </div>

              {selectedTerms.length > 0 && (
                <>
                  {!explorerData ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      <p className="text-gray-500 text-xs font-medium">Loading term data…</p>
                    </div>
                  ) : explorerTerms.length > 0 ? (
                    <Card title="Term Explorer — Indexed search interest over time" badge="Index base = 100">
                      <div style={{ height: 320 }}><canvas ref={expRef} /></div>
                    </Card>
                  ) : (
                    <div className="text-center py-10 text-gray-500 text-xs font-semibold border rounded-lg bg-gray-50">
                      Add terms that have search data in the selected baseline week to compare.
                    </div>
                  )}

                  {explorerData && (
                    <div className="flex gap-4 overflow-x-auto py-2">
                      {selectedTerms.map((termName, i) => {
                        const color = COLORS[i % COLORS.length];
                        const termObj = explorerData.terms.find(t => t.term_norm === termName);
                        if (!termObj) return null;
                        
                        const weeks = orderedWids.map(wid => {
                          const w = (termObj.weeks || []).find(x => x && x.week_id === wid);
                          return w || null;
                        });

                        const baseVal = weeks[baselineIdx]?.searches ?? 0;
                        const latestVal = weeks[latestIdx]?.searches ?? 0;
                        
                        let peakVal = -1;
                        let peakLabel = '—';
                        weeks.forEach((w, idx) => {
                          if (w && w.searches > peakVal) {
                            peakVal = w.searches;
                            peakLabel = weeksMeta[idx]?.label || '—';
                          }
                        });

                        const overallChange = baseVal > 0 ? Math.round((latestVal - baseVal) / baseVal * 100) : null;

                        return (
                          <div key={termName} className="min-w-[180px] bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                            <div>
                              <p className="text-xs font-bold truncate" style={{ color }}>{termName}</p>
                              <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                                <div className="flex justify-between"><span>Base:</span><span className="font-semibold text-gray-700">{baseVal.toLocaleString()}</span></div>
                                <div className="flex justify-between"><span>Latest:</span><span className="font-semibold text-gray-700">{latestVal.toLocaleString()}</span></div>
                                <div className="flex justify-between font-medium"><span>Peak:</span><span className="text-gray-700 truncate">{peakLabel} ({peakVal.toLocaleString()})</span></div>
                              </div>
                            </div>
                            <div className="mt-3 border-t pt-2 flex justify-between items-center">
                              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Overall:</span>
                              <DeltaPill v={overallChange} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'material' && materialData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="Metallic Queries Trend — absolute search volume" badge="Includes Rose/White Gold">
                <div style={{ height: 280 }}><canvas ref={metalsRef} /></div>
                <p className="text-[10px] text-gray-400 mt-2 italic">Searches mentioning each keyword — a term can appear in multiple metal groups</p>
              </Card>

              <Card title="Gemstone queries distribution for selected week">
                <div className="flex flex-wrap gap-1 mb-4 overflow-x-auto py-1">
                  {gemWeeks.map((w, idx) => (
                    <button key={w.id} onClick={() => setGemWeekIdx(idx)}
                      className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-all ${gemWeekIdx === idx ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-400 bg-white'}`}>
                      {w.label}
                    </button>
                  ))}
                </div>
                <div style={{ height: 280 }}><canvas ref={gemsRef} /></div>
              </Card>

              <Card title="Category Search share trend" badge="Top 8 categories + Other" className="lg:col-span-2">
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'12px' }}>
                  {top8Cats.map((catName, idx) => {
                    const color = `hsl(${idx * 45}, 70%, 50%)`;
                    const isSolo = soloCategory === catName;
                    const isFaded = soloCategory !== null && !isSolo;
                    return (
                      <button
                        key={catName}
                        onClick={() => setSoloCategory(prev => prev === catName ? null : catName)}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          gap:            '5px',
                          padding:        '4px 10px',
                          borderRadius:   '20px',
                          fontSize:       '11px',
                          fontWeight:     '500',
                          cursor:         'pointer',
                          border:         `0.5px solid ${isSolo ? color : color + '55'}`,
                          background:     isSolo ? `hsla(${idx * 45}, 70%, 60%, 0.1)` : 'white',
                          color:          isSolo ? color : '#4b5563',
                          opacity:        isFaded ? 0.35 : 1,
                          transition:     'all 0.15s',
                        }}
                      >
                        <span style={{
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: color,
                          flexShrink: 0,
                        }} />
                        <span>{catName}</span>
                      </button>
                    );
                  })}
                  {otherCats.length > 0 && (() => {
                    const isSolo = soloCategory === 'Other';
                    const isFaded = soloCategory !== null && !isSolo;
                    return (
                      <button
                        key="Other"
                        onClick={() => setSoloCategory(prev => prev === 'Other' ? null : 'Other')}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          gap:            '5px',
                          padding:        '4px 10px',
                          borderRadius:   '20px',
                          fontSize:       '11px',
                          fontWeight:     '500',
                          cursor:         'pointer',
                          border:         `0.5px solid ${isSolo ? '#9ca3af' : '#9ca3af55'}`,
                          background:     isSolo ? 'rgba(156, 163, 175, 0.1)' : 'white',
                          color:          isSolo ? '#4b5563' : '#4b5563',
                          opacity:        isFaded ? 0.35 : 1,
                          transition:     'all 0.15s',
                        }}
                      >
                        <span style={{
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: '#9ca3af',
                          flexShrink: 0,
                        }} />
                        <span>Other</span>
                      </button>
                    );
                  })()}
                </div>

                <div style={{ height: 320 }}><canvas ref={catsRef} /></div>

                <p className="text-xs text-gray-400 text-center mt-2">
                  {soloCategory
                    ? `Showing: "${soloCategory}" — click again to reset`
                    : 'Click a category pill or line to isolate · stacked view shows overall search share'}
                </p>
              </Card>
            </div>
          )}

          {activeTab === 'volume-lines' && trendsData && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              {/* Title row */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">
                    Search volume trend —{' '}
                    {GROUPS[rangeGroup].label.toLowerCase()}
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 text-right">
                  Absolute searches per week · click any term to isolate it
                </p>
              </div>

              {/* Range pills */}
              <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
                {visibleGroups.map((g, i) => (
                  <button
                    key={g.label}
                    onClick={() => handleRangeChange(i)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors
                      ${rangeGroup === i
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                      }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Term pills */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'12px' }}>
                {groupTerms.map((t, i) => (
                  <TermPill
                    key={t.term_norm}
                    term={t}
                    color={LINE_COLORS[i]}
                    soloTerm={soloTerm}
                    onToggle={term => setSoloTerm(
                      prev => prev === term ? null : term
                    )}
                  />
                ))}
              </div>

              {/* Chart */}
              <div style={{ position:'relative', width:'100%', height:'300px' }}>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`Search volume trend for ${GROUPS[rangeGroup].label} terms`}
                >
                  Search volume trends across weeks.
                </canvas>
              </div>

              {/* Hint */}
              <p className="text-xs text-gray-400 text-center mt-2">
                {soloTerm
                  ? `Showing: "${soloTerm}" — click again to reset`
                  : 'Click a term pill or line to isolate · hover for week detail'}
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS & SEASONALITY SUMMARY BUILDERS, COMPONENTS AND HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildTermRow(t, thr) {
  const avgVisit = (thr?.visit_rate || 0) * 100;
  const avgA2c   = (thr?.a2c_rate   || 0) * 100;
  const avgPurch = (thr?.purchase_rate || 0) * 100;
  return {
    term:              t.term_norm || t.term || '',
    searches:          t.searches || 0,
    mom_pct:           t.searches_growth != null
                         ? parseFloat(t.searches_growth.toFixed(1))
                         : null,
    visit_rate_pct:    parseFloat(((t.visit_rate || 0) * 100).toFixed(1)),
    a2c_rate_pct:      parseFloat(((t.a2c_rate_s || 0) * 100).toFixed(1)),
    purchase_rate_pct: parseFloat(((t.purchase_rate || 0) * 100).toFixed(1)),
    avg_visit_rate:    parseFloat(avgVisit.toFixed(1)),
    avg_a2c_rate:      parseFloat(avgA2c.toFixed(1)),
    avg_purch_rate:    parseFloat(avgPurch.toFixed(1)),
  };
}

function buildWeeklyBriefSummary(result) {
  const kpis    = result?.kpis   || {};
  const d11     = result?.layer1?.['1.1'] || {};
  const terms   = d11?.terms || [];
  const thr     = d11?.thresholds || {};
  const d15     = result?.layer1?.['1.5'] || {};
  const d38     = result?.layer3?.['3.8'] || {};
  const d16     = result?.layer1?.['1.6'] || {};
  const topOcc   = (d16?.occasion_clusters || [])
                   .sort((a,b)=>(b.searches||0)-(a.searches||0))[0];

  return {
    total_searches:       kpis.total_searches || 0,
    total_orders:         kpis.total_orders   || 0,
    e2e_conv:             kpis.e2e_conv
                            ? (kpis.e2e_conv*100).toFixed(3) : '0',
    zero_conv_count:      (d38.terms || []).length,
    zero_cart_count:      d15.zero_cart_count || 0,
    top_occasion:         topOcc?.cluster || 'n/a',
    top_occasion_searches:topOcc?.searches || 0,
    top_occasion_conv:    topOcc?.conv_rate
                            ? (topOcc.conv_rate).toFixed(2) : '0',
    top_10_terms:         terms.slice(0,10).map(t => buildTermRow(t, thr)),
    site_avg: {
      visit_rate_pct: (thr.visit_rate || 0) * 100,
      a2c_rate_pct:   (thr.a2c_rate || 0) * 100,
      purchase_rate_pct: (thr.purchase_rate || 0) * 100,
    }
  };
}

function buildDemandSummary(result) {
  const d11       = result?.layer1?.['1.1'] || {};
  const terms     = d11?.terms || [];
  const thr       = d11?.thresholds || {};
  const d15       = result?.layer1?.['1.5'] || {};
  const d16       = result?.layer1?.['1.6'] || {};

  const withMom   = terms.filter(t => t.searches_growth != null);
  const growers   = [...withMom].sort((a,b) => b.searches_growth - a.searches_growth);
  const decliners = [...withMom].sort((a,b) => a.searches_growth - b.searches_growth);

  const halfVisit = thr.visit_rate ? thr.visit_rate * 0.5 : 0;
  const brokenGrowing = growers.filter(
    t => t.searches_growth > 20 && (t.visit_rate || 0) < halfVisit
  );

  const topOcc = (d16?.occasion_clusters || [])
                   .sort((a,b)=>(b.searches||0)-(a.searches||0))[0];

  return {
    top_10_terms: terms.slice(0,10).map(t => buildTermRow(t, thr)),
    site_avg: {
      visit_rate_pct: (thr.visit_rate || 0) * 100,
      a2c_rate_pct:   (thr.a2c_rate || 0) * 100,
      purchase_rate_pct: (thr.purchase_rate || 0) * 100,
    },
    top_growers:   growers.slice(0,5).map(t => buildTermRow(t, thr)),
    top_decliners: decliners.slice(0,5).map(t => buildTermRow(t, thr)),
    broken_funnel_summary: brokenGrowing.slice(0, 5).map(t =>
      `${t.term_norm || t.term} (growth: ${t.searches_growth?.toFixed(1)}%, visit rate: ${((t.visit_rate || 0) * 100).toFixed(1)}%)`
    ).join('; ') || 'none',
    long_tail_pct: d15.pct_of_searches ? d15.pct_of_searches.toFixed(1) : '0',
    top_occasion:  topOcc?.cluster || 'n/a',
    top_occasion_searches: topOcc?.searches || 0,
  };
}

function buildCatalogGapsSummary(result) {
  const d15    = result?.layer1?.['1.5'] || {};
  const d38    = result?.layer3?.['3.8'] || {};
  const terms38 = d38.terms || [];
  const zeroCt = [...terms38].sort((a,b) => (b.searches||0) - (a.searches||0));
  const d11    = result?.layer1?.['1.1'] || {};
  const thr    = d11?.thresholds || {};

  return {
    avg_visit_rate:  ((thr.visit_rate || 0) * 100).toFixed(1),
    zero_cart_count: d15?.zero_cart_count || 0,
    zero_cart_terms: (d15?.zero_cart_terms || []).slice(0,10).map(t => ({
      term:           t.term_norm || t.term || '',
      searches:       t.searches || 0,
      visit_rate_pct: ((t.visit_rate || 0) * 100).toFixed(1)
    })),
    zero_conv_count: terms38.length,
    zero_conv_terms: zeroCt.slice(0,10).map(t => ({
      term:           t.term_norm || t.term || '',
      searches:       t.searches || 0,
      visit_rate_pct: t.search_visits && t.searches ? ((t.search_visits / t.searches) * 100).toFixed(1) : '0'
    })),
  };
}

function buildFunnelSummary(result) {
  const kpis    = result?.kpis || {};
  const d39    = result?.layer3?.['3.9'] || {};
  const d38    = result?.layer3?.['3.8'] || {};
  const d35    = result?.layer3?.['3.5'] || {};

  const stages = {};
  (d39.stage_counts || []).forEach(s => {
    if (s.stage.includes('Stage 1')) stages.stage1 = s.count;
    if (s.stage.includes('Stage 2')) stages.stage2 = s.count;
    if (s.stage.includes('Stage 3')) stages.stage3 = s.count;
    if (s.stage.includes('Healthy')) stages.healthy = s.count;
  });

  const a2cNoOrders = (result?.layer1?.['1.1']?.terms || []).filter(
    t => (t.a2c_count || 0) > 0 && (t.orders || 0) === 0
  );

  return {
    overall_visit_rate:    ((kpis.visit_rate || 0) * 100).toFixed(1),
    overall_a2c_rate:      ((kpis.a2c_rate || 0) * 100).toFixed(1),
    overall_purchase_rate: kpis.a2c_count ? ((kpis.orders / kpis.a2c_count) * 100).toFixed(1) : '0',
    overall_e2e:           ((kpis.e2e_conv || 0) * 100).toFixed(2),
    stage_breakdown: {
      stage1:  stages.stage1 || 0,
      stage2:  stages.stage2 || 0,
      stage3:  stages.stage3 || 0,
      healthy: stages.healthy || 0,
    },
    top_degraders: [],
    a2c_no_orders_terms: a2cNoOrders.slice(0,10).map(t => ({
      term:      t.term_norm || t.term || '',
      a2c_count: t.a2c_count || 0,
    })),
    category_funnel: (d35.categories || []).slice(0, 10).map(c => ({
      category:          c.category,
      searches:          c.searches,
      visit_rate_pct:    (c.avg_visit_rate * 100).toFixed(1),
      a2c_rate_pct:      (c.avg_a2c_rate * 100).toFixed(1),
      purchase_rate_pct: (c.avg_purchase_rate * 100).toFixed(1),
    })),
  };
}

function buildCategoriesSummary(result) {
  const d29 = result?.layer2?.['2.9'] || {};
  const kpis = result?.kpis || {};

  const categories = d29.categories || [];
  const siteAvgE2e = ((kpis.e2e_conv || 0) * 100).toFixed(2);

  const bestCat = [...categories].sort((a,b) => (b.a2c_rate_curr || 0) - (a.a2c_rate_curr || 0))[0];
  const worstCat = [...categories].sort((a,b) => (a.a2c_rate_curr || 0) - (b.a2c_rate_curr || 0))[0];

  return {
    site_avg_e2e: siteAvgE2e,
    category_data: categories.map(c => ({
      category:       c.category,
      searches:       c.searches,
      mom_pct:        c.search_growth,
      visit_rate_pct: c.avg_visit_rate ? (c.avg_visit_rate * 100).toFixed(1) : '0',
      a2c_rate_pct:   (c.a2c_rate_curr * 100).toFixed(1),
      e2e_pct:        c.e2e_conv ? (c.e2e_conv * 100).toFixed(2) : ((c.orders / Math.max(c.searches, 1)) * 100).toFixed(2),
    })),
    breakout_term:     result?.layer1?.['1.13']?.terms_300?.[0]?.term_norm || 'none',
    breakout_searches: result?.layer1?.['1.13']?.terms_300?.[0]?.searches || 0,
    best_conv_cat:     bestCat?.category || 'n/a',
    best_conv_rate:    bestCat ? (bestCat.a2c_rate_curr * 100).toFixed(1) : '0',
    worst_conv_cat:    worstCat?.category || 'n/a',
    worst_conv_rate:   worstCat ? (worstCat.a2c_rate_curr * 100).toFixed(1) : '0',
    worst_conv_searches: worstCat?.searches || 0,
  };
}

const SUMMARY_BUILDERS = {
  weekly_brief: buildWeeklyBriefSummary,
  demand:       buildDemandSummary,
  catalog_gaps: buildCatalogGapsSummary,
  funnel:       buildFunnelSummary,
  categories:   buildCategoriesSummary,
};

const INSIGHT_SECTIONS = [
  {
    key:      'weekly_brief',
    title:    'Weekly brief',
    subtitle: 'High-level WoW demand & funnel changes',
    icon:     '⚡',
  },
  {
    key:      'demand',
    title:    'Demand signals',
    subtitle: 'Rising/declining search terms',
    icon:     '🔍',
  },
  {
    key:      'catalog_gaps',
    title:    'Catalog & relevance gaps',
    subtitle: 'Zero-conversion terms & zero-cart long-tail gaps',
    icon:     '⚠️',
  },
  {
    key:      'funnel',
    title:    'Funnel health',
    subtitle: 'Where the search-to-purchase funnel is leaking',
    icon:     '🔻',
  },
  {
    key:      'categories',
    title:    'Category intelligence',
    subtitle: 'Which categories are winning and which need attention',
    icon:     '📂',
  },
];

const CARD_LAYERS = [
  {
    key:        'what_happened',
    label:      'What happened',
    labelColor: 'text-slate-700',
    bgColor:    'bg-slate-50',
    border:     'border-slate-200',
    dot:        'bg-slate-400',
  },
  {
    key:        'why_it_matters',
    label:      'Why it matters',
    labelColor: 'text-indigo-700',
    bgColor:    'bg-indigo-50/50',
    border:     'border-indigo-100',
    dot:        'bg-indigo-400',
  },
  {
    key:        'hidden_insight',
    label:      'Hidden insight',
    labelColor: 'text-violet-700',
    bgColor:    'bg-violet-50/50',
    border:     'border-violet-100',
    dot:        'bg-violet-400',
  },
  {
    key:        'action',
    label:      'Action this week',
    labelColor: 'text-emerald-700',
    bgColor:    'bg-emerald-50/50',
    border:     'border-emerald-100',
    dot:        'bg-emerald-400',
  },
  {
    key:        'opportunity_outlook',
    label:      'Opportunity & Outlook',
    labelColor: 'text-amber-700',
    bgColor:    'bg-amber-50/50',
    border:     'border-amber-100',
    dot:        'bg-amber-400',
  },
];

function InsightsModule({ result }) {
  const [insights, setInsights] = useState({});
  const [triggered, setTriggered] = useState(false);
  const [activeSection, setActiveSection] = useState('weekly_brief');

  useEffect(() => {
    setInsights({});
    setTriggered(false);
    setActiveSection('weekly_brief');
  }, [result]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-2xl mb-3">📊</p>
        <p className="text-sm font-medium text-gray-600">No data uploaded yet</p>
        <p className="text-xs text-gray-400 mt-1">Upload a search CSV first to generate insights</p>
      </div>
    );
  }

  async function fetchInsight(section) {
    setInsights(prev => ({
      ...prev,
      [section]: { status: 'loading', sections: {}, model: '' }
    }));
    try {
      const builder = SUMMARY_BUILDERS[section];
      const summary = builder(result);
      const res     = await fetch('/generate-insight', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ section, summary }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setInsights(prev => ({
          ...prev,
          [section]: {
            status:   'done',
            sections: data.sections,
            model:    data.model,
          }
        }));
      } else {
        setInsights(prev => ({
          ...prev,
          [section]: {
            status: 'error',
            error:  data.message || 'Unknown error',
          }
        }));
      }
    } catch (e) {
      setInsights(prev => ({
        ...prev,
        [section]: { status: 'error', error: e.message }
      }));
    }
  }

  async function generateAll() {
    setTriggered(true);
    for (const section of INSIGHT_SECTIONS.map(s => s.key)) {
      await fetchInsight(section);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const activeState = insights[activeSection];
  const activeIconInfo = INSIGHT_SECTIONS.find(s => s.key === activeSection);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">✨ AI Copilot Insights</h2>
          <p className="text-xs text-gray-500 mt-0.5">Generate natural language analyses of your search funnel and demand anomalies.</p>
        </div>
        {!triggered && (
          <button onClick={generateAll} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-4 py-2 rounded-lg transition shadow-md">
            🚀 Generate All Insights
          </button>
        )}
      </div>

      {triggered && (
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-px">
          {INSIGHT_SECTIONS.map(s => {
            const state = insights[s.key];
            const isLd = state?.status === 'loading';
            const isDn = state?.status === 'done';
            const isEr = state?.status === 'error';
            return (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap
                  ${activeSection === s.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <span>{s.icon}</span>
                <span>{s.title}</span>
                {isLd && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                {isDn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                {isEr && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
              </button>
            );
          })}
        </div>
      )}

      {triggered && activeState && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            {activeState.status === 'loading' && (
              <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-600">Analyzing data and generating narrative for {activeIconInfo?.title}...</p>
              </div>
            )}
            {activeState.status === 'error' && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-sm">Failed to generate insights</h3>
                <p className="text-xs mt-1">{activeState.error}</p>
                <button onClick={() => fetchInsight(activeSection)} className="mt-3 bg-white border border-rose-300 text-rose-700 text-xs px-3 py-1.5 rounded-lg hover:bg-rose-100 transition">
                  🔄 Retry Generation
                </button>
              </div>
            )}
            {activeState.status === 'done' && (
              <div className="space-y-4">
                {CARD_LAYERS.map(layer => {
                  const text = activeState.sections[layer.key];
                  if (!text) return null;
                  return (
                    <div key={layer.key} className={`p-5 rounded-xl border ${layer.bgColor} ${layer.border} shadow-sm transition-all hover:shadow-md`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${layer.dot}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider ${layer.labelColor}`}>{layer.label}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed font-medium">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="xl:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
                <span>📋</span> Summary Indicators
              </h3>
              {activeState.status === 'done' && activeState.sections.summary_table?.length > 0 ? (
                <div className="space-y-3">
                  {activeState.sections.summary_table.map((row, i) => (
                    <div key={i} className="text-xs p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1">
                      <div className="font-semibold text-slate-700">{row.observation}</div>
                      <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1 border-t border-slate-100">
                        <span className="font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{row.metric}</span>
                        <span className="font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{row.impact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeState.status === 'loading' ? (
                <div className="text-xs text-gray-400 py-6 text-center">Loading indicators...</div>
              ) : (
                <div className="text-xs text-gray-400 py-6 text-center">No summary indicators returned.</div>
              )}
              {activeState.status === 'done' && (
                <div className="text-[10px] text-gray-400 text-right pt-2 border-t border-gray-100">
                  Model: <span className="font-medium">{activeState.model}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!triggered && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto shadow-sm">
          <p className="text-2xl mb-3">🤖</p>
          <h3 className="font-semibold text-gray-800 text-sm">Tap into AI product insights</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Generate a 5-layer analysis powered by Groq Llama 3.3 / Gemini, covering weekly briefs, search anomalies, catalog relevance issues, checkout leaks, and category growth profiles.</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASONALITY MODULE COMPONENTS AND HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function indexColor(v) {
  if (v === null || v === undefined) return 'bg-slate-50';
  if (v > 120) return 'bg-indigo-600';
  if (v > 105) return 'bg-indigo-200';
  if (v > 95)  return 'bg-slate-100';
  if (v > 80)  return 'bg-rose-100';
  return 'bg-rose-300';
}

function indexTextColor(v) {
  if (v === null || v === undefined) return 'text-slate-400';
  if (v > 120) return 'text-white';
  if (v > 105) return 'text-indigo-950';
  if (v > 95)  return 'text-slate-700';
  if (v > 80)  return 'text-rose-950';
  return 'text-rose-950';
}

function leaderGreen(index) {
  // Darker green = stronger winning month, lighter green =
  // a narrower win. Clamped between index 100 (just average)
  // and 250 (extreme peak) for the gradient range.
  const clamped  = Math.max(100, Math.min(250, index));
  const t        = (clamped - 100) / 150;
  const lightness = 72 - t * 32;  // ranges ~72% down to ~40%
  return `hsl(142, 62%, ${lightness}%)`;
}

function MonthlyLeadersStrip({ months, monthlyLeaders }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!monthlyLeaders || monthlyLeaders.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto mb-8 px-5 pt-4">
      <p className="text-xs text-gray-400 mb-2">
        Top category by index each month — hover any cell to see the top 3
      </p>
      <table style={{ borderCollapse:'collapse', fontSize:'11px' }}>
        <thead>
          <tr>
            <th style={{ padding:'6px 10px 6px 20px', textAlign:'left',
                        minWidth:'120px' }}></th>
            {months.map(m => (
              <th key={m.id} style={{ padding:'6px 4px',
                  fontWeight:500, color:'#6b7280',
                  minWidth:'92px' }}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding:'4px 10px 4px 20px', fontWeight:500,
                        color:'#374151' }}>
              Top category
            </td>
            {monthlyLeaders.map((ml, i) => {
              const winner = ml.top3[0];
              if (!winner) {
                return (
                  <td key={i} style={{ padding:'10px 6px',
                      textAlign:'center', color:'#9ca3af' }}>
                    —
                  </td>
                );
              }
              return (
                <td key={i}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{
                      padding: '8px 6px',
                      textAlign: 'center',
                      background: leaderGreen(winner.index),
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'default',
                      position: 'relative',
                      borderRadius: '4px',
                    }}>
                  <div style={{ fontSize:'10px', lineHeight:'1.3' }}>
                    {winner.category}
                  </div>
                  <div style={{ fontSize:'12px', marginTop:'2px' }}>
                    {winner.index}
                  </div>

                  {hoverIdx === i && (
                    <div style={{
                      position:'absolute', bottom:'100%', left:'50%',
                      transform:'translateX(-50%)', marginBottom:'6px',
                      background:'#1e1b4b', color:'#fff',
                      fontSize:'11px', padding:'8px 12px',
                      borderRadius:'8px', whiteSpace:'nowrap',
                      zIndex:50, textAlign:'left',
                      boxShadow:'0 4px 12px rgba(0,0,0,0.25)',
                    }}>
                      <div style={{ fontWeight:600, marginBottom:'4px',
                                    color:'#a5b4fc' }}>
                        {ml.month_label}
                      </div>
                      {ml.top3.map((t, ti) => (
                        <div key={ti} style={{
                          padding:'2px 0',
                          color: ti === 0 ? '#fff' : '#cbd5e1',
                        }}>
                          #{ti+1} {t.category} — {t.index}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CategoryIndexView({ months, categories, monthlyLeaders }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-800">Category Seasonality Index Heatmap</h3>
        <p className="text-xs text-gray-400 mt-0.5">Normalized relative to each category's own annual average searches (100 = average).</p>
      </div>
      <div className="overflow-x-auto">
        <MonthlyLeadersStrip months={months} monthlyLeaders={monthlyLeaders} />
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-100">
              <th className="p-4 font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">Category</th>
              {months.map(m => (
                <th key={m.id} className="p-4 font-bold text-slate-500 uppercase tracking-wider text-center">{m.label}</th>
              ))}
              <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-center">Peak Month</th>
              <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-center">Trough Month</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map(cat => (
              <tr key={cat.category} className="hover:bg-slate-50/50">
                <td className="p-4 font-semibold text-gray-800">
                  <div className="flex items-center gap-1.5">
                    <span>{cat.category}</span>
                    {!cat.reliable && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full"
                        title={`Only ${cat.populated_months} month(s) of data — index not yet reliable`}>
                        low data
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 font-normal">Avg: {fmt(cat.avg_monthly_searches)} searches</div>
                </td>
                {cat.monthly_index.map((idx, i) => (
                  <td key={i} className="p-2 text-center">
                    <div className={`py-2 px-1 rounded font-semibold transition-all shadow-sm ${indexColor(idx)} ${indexTextColor(idx)}`}
                      title={`${fmt(cat.monthly_searches[i])} searches`}>
                      {idx.toFixed(1)}
                    </div>
                  </td>
                ))}
                <td className="p-4 text-center">
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-full font-bold">
                    📈 {cat.peak_month} ({cat.peak_index}%)
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className="bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-1 rounded-full font-bold">
                    📉 {cat.trough_month} ({cat.trough_index}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 border-t border-gray-100 bg-slate-50/50 flex flex-wrap gap-4 text-[10px] justify-center">
        <span className="font-semibold text-gray-500 uppercase">Legend:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-600" /> Peak (&gt;120)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-200" /> Above Avg (105–120)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-gray-200" /> Average (95–105)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-100" /> Below Avg (80–95)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-300" /> Trough (&lt;80)</span>
      </div>
    </div>
  );
}

function YoyPatternView({ sameMonthYoy, transitionPatterns }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-800">Same-Month Year-over-Year (YoY) Search Volumes</h3>
          <p className="text-xs text-gray-400 mt-0.5">Comparison of identical calendar months across consecutive years.</p>
        </div>
        {sameMonthYoy.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">Not enough historical data to compute same-month YoY. Upload data spanning at least 13 months.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sameMonthYoy.map((block, i) => (
              <div key={i} className="p-5 space-y-3">
                <h4 className="text-xs font-bold text-indigo-600 flex items-center gap-2">
                  <span>📅</span> {block.month_label} vs {block.compared_to}
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-gray-100 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="p-3">Category</th>
                        <th className="p-3 text-right">{block.compared_to} Searches</th>
                        <th className="p-3 text-right">{block.month_label} Searches</th>
                        <th className="p-3 text-center">YoY Growth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {block.categories.map(c => {
                        const isUp = c.pct_change > 0;
                        return (
                          <tr key={c.category} className="hover:bg-slate-50/30">
                            <td className="p-3 font-semibold text-gray-800">{c.category}</td>
                            <td className="p-3 text-right font-mono text-gray-500">{fmt(c.prev_searches)}</td>
                            <td className="p-3 text-right font-mono text-gray-800">{fmt(c.curr_searches)}</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded font-bold ${isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {isUp ? '▲' : '▼'} {Math.abs(c.pct_change)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-800">Month-over-Month Transition Deviations</h3>
          <p className="text-xs text-gray-400 mt-0.5">Identifies categories that departed from last year's transition pattern (deviation &gt; 10pp).</p>
        </div>
        {transitionPatterns.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">Not enough consecutive monthly data from multiple years to calculate MoM transition patterns.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {transitionPatterns.map((trans, idx) => {
              const offPattern = trans.categories.filter(c => c.status === 'off_pattern');
              const onPattern  = trans.categories.filter(c => c.status === 'on_pattern');

              return (
                <div key={idx} className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">
                      🔄 Transition: {trans.transition_label} <span className="text-gray-400 font-normal ml-1">compared to prior year's {trans.prior_transition_label}</span>
                    </h4>
                  </div>

                  {offPattern.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {offPattern.map(c => {
                        const isHigh = c.deviation > 0;
                        return (
                          <div key={c.category} className="bg-rose-50/60 border border-rose-100 rounded-xl p-4 space-y-2 flex flex-col justify-between">
                            <div className="flex items-start justify-between">
                              <span className="text-xs font-bold text-rose-900 uppercase">⚠️ Pattern Deviation</span>
                              <span className="text-[10px] bg-rose-200 text-rose-800 font-bold px-2 py-0.5 rounded-full uppercase">Off Pattern</span>
                            </div>
                            <div>
                              <h5 className="text-sm font-bold text-rose-950">{c.category}</h5>
                              <p className="text-xs text-rose-900/80 mt-1">
                                Search volume transitioned by <strong className="text-rose-950 font-bold">{c.this_year_delta >= 0 ? '+' : ''}{c.this_year_delta}%</strong> this year.
                                Last year, the same transition was <strong className="text-rose-950/70 font-semibold">{c.last_year_delta >= 0 ? '+' : ''}{c.last_year_delta}%</strong>.
                              </p>
                            </div>
                            <div className="pt-2 border-t border-rose-200/50 flex justify-between items-center text-xs">
                              <span className="text-rose-900/70 font-medium">Deviation:</span>
                              <span className="font-bold text-rose-700 bg-rose-100/50 px-2 py-0.5 rounded">
                                {c.deviation >= 0 ? '+' : ''}{c.deviation}pp {isHigh ? 'Stronger' : 'Weaker'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-emerald-50/30 border border-emerald-100 text-emerald-800 rounded-xl p-4 text-xs font-medium flex items-center gap-2">
                      <span>✓</span> All category transitions in this period aligned with last year's patterns (within 10pp).
                    </div>
                  )}

                  {onPattern.length > 0 && (
                    <details className="border border-gray-100 rounded-lg overflow-hidden">
                      <summary className="text-[10px] font-bold text-gray-400 bg-slate-50/50 px-3 py-2 cursor-pointer hover:bg-slate-50 transition">
                        👁 {onPattern.length} categories on pattern (expand to view)
                      </summary>
                      <div className="p-3 divide-y divide-gray-50 bg-white">
                        {onPattern.map(c => (
                          <div key={c.category} className="flex justify-between items-center py-2 text-xs">
                            <span className="font-semibold text-slate-700">{c.category}</span>
                            <div className="flex gap-4 font-medium text-slate-500">
                              <span>This year: <strong>{c.this_year_delta >= 0 ? '+' : ''}{c.this_year_delta}%</strong></span>
                              <span>Prior year: <strong>{c.last_year_delta >= 0 ? '+' : ''}{c.last_year_delta}%</strong></span>
                              <span className="text-gray-400 font-normal">({c.deviation >= 0 ? '+' : ''}{c.deviation}pp diff)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SeasonalityModule() {
  const [indexData, setIndexData]   = useState(null);
  const [yoyData,    setYoyData]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('index');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/category-index').then(r => r.json()),
      fetch('/yoy-comparison').then(r => r.json()),
    ]).then(([idx, yoy]) => {
      setIndexData(idx);
      setYoyData(yoy);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!indexData?.months?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-2xl mb-3">📅</p>
        <p className="text-sm font-medium text-gray-600">No monthly seasonality data uploaded yet</p>
        <p className="text-xs text-gray-400 mt-1">Please visit the <a href="/admin" className="text-indigo-600 hover:text-indigo-800 font-semibold underline">Admin page</a> to upload monthly search CSV files first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">📅 Category Seasonality Index</h2>
          <p className="text-xs text-gray-500 mt-0.5">Explore monthly search volume indexes and year-over-year deviation flags.</p>
        </div>
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button onClick={() => setActiveTab('index')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${activeTab === 'index' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            🌡 Seasonality Index Heatmap
          </button>
          <button onClick={() => setActiveTab('yoy')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${activeTab === 'yoy' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            🔄 YoY & Transition Patterns
          </button>
        </div>
      </div>

      {activeTab === 'index' && (
        <CategoryIndexView months={indexData.months} categories={indexData.categories} monthlyLeaders={indexData.monthly_leaders} />
      )}
      {activeTab === 'yoy' && (
        <YoyPatternView sameMonthYoy={yoyData?.same_month_yoy || []} transitionPatterns={yoyData?.transition_patterns || []} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'home',   label: '🏠 Overview' },
  { id: 'layer1', label: '🔍 Layer 1: Demand' },
  { id: 'layer2', label: '📂 Layer 2: Categories' },
  { id: 'layer3', label: '🔻 Layer 3: Funnel' },
  { id: 'layer4', label: '📈 Layer 4: Trends' },
  { id: 'platform', label: '📱 App vs Web' },
  { id: 'trends', label: '📊 Weekly Trends' },
  { id: 'insights', label: '✨ AI Insights' },
  { id: 'seasonality', label: '📅 Seasonality' },
];

function App() {
  const [result, setResult] = useState(() => {
    try {
      const saved = localStorage.getItem('search_intel_result');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [tab, setTab]       = useState('home');

  const handleSetResult = (res) => {
    try {
      if (res) localStorage.setItem('search_intel_result', JSON.stringify(res));
      else localStorage.removeItem('search_intel_result');
    } catch (e) {}
    setResult(res);
  };

  if (!result || !result.summary) return <UploadScreen onResult={handleSetResult} />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-56 bg-slate-900 text-white flex flex-col shadow-2xl z-20 flex-shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-slate-800">
          <span className="font-bold text-sm tracking-widest">SEARCH<span className="text-indigo-400">INTEL</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(n => {
            const isPlatform = n.id === 'platform';
            const disabled = isPlatform && !result.platform;
            return (
              <button key={n.id} disabled={disabled} onClick={() => !disabled && setTab(n.id)}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${disabled ? 'text-slate-600 cursor-not-allowed' : tab===n.id?'bg-indigo-600 text-white':'text-slate-300 hover:bg-slate-800'}`}>
                {n.label}
                {disabled && (
                  <span className="text-slate-600 ml-1 text-xs">(no data)</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500">
          <p>{fmt(result.current_terms_processed)} terms · current</p>
          {result.previous_terms_processed > 0 && <p>{fmt(result.previous_terms_processed)} terms · prev</p>}
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
          <span className="text-sm font-semibold text-gray-600">{NAV.find(n=>n.id===tab)?.label}</span>
          <button onClick={()=>handleSetResult(null)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">← New Analysis</button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {tab==='home'   && <DashboardHome summary={result.summary} layer1={result.layer1} />}
          {tab==='layer1' && <Layer1 layer1={result.layer1} />}
          {tab==='layer2' && <Layer2 layer2={result.layer2} />}
          {tab==='layer3' && <Layer3 layer3={result.layer3} />}
          {tab==='layer4' && <Layer4 trendsInputs={result.trends_inputs} />}
          {tab === 'platform' && result.platform && !result.platform.error && <PlatformModule data={result.platform} />}
          {tab === 'platform' && result.platform?.error && (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              Could not process the platform file: {result.platform.error}
            </div>
          )}
          {tab==='trends' && <TrendsModule />}
          {tab==='insights' && <InsightsModule result={result} />}
          {tab==='seasonality' && <SeasonalityModule />}
        </main>
      </div>
    </div>
  );
}

function shareIndexColor(idx) {
  const diff    = idx - 100;
  const clamped = Math.max(-80, Math.min(80, diff));
  if (clamped >= 0) {
    const t = clamped / 80;
    return `rgb(255,${Math.round(255-t*140)},${Math.round(255-t*220)})`;
  }
  const t = Math.abs(clamped) / 80;
  return `rgb(${Math.round(255-t*200)},${Math.round(255-t*140)},255)`;
}

function PlatformTermTable({ rows, showShift }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-4 text-center">
        No terms matched
      </p>
    );
  }
  return (
    <table className="w-full text-xs" style={{tableLayout:'fixed'}}>
      <thead>
        <tr className="text-gray-400 border-b border-gray-200">
          <th className="text-left py-2 px-2">Term</th>
          <th className="text-right py-2 px-2">Web</th>
          <th className="text-right py-2 px-2">Android</th>
          <th className="text-right py-2 px-2">iOS</th>
          <th className="text-right py-2 px-2">App share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.term}
              className="border-b border-gray-100 last:border-0">
            <td className="py-2 px-2">
              <span className="font-medium text-gray-700">
                {r.term}
              </span>
              <span className="text-gray-400 text-xs block">
                {r.category}
              </span>
            </td>
            <td className="text-right py-2 px-2 text-gray-600">
              {r.web_searches.toLocaleString()}
            </td>
            <td className="text-right py-2 px-2 text-gray-600">
              {r.android_searches.toLocaleString()}
            </td>
            <td className="text-right py-2 px-2 text-gray-600">
              {r.ios_searches.toLocaleString()}
            </td>
            <td className="text-right py-2 px-2 font-semibold
                           text-gray-700">
              {r.app_share_pct != null ? r.app_share_pct + '%' : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScorecardTile({ label, value, sub, tone }) {
  const toneClass = {
    neutral: 'bg-gray-50 text-gray-700',
    good:    'bg-emerald-50 text-emerald-700',
    bad:     'bg-rose-50 text-rose-700',
  }[tone || 'neutral'];
  return (
    <div className={`rounded-lg p-4 ${toneClass}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-1">{sub}</p>}
    </div>
  );
}

function PartAView({ a }) {
  return (
    <div className="space-y-6">

      <div className="grid grid-cols-2 gap-3">
        <ScorecardTile
          label="App share of searches"
          value={a.avg_app_share_pct + '%'}
          tone="neutral"
        />
        <ScorecardTile
          label="Android share of App"
          value={a.avg_android_share_of_app_pct + '%'}
          tone="neutral"
        />
      </div>


      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          App-dominant terms
        </h3>
        <PlatformTermTable rows={a.app_dominant_terms}
                            showShift={true} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Web-dominant terms
        </h3>
        <PlatformTermTable rows={a.web_dominant_terms}
                            showShift={true} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Android / iOS imbalance outliers
        </h3>
        <p className="text-xs text-gray-400 mb-2">
          Terms where the OS split deviates most from the site
          average Android share of {a.avg_android_share_of_app_pct}%
        </p>
        <PlatformTermTable rows={a.os_imbalance_outliers}
                            showShift={false} />
      </div>

    </div>
  );
}

function PartBSection({ title, subtitle, rows }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-semibold text-gray-700">
          {title}
        </h3>
        <span className="text-xs bg-rose-50 text-rose-600
                         px-2 py-0.5 rounded-full font-semibold">
          {rows.length}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{subtitle}</p>
      <PlatformTermTable rows={rows} showShift={false} />
    </div>
  );
}

function PartBView({ b }) {
  return (
    <div>
      <PartBSection
        title="Zero-conversion terms, App-skewed"
        subtitle="High-traffic terms with zero orders (from 3.8) cross-referenced against platform split"
        rows={b.zero_conv_app_skewed}
      />
      <PartBSection
        title="Long-tail zero-cart terms, App-skewed"
        subtitle="Specific-intent terms with zero add-to-cart (from 1.5) cross-referenced against platform split"
        rows={b.zero_cart_app_skewed}
      />
      <PartBSection
        title="Breakout terms — platform origin"
        subtitle="This week's breakout terms (from 1.13), showing where the growth is actually coming from"
        rows={b.breakout_app_origin}
      />
      <PartBSection
        title="Degrading terms — App concentration"
        subtitle="Terms with declining visit rate WoW (from 3.11), showing platform concentration of the decline"
        rows={b.degraders_app_concentration}
      />
    </div>
  );
}

function PartCView({ c }) {
  const s = c.scorecard;
  return (
    <div className="space-y-6">

      <div className="grid grid-cols-2 gap-3">
        <ScorecardTile
          label="App share of demand"
          value={s.app_share_pct + '%'}
          tone="neutral"
        />
        <ScorecardTile
          label="Flagged App-skewed terms"
          value={s.flagged_terms_count}
          tone={s.flagged_terms_count > 10 ? 'bad' : 'neutral'}
        />
      </div>



      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Category App-share rollup
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-200">
              <th className="text-left py-2">Category</th>
              <th className="text-right py-2">App share</th>
              <th className="text-right py-2">E2E conv</th>
            </tr>
          </thead>
          <tbody>
            {c.category_rollup.map(r => (
              <tr key={r.category}
                  className="border-b border-gray-100 last:border-0">
                <td className="py-2 font-medium text-gray-700">
                  {r.category}
                </td>
                <td className="text-right py-2">
                  {r.app_share_pct}%
                </td>
                <td className="text-right py-2 text-gray-500">
                  {r.e2e_conv_pct != null ? r.e2e_conv_pct + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Occasion cluster App-share rollup
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-200">
              <th className="text-left py-2">Cluster</th>
              <th className="text-right py-2">App share</th>
              <th className="text-right py-2">Matched terms</th>
            </tr>
          </thead>
          <tbody>
            {c.occasion_rollup.map(r => (
              <tr key={r.cluster}
                  className="border-b border-gray-100 last:border-0">
                <td className="py-2 font-medium text-gray-700">
                  {r.cluster}
                </td>
                <td className="text-right py-2">
                  {r.app_share_pct}%
                </td>
                <td className="text-right py-2 text-gray-500">
                  {r.matched_terms}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function PlatformModule({ data }) {
  const [section, setSection] = useState('a');
  // 'a' | 'b' | 'c'
  const a = data.part_a;
  const b = data.part_b;
  const c = data.part_c;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">

      <div className="flex gap-0 mb-6 border border-gray-200
                      rounded-lg overflow-hidden w-fit text-xs">
        {[
          { id:'a', label:'What\'s happening' },
          { id:'b', label:'Where to focus' },
          { id:'c', label:'Verdict' },
        ].map(t => (
          <button key={t.id} onClick={() => setSection(t.id)}
            className={`px-4 py-2 font-medium border-r
              border-gray-200 last:border-0
              ${section===t.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-indigo-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {section === 'a' && <PartAView a={a} />}
      {section === 'b' && <PartBView b={b} />}
      {section === 'c' && <PartCView c={c} />}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);


