import React, { useEffect, useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts'
import { Download } from 'lucide-react'

const COLORS = {
  critical: '#7f1d1d',
  serious: '#b91c1c',
  moderate: '#f59e0b',
  minor: '#0ea5a4',
  unknown: '#94a3b8'
}

function impactKey(impact){
  if(!impact) return 'unknown'
  const k = String(impact).toLowerCase()
  if(k.includes('critical')) return 'critical'
  if(k.includes('serious') || k.includes('serious')) return 'serious'
  if(k.includes('moderate')) return 'moderate'
  if(k.includes('minor')) return 'minor'
  return 'unknown'
}

export default function AccessibilityDashboard(){
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(()=>{
    let mounted = true
    // First try public root: /axe-results.json
    fetch('/axe-results.json')
      .then(r=>{
        if(!r.ok) throw new Error('Not found in public/')
        return r.json()
      })
      .catch(()=>{
        // Fallback to bundled src/data file (import)
        return import('../data/axe-results.json').then(m=>m.default || m)
      })
      .then(json=>{
        if(!mounted) return
        setData(json)
        setLoading(false)
      })
      .catch(err=>{
        if(!mounted) return
        setError(err.message)
        setLoading(false)
      })
    return ()=>{ mounted = false }
  },[])

  const flat = useMemo(()=>{
    if(!data || !Array.isArray(data)) return []
    return data
  },[data])

  const totals = useMemo(()=>{
    const summary = { urls: 0, violations: 0, impacts: { critical:0, serious:0, moderate:0, minor:0, unknown:0 }, ruleCounts: {} }
    summary.urls = flat.length
    for(const entry of flat){
      const results = entry.results || entry.axe || entry.violations || []
      const violations = Array.isArray(results) ? results : (results.violations || [])
      // Some consolidated outputs might have an object per URL with .violations array
      const vs = violations
      summary.violations += vs.length
      for(const v of vs){
        const imp = impactKey(v.impact)
        summary.impacts[imp] = (summary.impacts[imp]||0) + 1
        const ruleId = v.id || v.ruleId || v.rule || 'unknown'
        summary.ruleCounts[ruleId] = (summary.ruleCounts[ruleId]||0) + 1
      }
    }
    return summary
  },[flat])

  const topRules = useMemo(()=>{
    const items = Object.entries(totals.ruleCounts).map(([id,c])=>({id,count:c})).sort((a,b)=>b.count-a.count)
    return items.slice(0,10)
  },[totals])

  const impactChart = useMemo(()=>{
    return Object.entries(totals.impacts).map(([k,v])=>({name:k, value:v, color: COLORS[k] || COLORS.unknown}))
  },[totals])

  const filtered = useMemo(()=>{
    if(!query) return flat
    const q = query.toLowerCase()
    return flat.filter(item=>{
      const url = (item.url||item.page||item.pageUrl||'').toLowerCase()
      return url.includes(q)
    })
  },[flat,query])

  function exportJSON(){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'axe-results-export.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if(loading) return <div className="text-slate-600">Loading axe results...</div>
  if(error) return <div className="text-red-600">Error: {error}</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-slate-500">URLs</div>
          <div className="text-2xl font-semibold">{totals.urls}</div>
          <div className="text-xs text-slate-400 mt-2">Total scanned pages</div>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <div className="text-sm text-slate-500">Total Violations</div>
          <div className="text-2xl font-semibold">{totals.violations}</div>
          <div className="text-xs text-slate-400 mt-2">Sum of all violations across pages</div>
        </div>
        <div className="p-4 bg-white rounded shadow flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">Export</div>
            <div className="text-lg font-medium">Download JSON</div>
          </div>
          <button onClick={exportJSON} className="inline-flex items-center gap-2 px-3 py-2 bg-sky-600 text-white rounded hover:bg-sky-700">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Violations Overview</h2>
            <div className="flex items-center gap-2">
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filter by URL" className="px-3 py-2 border rounded" />
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((entry, idx)=>{
              const url = entry.url || entry.page || entry.pageUrl || `item-${idx}`
              const violations = Array.isArray(entry.results) ? entry.results : (entry.violations || entry.axe || [])
              return (
                <div key={idx} className="p-3 border rounded hover:shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-slate-500">{url}</div>
                      <div className="text-base font-medium">{violations.length} violations</div>
                    </div>
                    <div className="text-sm text-slate-400">{entry.timestamp || ''}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {violations.slice(0,5).map(v=> (
                      <div key={v.id || v.ruleId} className="py-1">
                        <div className="font-medium">{v.id || v.rule || v.ruleId}</div>
                        <div className="text-xs text-slate-500">{v.description || v.help || v.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {filtered.length===0 && <div className="text-sm text-slate-500">No pages match the filter.</div>}
          </div>
        </div>

        <aside className="bg-white p-4 rounded shadow">
          <h3 className="text-md font-semibold mb-3">Impact Distribution</h3>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={impactChart} dataKey="value" nameKey="name" outerRadius={80} innerRadius={35}>
                  {impactChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <h4 className="mt-4 mb-2 font-medium">Top Rules</h4>
          <div className="space-y-2 text-sm">
            {topRules.map(r=> (
              <div key={r.id} className="flex justify-between">
                <div className="text-slate-700">{r.id}</div>
                <div className="text-slate-500">{r.count}</div>
              </div>
            ))}
            {topRules.length===0 && <div className="text-slate-500">No rules found.</div>}
          </div>
        </aside>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h3 className="text-lg font-semibold mb-3">Rule Counts (bar chart)</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={topRules.map(r=>({name:r.id, count:r.count}))}>
              <XAxis dataKey="name" tick={{fontSize:12}} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
