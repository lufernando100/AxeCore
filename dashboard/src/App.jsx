import React from 'react'
import AccessibilityDashboard from './components/AccessibilityDashboard'

export default function App(){
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-slate-900">Accessibility Dashboard</h1>
          <p className="text-sm text-slate-500">Loads a single consolidated <code className="bg-slate-100 px-1 rounded">axe-results.json</code> from <code className="bg-slate-100 px-1 rounded">/</code> (public/) or <code className="bg-slate-100 px-1 rounded">src/data/</code>.</p>
        </div>
      </header>
      <main className="py-8 px-4 max-w-7xl mx-auto">
        <AccessibilityDashboard />
      </main>
    </div>
  )
}
