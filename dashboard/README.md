# Axe Results Dashboard (Vite + React)

This small dashboard reads a single consolidated `axe-results.json` (an array of per-URL result objects) from the web root (`/axe-results.json` i.e. `public/`) and shows KPIs and charts.

Quick start

1. From the `dashboard/` folder, install dependencies:

```pwsh
cd dashboard
npm install
```

2. Start dev server:

```pwsh
npm run dev
```

3. Open `http://localhost:5174` (Vite should print the exact URL).

Where to put your consolidated results

- Place your `axe-results.json` in `dashboard/public/axe-results.json` to have it served at `/axe-results.json`.
- Alternatively, you can put a file at `dashboard/src/data/axe-results.json`, and the app will import it as a fallback.

Notes

- The component expects each array item to be an object like: `{ url: string, timestamp?: string, results?: Array }`. The `results` array should contain violation objects with `id`, `impact`, `description`, and optional `nodes`.
- The project uses Tailwind for quick styling and Recharts for charts.

If you want, I can also:
- Create a simple Git branch with this scaffold.
- Wire it to read your real `reports/` JSON files automatically.
