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

function HBarChart({ labels, data, colors, height = 280, onClickIndex, tooltipSuffix = '' }) {
  const ref = useRef(null);
  const bg = colors || '#4f46e5';
  useChart(ref, () => ({
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 4, barThickness: 14 }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + (typeof ctx.parsed.x === 'number' ? ctx.parsed.x.toLocaleString() : ctx.parsed.x) + tooltipSuffix } } },
      scales: { x: { grid: { color: '#f3f4f6' } }, y: { ticks: { font: { size: 11 } } } },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index); }
    }
  }), [JSON.stringify(labels), JSON.stringify(data)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function VBarChart({ labels, data, colors, height = 240, tooltipSuffix = '' }) {
  const ref = useRef(null);
  const bg = colors || labels.map(() => '#4f46e5');
  useChart(ref, () => ({
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y.toFixed(2) + tooltipSuffix } } },
      scales: { x: { ticks: { maxRotation: 40, font: { size: 11 } } }, y: { grid: { color: '#f3f4f6' } } }
    }
  }), [JSON.stringify(labels), JSON.stringify(data)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function StackedBarChart({ categories, series, height = 260 }) {
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
      scales: { x: { stacked: true, grid: { color: '#f3f4f6' } }, y: { stacked: true, ticks: { font: { size: 11 } } } }
    }
  }), [JSON.stringify(categories), JSON.stringify(series)]);
  return <div style={{ height }}><canvas ref={ref} /></div>;
}

function DoughnutChart({ labels, data, colors, height = 260, onClickIndex }) {
  const ref = useRef(null);
  const bg = colors || labels.map((_, i) => `hsl(${i * 37}, 70%, 58%)`);
  useChart(ref, () => ({
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'right', labels: { font: { size: 11 }, padding: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` } } },
      onClick: (_, els) => { if (els.length && onClickIndex) onClickIndex(els[0].index); }
    }
  }), [JSON.stringify(labels), JSON.stringify(data)]);
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ title, value, growth, sub }) {
  const up = growth > 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
      {growth !== undefined && <span className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{up ? '▲' : '▼'} {Math.abs(growth).toFixed(1)}% MoM</span>}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Drill-Down Modal ─────────────────────────────────────────────────────────
function DrillModal({ title, terms, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl font-bold">×</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr><th className="px-4 py-2 text-left text-gray-500">#</th><th className="px-4 py-2 text-left text-gray-500">Term</th><th className="px-4 py-2 text-right text-gray-500">Searches</th><th className="px-4 py-2 text-right text-gray-500">A2C</th><th className="px-4 py-2 text-right text-gray-500">Orders</th></tr>
            </thead>
            <tbody>
              {(terms || []).map((t, i) => (
                <tr key={i} className="border-t hover:bg-indigo-50 transition-colors">
                  <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{t.term_norm}</td>
                  <td className="px-4 py-2 text-right">{fmt(t.searches)}</td>
                  <td className="px-4 py-2 text-right">{fmt(t.a2c_count)}</td>
                  <td className="px-4 py-2 text-right">{fmt(t.orders)}</td>
                </tr>
              ))}
              {(terms || []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No term data available</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t text-xs text-gray-400">{(terms || []).length} terms · Click outside to close</div>
      </div>
    </div>
  );
}

// ─── Data Table ───────────────────────────────────────────────────────────────
function DataTable({ cols, rows, maxH = 340 }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-gray-400 py-6 text-center">No data</p>;
  return (
    <div className="overflow-auto rounded border border-gray-100" style={{ maxHeight: maxH }}>
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-50">
          <tr>{cols.map(c => <th key={c.key} className={`px-3 py-2 font-semibold text-gray-500 ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
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
  const [activeSection, setActiveSection] = useState('2.1');
  const [drill, setDrill] = useState(null);

  const sections = [
    { id: '2.1',  label: '2.1 Term Variations', both: false },
    { id: '2.2',  label: '2.2 Conv Benchmark',  both: false },
    { id: '2.3',  label: '2.3 Revenue Share',   both: false },
    { id: '2.4',  label: '2.4 A2C vs Search',   both: false },
    { id: '2.5',  label: '2.5 Long-Tail Depth', both: false },
    { id: '2.6',  label: '2.6 Rev Efficiency',  both: false },
    { id: '2.7',  label: "2.7 Men's Intent",    both: false },
    { id: '2.8',  label: '2.8 Gemstone Intent', both: false },
    { id: '2.9',  label: '2.9 Breakout Index',  both: true  },
    { id: '2.10', label: '2.10 Share Shift',     both: true  },
    { id: '2.11', label: '2.11 New Terms/Cat',   both: true  },
    { id: '2.12', label: '2.12 LT Expansion',    both: true  },
  ];

  const hasBoth = !!(layer2?.['2.9']?.categories?.length);

  const d21 = layer2?.['2.1'] || {};
  const d22 = layer2?.['2.2'] || {};
  const d23 = layer2?.['2.3'] || {};
  const d24 = layer2?.['2.4'] || {};
  const d25 = layer2?.['2.5'] || {};
  const d26 = layer2?.['2.6'] || {};
  const d27 = layer2?.['2.7'] || {};
  const d28 = layer2?.['2.8'] || {};
  const d29 = layer2?.['2.9'] || {};
  const d210= layer2?.['2.10']|| {};
  const d211= layer2?.['2.11']|| {};
  const d212= layer2?.['2.12']|| {};

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

        {/* 2.1 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.1' && (
          <Card title="2.1 · Unique Search Term Variations Per Category" badge="Click row → drill terms" insight={d21.insight}>
            <HBarChart
              labels={(d21.table||[]).map(d=>d.category)}
              data={(d21.table||[]).map(d=>d.unique_terms)}
              height={280}
              onClickIndex={i => { const row = (d21.table||[])[i]; if (row) setDrill({ title: row.category + ' — Terms', terms: row.terms || [] }); }}
            />
            <DataTable maxH={300} cols={[
              { key:'category', label:'Category' },
              { key:'unique_terms', label:'Unique Terms', right:true, render:v=>fmt(v) },
              { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
              { key:'searches_per_term', label:'Searches/Term', right:true, render:v=>fmtN(v) },
              { key:'a2c_count', label:'A2C', right:true, render:v=>fmt(v) },
            ]} rows={(d21.table||[]).map(r => ({...r, _onClick: ()=>setDrill({ title: r.category+' — Terms', terms: r.terms||[] })}))} />
          </Card>
        )}

        {/* 2.2 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.2' && (
          <Card title="2.2 · Category Conversion Rate Benchmark" badge="Green >1% · Orange 0.1–1% · Red <0.1%" insight={d22.insight}>
            <HBarChart
              labels={(d22.table||[]).map(d=>d.category)}
              data={(d22.table||[]).map(d=>d.conversion_rate||0)}
              colors={(d22.table||[]).map(d => d.conversion_rate > 1 ? '#10b981' : d.conversion_rate > 0.1 ? '#f59e0b' : '#f43f5e')}
              tooltipSuffix="%"
              height={280}
              onClickIndex={i => { const row=(d22.table||[])[i]; if(row) setDrill({title: row.category+' — Terms', terms: row.terms||[]}); }}
            />
            <DataTable maxH={280} cols={[
              { key:'category', label:'Category' },
              { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
              { key:'orders', label:'Orders', right:true, render:v=>fmt(v) },
              { key:'conversion_rate', label:'Conv %', right:true, render:v=><ConvBadge v={v} /> },
              { key:'revenue', label:'Revenue', right:true, render:v=>fmtCur(v) },
            ]} rows={(d22.table||[]).map(r => ({...r, _onClick:()=>setDrill({title:r.category+' — Terms',terms:r.terms||[]})}))} />
          </Card>
        )}

        {/* 2.3 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.3' && (
          <Card title="2.3 · Category Revenue Share" badge="Click segment to drill" insight={d23.insight}>
            <DoughnutChart
              labels={(d23.table||[]).map(d=>d.category)}
              data={(d23.table||[]).map(d=>d.revenue_share||0)}
              onClickIndex={i => { const row=(d23.table||[])[i]; if(row) setDrill({title:row.category+' — Terms', terms:row.terms||[]}); }}
            />
            <DataTable maxH={280} cols={[
              { key:'category', label:'Category' },
              { key:'revenue', label:'Revenue', right:true, render:v=>fmtCur(v) },
              { key:'revenue_share', label:'Rev Share', right:true, render:v=>fmtN(v)+'%' },
              { key:'search_share', label:'Search Share', right:true, render:v=>fmtN(v)+'%' },
              { key:'density', label:'Rev Density', right:true, render:v=>fmtN(v,2)+'x' },
            ]} rows={(d23.table||[]).map(r => ({...r, _onClick:()=>setDrill({title:r.category+' — Terms',terms:r.terms||[]})}))} />
          </Card>
        )}

        {/* 2.4 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.4' && (
          <Card title="2.4 · A2C Share vs. Search Share" badge="Above diagonal = over-converting" insight={d24.insight}>
            <ScatterParity points={d24.points||[]} height={320} />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'search_share', label:'Search Share %', right:true, render:v=>fmtN(v)+'%' },
              { key:'a2c_share', label:'A2C Share %', right:true, render:v=>fmtN(v)+'%' },
              { key:'over_index', label:'Status', render:v=>v
                ? <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded font-semibold">Over-indexing ↑</span>
                : <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded font-semibold">Under-indexing ↓</span>
              },
            ]} rows={d24.points||[]} />
          </Card>
        )}

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
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'hd_searches', label:'Head Searches', right:true, render:v=>fmt(v) },
              { key:'lt_searches', label:'Long-Tail Searches', right:true, render:v=>fmt(v) },
              { key:'lt_pct', label:'Long-Tail %', right:true, render:v=>fmtN(v)+'%' },
            ]} rows={d25.table||[]} />
          </Card>
        )}

        {/* 2.6 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.6' && (
          <Card title="2.6 · Category Intent-to-Revenue Efficiency (Searches per $1)" badge="Lower = more efficient" insight={d26.insight}>
            <HBarChart
              labels={(d26.table||[]).map(d=>d.category)}
              data={(d26.table||[]).map(d=>d.searches_per_dollar||0)}
              height={260}
              tooltipSuffix=" searches/$1"
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
              { key:'revenue', label:'Revenue', right:true, render:v=>fmtCur(v) },
              { key:'searches_per_dollar', label:'Searches / $1', right:true, render:v=>fmtN(v,1) },
            ]} rows={d26.table||[]} />
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

        {/* 2.8 ─────────────────────────────────────────────────────────────── */}
        {activeSection === '2.8' && (
          <Card title="2.8 · Gemstone Intent Analysis" badge="Click row to drill" insight={d28.insight}>
            <DataTable maxH={320} cols={[
              { key:'gemstone', label:'Gemstone', render:v=><span className="capitalize font-semibold">{v}</span> },
              { key:'term_count', label:'Terms', right:true },
              { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
              { key:'a2c_count', label:'A2C', right:true, render:v=>fmt(v) },
              { key:'orders', label:'Orders', right:true, render:v=>fmt(v) },
              { key:'a2c_rate', label:'A2C Rate', right:true, render:v=>fmtN(v,2)+'%' },
            ]} rows={(d28.gems||[]).map(r => ({...r, _onClick:()=>setDrill({title: r.gemstone+' — Terms', terms: r.terms||[]})}))} />
          </Card>
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

        {/* 2.11 ────────────────────────────────────────────────────────────── */}
        {activeSection === '2.11' && (
          <Card title="2.11 · New Search Terms Per Category" badge="Click bar to see terms" insight={d211.insight} insightType="success">
            <HBarChart
              labels={(d211.by_category||[]).map(d=>d.category)}
              data={(d211.by_category||[]).map(d=>d.new_terms||0)}
              height={260}
              onClickIndex={i => { const row=(d211.by_category||[])[i]; if(row) setDrill({title:row.category+' New Terms', terms:(row.terms||[]).map(t=>({term_norm:t.term_norm, searches:t.searches, a2c_count:0, orders:0}))}); }}
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'new_terms', label:'New Terms', right:true, render:v=>fmt(v) },
              { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
            ]} rows={(d211.by_category||[]).map(r=>({...r, _onClick:()=>setDrill({title:r.category+' New Terms', terms:(r.terms||[]).map(t=>({term_norm:t.term_norm, searches:t.searches, a2c_count:0, orders:0}))})})) } />
          </Card>
        )}

        {/* 2.12 ────────────────────────────────────────────────────────────── */}
        {activeSection === '2.12' && (
          <Card title="2.12 · Long-Tail Expansion by Category (Δ pp MoM)" insight={d212.insight} insightType="info">
            <VBarChart
              labels={(d212.chart||[]).map(d=>d.category)}
              data={(d212.chart||[]).map(d=>d.delta||0)}
              colors={(d212.chart||[]).map(d=>(d.delta||0)>=0?'#8b5cf6':'#fb923c')}
              tooltipSuffix="pp"
              height={260}
            />
            <DataTable maxH={240} cols={[
              { key:'category', label:'Category' },
              { key:'lt_pct_prev', label:'Prev LT %', right:true, render:v=>fmtN(v)+'%' },
              { key:'lt_pct_curr', label:'Curr LT %', right:true, render:v=>fmtN(v)+'%' },
              { key:'delta', label:'Δ pp', right:true, render:v=><GrowthPill v={v}/> },
            ]} rows={d212.chart||[]} />
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
function HBarChart2(props) { return <HBarChart {...props} />; } // alias

function Layer1({ layer1 }) {
  const [drill, setDrill] = useState(null);
  const [activeSection, setActiveSection] = useState('1.1');

  const sections = [
    { id: '1.1',  label: '1.1 Top 50 Terms', both: false },
    { id: '1.2',  label: '1.2 Volume Conc.', both: false },
    { id: '1.3',  label: '1.3 Cat Rollup',   both: false },
    { id: '1.4',  label: '1.4 Cat Share',     both: false },
    { id: '1.5',  label: '1.5 Long-Tail',     both: false },
    { id: '1.6',  label: '1.6 Occasions',     both: false },
    { id: '1.7',  label: '1.7 Variants',      both: false },
    { id: '1.8',  label: '1.8 MoM Change',    both: true  },
    { id: '1.9',  label: '1.9 Rising',        both: true  },
    { id: '1.10', label: '1.10 Falling',       both: true  },
    { id: '1.11', label: '1.11 New Terms',     both: true  },
    { id: '1.12', label: '1.12 Vanishing',     both: true  },
    { id: '1.13', label: '1.13 Breakouts',     both: true  },
    { id: '1.14', label: '1.14 Share Shift',   both: true  },
  ];

  const d11  = layer1?.['1.1'] || [];
  const d12  = layer1?.['1.2'] || {};
  const d13  = layer1?.['1.3'] || {};
  const d14  = layer1?.['1.4'] || {};
  const d15  = layer1?.['1.5'] || {};
  const d16  = layer1?.['1.6'] || {};
  const d17  = layer1?.['1.7'] || {};
  const d18  = layer1?.['1.8'] || {};
  const d19  = layer1?.['1.9'] || {};
  const d110 = layer1?.['1.10'] || {};
  const d111 = layer1?.['1.11'] || {};
  const d112 = layer1?.['1.12'] || {};
  const d113 = layer1?.['1.13'] || {};
  const d114 = layer1?.['1.14'] || {};
  const hasBoth = d18?.gainers?.length > 0;

  const termCols = [
    { key:'term_norm', label:'Term' },
    { key:'searches', label:'Searches', right:true, render:v=>fmt(v) },
    { key:'a2c_count', label:'A2C', right:true, render:v=>fmt(v) },
    { key:'orders', label:'Orders', right:true, render:v=>fmt(v) },
    { key:'category', label:'Category' },
  ];

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
          <Card title="1.1 · Top 50 Terms by Search Volume" badge="Click bar to drill" insight="The top 10 terms are your highest-intent queries. Prioritise catalog depth and relevance here first.">
            <HBarChart labels={d11.slice(0,20).map(d=>d.term_norm)} data={d11.slice(0,20).map(d=>d.searches)} color="#4f46e5" height={360} onClickIndex={i=>setDrill({title:d11[i]?.term_norm,terms:[d11[i]]})} />
            <DataTable maxH={280} cols={termCols} rows={d11.map(r=>({...r,_onClick:()=>setDrill({title:r.term_norm, terms:[r]})}))} />
          </Card>
        )}
        {activeSection === '1.2' && (
          <Card title="1.2 · Search Volume Concentration" badge="Click donut segment" insight={d12.insight}>
            <DoughnutChart labels={(d12.chart||[]).map(d=>d.name)} data={(d12.chart||[]).map(d=>d.value)} colors={['#4f46e5','#7c3aed','#a855f7','#e879f9']} onClickIndex={i=>{const seg=(d12.chart||[])[i];if(seg)setDrill({title:seg.name+' — Terms',terms:seg.terms||[]});}} />
          </Card>
        )}
        {activeSection === '1.3' && (
          <Card title="1.3 · Category-Level Search Volume Rollup" insight={d13.insight}>
            <HBarChart labels={(d13.chart||[]).map(d=>d.category)} data={(d13.chart||[]).map(d=>d.searches)} color="#6366f1" height={280} onClickIndex={i=>{const row=(d13.chart||[])[i];if(row)setDrill({title:row.category+' — Terms',terms:[]});}} />
            <DataTable cols={[{key:'category',label:'Category'},{key:'searches',label:'Searches',right:true,render:v=>fmt(v)},{key:'search_share',label:'Share',right:true,render:v=>fmtN(v)+'%'},{key:'revenue',label:'Revenue',right:true,render:v=>fmtCur(v)}]} rows={d13.chart||[]} />
          </Card>
        )}
        {activeSection === '1.4' && (
          <>
            <Card title="1.4 · Category Search Share" badge="Click donut segment">
              <DoughnutChart labels={(d14.chart||[]).map(d=>d.category)} data={(d14.chart||[]).map(d=>d.searches)} onClickIndex={i=>{const row=(d14.chart||[])[i];if(row)setDrill({title:row.category+' — Terms',terms:[]});}} />
            </Card>
            {(d14.flags||[]).length > 0 && <Card title="Flagged Categories"><ul className="space-y-2">{d14.flags.map((f,i)=><li key={i} className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠️ {f}</li>)}</ul></Card>}
          </>
        )}
        {activeSection === '1.5' && (
          <Card title="1.5 · Long-Tail Query Identification" insight={d15.insight}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[{label:'Long-tail Terms',value:fmt(d15.term_count)},{label:'% of Unique Terms',value:fmtN(d15.pct_of_unique_terms)+'%'},{label:'% of Searches',value:fmtN(d15.pct_of_searches)+'%'},{label:'Avg Conversion',value:fmtN(d15.avg_conversion,3)+'%'}].map((k,i)=>(
                <div key={i} className="bg-indigo-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-indigo-700">{k.value}</p><p className="text-xs text-indigo-500 mt-1">{k.label}</p></div>
              ))}
            </div>
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'searches',label:'Searches',right:true,render:v=>fmt(v)},{key:'a2c_count',label:'A2C',right:true,render:v=>fmt(v)},{key:'orders',label:'Orders',right:true,render:v=>fmt(v)}]} rows={d15.top_terms||[]} />
          </Card>
        )}
        {activeSection === '1.6' && (
          <Card title="1.6 · Occasion / Intent-Linked Terms" insight={d16.insight}>
            <div className="space-y-4">
              {(d16.clusters||[]).map((cluster,i)=>(
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer hover:bg-indigo-50" onClick={()=>setDrill({title:cluster.occasion+' — Terms',terms:cluster.terms||[]})}>
                    <span className="font-semibold text-sm text-gray-800">{cluster.occasion}</span>
                    <div className="flex gap-4 text-xs text-gray-500"><span>🔍 {fmt(cluster.searches)}</span><span>🛒 {fmt(cluster.a2c_count)}</span><span>✅ {fmt(cluster.orders)}</span><span className="text-indigo-600 text-xs">drill →</span></div>
                  </div>
                  <div className="px-4 py-2 flex flex-wrap gap-2">{(cluster.terms||[]).map((t,j)=><span key={j} className="bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-full">{t.term_norm} ({fmt(t.searches)})</span>)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {activeSection === '1.7' && (
          <Card title="1.7 · Spelling Variant Clusters" insight={d17.insight}>
            <DataTable cols={[{key:'top_variant',label:'Top Variant'},{key:'variant_count',label:'# Variants',right:true},{key:'top_variant_searches',label:'Top Searches',right:true,render:v=>fmt(v)},{key:'combined_searches',label:'Combined',right:true,render:v=>fmt(v)},{key:'variants',label:'All Variants',render:v=><span className="text-gray-500 text-xs">{(v||[]).join(', ')}</span>}]} rows={d17.clusters||[]} />
          </Card>
        )}
        {activeSection === '1.8' && (
          <>
            <Card title="1.8 · Top 15 Gainers (MoM %)" badge="Both periods" insight={d18.insight}>
              <VBarChart labels={(d18.gainers||[]).map(d=>d.term_norm)} data={(d18.gainers||[]).map(d=>parseFloat(d.growth.toFixed(1)))} colors={(d18.gainers||[]).map(()=>'#10b981')} tooltipSuffix="%" height={220} />
            </Card>
            <Card title="1.8 · Top 15 Losers (MoM %)">
              <VBarChart labels={(d18.losers||[]).map(d=>d.term_norm)} data={(d18.losers||[]).map(d=>parseFloat(Math.abs(d.growth).toFixed(1)))} colors={(d18.losers||[]).map(()=>'#f43f5e')} tooltipSuffix="%" height={220} />
            </Card>
          </>
        )}
        {activeSection === '1.9' && (
          <Card title="1.9 · Rising Terms (>20% MoM, ≥200 searches)" insight={d19.insight} insightType="success">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'prev_searches',label:'Prev',right:true,render:v=>fmt(v)},{key:'searches',label:'Current',right:true,render:v=>fmt(v)},{key:'growth',label:'Growth',right:true,render:v=><GrowthPill v={v}/>},{key:'a2c_count',label:'A2C',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d19.terms||[]} />
          </Card>
        )}
        {activeSection === '1.10' && (
          <Card title="1.10 · Falling Terms (<-20% MoM)" insight={d110.insight} insightType="danger">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'prev_searches',label:'Prev',right:true,render:v=>fmt(v)},{key:'searches',label:'Current',right:true,render:v=>fmt(v)},{key:'growth',label:'Decline',right:true,render:v=><GrowthPill v={v}/>},{key:'orders',label:'Orders',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d110.terms||[]} />
          </Card>
        )}
        {activeSection === '1.11' && (
          <Card title="1.11 · New Term Appearances" badge="Not in prev period" insight={d111.insight} insightType="success">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'searches',label:'Searches',right:true,render:v=>fmt(v)},{key:'a2c_count',label:'A2C',right:true,render:v=>fmt(v)},{key:'orders',label:'Orders',right:true,render:v=>fmt(v)},{key:'category',label:'Category'}]} rows={d111.terms||[]} />
          </Card>
        )}
        {activeSection === '1.12' && (
          <Card title="1.12 · Vanishing Terms (had revenue, now gone)" insight={d112.insight} insightType="danger">
            <DataTable cols={[{key:'term_norm',label:'Term'},{key:'prev_searches',label:'Prev Searches',right:true,render:v=>fmt(v)},{key:'searches',label:'Current',right:true,render:v=>fmt(v)},{key:'orders',label:'Prev Orders',right:true,render:v=>fmt(v)}]} rows={d112.terms||[]} />
          </Card>
        )}
        {activeSection === '1.13' && (
          <Card title="1.13 · Breakout Detection (>100% MoM)" insight={d113.insight} insightType="success">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(d113.terms||[]).map((t,i)=>(
                <div key={i} className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">{t.term_norm}</span>
                    <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">+{t.growth.toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.category} · {fmt(t.searches)} searches · {fmt(t.a2c_count)} A2C</p>
                </div>
              ))}
              {(d113.terms||[]).length === 0 && <p className="text-sm text-gray-400 col-span-2 py-6 text-center">No breakout terms (requires both periods)</p>}
            </div>
          </Card>
        )}
        {activeSection === '1.14' && (
          <Card title="1.14 · Category Share Shift (pp MoM)" insight={d114.insight}>
            <VBarChart labels={(d114.chart||[]).map(d=>d.category)} data={(d114.chart||[]).map(d=>parseFloat((d.delta||0).toFixed(2)))} colors={(d114.chart||[]).map(d=>(d.delta||0)>=0?'#10b981':'#f43f5e')} tooltipSuffix="pp" height={260} />
            <DataTable cols={[{key:'category',label:'Category'},{key:'prev_share',label:'Prev Share',right:true,render:v=>fmtN(v)+'%'},{key:'curr_share',label:'Curr Share',right:true,render:v=>fmtN(v)+'%'},{key:'delta',label:'Δ pp',right:true,render:v=><GrowthPill v={v}/>}]} rows={d114.chart||[]} />
          </Card>
        )}
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
    { id: '3.2',  label: '3.2 Visit↔A2C',       both: false },
    { id: '3.3',  label: '3.3 A2C→Purchase',    both: false },
    { id: '3.4',  label: '3.4 E2E Conv',         both: false },
    { id: '3.5',  label: '3.5 Cat Funnel',       both: false },
    { id: '3.6',  label: '3.6 0-Order/High A2C', both: false },
    { id: '3.7',  label: '3.7 0-A2C/High Visit', both: false },
    { id: '3.8',  label: '3.8 0-Conv Traffic',   both: false },
    { id: '3.9',  label: '3.9 Stage Class.',     both: false },
    { id: '3.10', label: '3.10 Cart Gap',         both: false },
    { id: '3.11', label: '3.11 Visit Δ',          both: true  },
    { id: '3.12', label: '3.12 A2C Rate Δ',       both: true  },
    { id: '3.13', label: '3.13 Purchase Δ',       both: true  },
    { id: '3.14', label: '3.14 Regression',       both: true  },
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
                <VBarChart labels={(d31.histogram||[]).map(h => h.label)} data={(d31.histogram||[]).map(h => h.count)} colors={(d31.histogram||[]).map((h,i) => i < 3 ? '#f43f5e' : i < 6 ? '#f59e0b' : '#10b981')} height={220} tooltipSuffix=" terms" />
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

        {/* 3.2 */}
        {active === '3.2' && (
          <Card title="3.2 · Visit Rate vs A2C Rate (by Category)" badge="Each dot = 1 search term" insight={d('3.2').insight} insightType="info">
            <FunnelScatter points={d('3.2').points||[]} height={340} />
            <p className="text-xs text-gray-400 mt-2 text-center">Top-right: high visit + high A2C = ideal. Bottom-left: discovery + conversion problem.</p>
          </Card>
        )}

        {/* 3.3 */}
        {active === '3.3' && (() => {
          const d33 = d('3.3');
          return (
            <Card title="3.3 · A2C → Purchase Rate (Top 20 by A2C Volume)" badge="Bar = A2C count · Rate overlay" insight={d33.insight} insightType="warn">
              <VBarChart
                labels={(d33.terms||[]).map(t => t.term_norm)}
                data={(d33.terms||[]).map(t => t.a2c_count||0)}
                colors={(d33.terms||[]).map(t => (t.purchase_rate||0) > 0.5 ? '#10b981' : (t.purchase_rate||0) > 0.2 ? '#f59e0b' : '#f43f5e')}
                height={260}
              />
              <DataTable cols={[
                { key:'term_norm',    label:'Term' },
                { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                { key:'a2c_count',    label:'A2C', right:true, render:v=>fmt(v) },
                { key:'orders',   label:'Orders', right:true, render:v=>fmt(v) },
                { key:'purchase_rate',label:'Purchase Rate', right:true, render:v=><span className={`text-xs font-semibold ${(v||0)>0.5?'text-emerald-600':(v||0)>0.2?'text-amber-600':'text-rose-600'}`}>{fmtN((v||0)*100,1)}%</span> },
                catCol(d33.terms||[]),
              ]} rows={d33.terms||[]} />
            </Card>
          );
        })()}

        {/* 3.4 */}
        {active === '3.4' && (() => {
          const d34 = d('3.4');
          const allRows34 = [...(d34.top20||[]), ...(d34.bottom20||[])];
          const cols = [
            { key:'term_norm',  label:'Term' },
            { key:'searches',   label:'Searches', right:true, render:v=>fmt(v) },
            { key:'visit_rate', label:'Visit %', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
            { key:'a2c_rate_s', label:'A2C %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
            { key:'e2e_conv',   label:'E2E Conv', right:true, render:v=><span className="font-semibold text-indigo-700">{fmtN((v||0)*100,3)}%</span> },
            catCol(allRows34),
          ];
          return (
            <>
              <Card title="3.4 · Top 20 Converters (≥500 searches)" badge="Cleanest funnel" insight={d34.insight} insightType="success">
                <DataTable cols={cols} rows={d34.top20||[]} />
              </Card>
              <Card title="3.4 · Bottom 20 Converters (≥500 searches)" badge="Highest opportunity" insightType="danger">
                <DataTable cols={cols} rows={d34.bottom20||[]} />
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
                { key:'avg_visit_rate',   label:'Visit %', right:true, render:v=>fmtN((v||0)*100,1)+'%' },
                { key:'avg_a2c_rate',     label:'A2C %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
                { key:'avg_purchase_rate',label:'Purchase %', right:true, render:v=>fmtN((v||0)*100,2)+'%' },
                { key:'avg_e2e_conv',     label:'E2E', right:true, render:v=>fmtN((v||0)*100,3)+'%' },
                { key:'searches',         label:'Searches', right:true, render:v=>fmt(v) },
              ]} rows={d35.categories||[]} maxH={280} />
            </Card>
          );
        })()}

        {/* 3.6 */}
        {active === '3.6' && (() => {
          const d36 = d('3.6');
          return (
            <Card title={`3.6 · Zero-Order Terms with High A2C (${d36.count||0} terms)`} badge="A2C ≥ 100, Orders = 0" insight={d36.insight} insightType="danger">
              <DataTable cols={[
                { key:'term_norm',    label:'Term' },
                { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                { key:'search_visits',label:'Visits', right:true, render:v=>fmt(v) },
                { key:'a2c_count',    label:'A2C', right:true, render:v=><span className="font-semibold text-amber-700">{fmt(v)}</span> },
                { key:'orders',   label:'Orders', right:true, render:v=><span className="text-rose-600 font-bold">{fmt(v)}</span> },
                catCol(d36.terms||[]),
              ]} rows={d36.terms||[]} />
            </Card>
          );
        })()}

        {/* 3.7 */}
        {active === '3.7' && (() => {
          const d37 = d('3.7');
          return (
            <Card title={`3.7 · Zero-A2C Terms with High Search Visits (${d37.count||0} terms)`} badge="Visits ≥ 200, A2C = 0" insight={d37.insight} insightType="danger">
              <DataTable cols={[
                { key:'term_norm',    label:'Term' },
                { key:'searches',     label:'Searches', right:true, render:v=>fmt(v) },
                { key:'search_visits',label:'Visits', right:true, render:v=><span className="font-semibold text-amber-700">{fmt(v)}</span> },
                { key:'a2c_count',    label:'A2C', right:true, render:v=><span className="text-rose-600 font-bold">{fmt(v)}</span> },
                catCol(d37.terms||[]),
              ]} rows={d37.terms||[]} />
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
          return (
            <>
              <Card title="3.9 · Funnel Stage Failure Distribution" insight={d39.insight} insightType="warn">
                <DoughnutChart
                  labels={(d39.stage_counts||[]).map(s => s.stage)}
                  data={(d39.stage_counts||[]).map(s => s.count)}
                  colors={['#f43f5e', '#f59e0b', '#fb923c', '#10b981']}
                />
              </Card>
              <Card title="3.9 · Term Funnel Classification" badge="Filter by stage">
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
            </>
          );
        })()}

        {/* 3.10 */}
        {active === '3.10' && (() => {
          const d310 = d('3.10');
          return (
            <Card title="3.10 · A2C-to-Purchase Gap (Cart Abandonment)" badge="Top 15 by absolute gap" insight={d310.insight} insightType="danger">
              <HBarChart
                labels={(d310.terms||[]).map(t => t.term_norm)}
                data={(d310.terms||[]).map(t => t.a2c_abandon||0)}
                colors="#f43f5e"
                height={260}
              />
              <DataTable cols={[
                { key:'term_norm',  label:'Term' },
                { key:'a2c_count',  label:'A2C', right:true, render:v=>fmt(v) },
                { key:'orders', label:'Orders', right:true, render:v=>fmt(v) },
                { key:'a2c_abandon',label:'Abandoned Carts', right:true, render:v=><span className="font-semibold text-rose-600">{fmt(v)}</span> },
                { key:'searches',   label:'Searches', right:true, render:v=>fmt(v) },
                catCol(d310.terms||[]),
              ]} rows={d310.terms||[]} />
            </Card>
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
            { key:'searches',  label:'Searches', right:true, render:v=>fmt(v) },
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
            { key:'searches',   label:'Searches', right:true, render:v=>fmt(v) },
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

        {/* 3.14 */}
        {active === '3.14' && (() => {
          const d314 = d('3.14');
          return (
            <Card title={`3.14 · Funnel Stage Regression (${d314.count||0} terms)`} badge="Any stage declined >10%" insight={d314.insight} insightType="danger">
              <DataTable cols={[
                { key:'term_norm',     label:'Term' },
                { key:'searches',      label:'Searches', right:true, render:v=>fmt(v) },
                { key:'stages_affected',label:'Stages Hit', right:true, render:v=><span className="font-bold text-rose-600">{v}</span> },
                { key:'regressions',   label:'Detail', render:v=><span className="text-xs text-rose-800">{v}</span> },
                catCol(d314.terms||[]),
              ]} rows={d314.terms||[]} maxH={420} />
            </Card>
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
        <KPICard title="Unique Terms"      value={fmt(summary.unique_terms)} />
        <KPICard title="Visit Rate"        value={fmtPct(summary.visit_rate)} />
        <KPICard title="A2C Rate"          value={fmtPct(summary.a2c_rate)}      sub={fmt(summary.a2c_count)+' events'} />
        <KPICard title="E2E Conversion"    value={fmtPct(summary.e2e_conv)} />
        <KPICard title="Total Orders"      value={fmt(summary.orders)} />
        <KPICard title="Total Revenue"     value={fmtCur(summary.revenue)} />
        <KPICard title="Revenue / Search"  value={fmtCur(summary.rev_per_search)} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="Search Volume Concentration (1.2)" badge="Click slice" insight={layer1?.['1.2']?.insight}>
          <DoughnutChart labels={vol.map(d=>d.name)} data={vol.map(d=>d.value)} colors={['#4f46e5','#7c3aed','#a855f7','#e879f9']} onClickIndex={i=>setDrill({title:vol[i]?.name+' — Terms',terms:vol[i]?.terms||[]})} />
        </Card>
        <Card title="Top Categories by Search Volume (1.3)" badge="Click bar" insight={layer1?.['1.3']?.insight}>
          <HBarChart labels={cat3.slice(0,10).map(d=>d.category)} data={cat3.slice(0,10).map(d=>d.searches)} color="#6366f1" height={260} onClickIndex={i=>setDrill({title:(cat3[i]?.category||'')+' — Terms',terms:[]})} />
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
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'home',   label: '🏠 Overview' },
  { id: 'layer1', label: '🔍 Layer 1: Demand' },
  { id: 'layer2', label: '📂 Layer 2: Categories' },
  { id: 'layer3', label: '🔻 Layer 3: Funnel' },
  { id: 'layer4', label: '📈 Layer 4: Trends' },
];

function App() {
  const [result, setResult] = useState(null);
  const [tab, setTab]       = useState('home');

  if (!result) return <UploadScreen onResult={setResult} />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-56 bg-slate-900 text-white flex flex-col shadow-2xl z-20 flex-shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-slate-800">
          <span className="font-bold text-sm tracking-widest">SEARCH<span className="text-indigo-400">INTEL</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${tab===n.id?'bg-indigo-600 text-white':'text-slate-300 hover:bg-slate-800'}`}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-500">
          <p>{fmt(result.current_terms_processed)} terms · current</p>
          {result.previous_terms_processed > 0 && <p>{fmt(result.previous_terms_processed)} terms · prev</p>}
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm flex-shrink-0">
          <span className="text-sm font-semibold text-gray-600">{NAV.find(n=>n.id===tab)?.label}</span>
          <button onClick={()=>setResult(null)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">← New Analysis</button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {tab==='home'   && <DashboardHome summary={result.summary} layer1={result.layer1} />}
          {tab==='layer1' && <Layer1 layer1={result.layer1} />}
          {tab==='layer2' && <Layer2 layer2={result.layer2} />}
          {tab==='layer3' && <Layer3 layer3={result.layer3} />}
          {tab==='layer4' && <Layer4 trendsInputs={result.trends_inputs} />}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);


