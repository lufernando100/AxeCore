# Axe Automation

Small utility to run Axe Core with Playwright and generate a human-friendly HTML report.

Requirements
- Node.js 16+ (or the Node version compatible with Playwright in package.json)

Installation

In PowerShell (from the project root):

```powershell
npm install
# or if you use yarn:
# yarn
```

Usage

Run the audit against a public or local URL:

```powershell
# Example
npm run axe -- --url "https://example.com"

# If you want to specify an output JSON file:
npm run axe -- --url "https://example.com" --output ./reports/example.json
```

Output
- Produces a JSON with the raw results (axe run) and an HTML file with a summary and per-violation details.

Notes
- The tool uses Playwright (Chromium by default) in headless mode.
- If you need to audit pages that require authentication, the CLI can be extended to accept cookies or login steps.

Suggested next steps
- Add options to run against multiple URLs in a single run.
- Integrate with CI to fail the build on critical-impact violations.
- Add unit tests and example workflows.
