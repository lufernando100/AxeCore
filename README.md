````markdown
# Axe Automation Tool

Automated accessibility testing tool using Axe Core and Playwright. Supports bulk scanning, regression testing, and Jira integration.

Out Of Scope

- Keyboard Navigation
- Screen Reader
- Heading Validation


## 🚀 Features

- **Bulk Scanning**: Scan multiple URLs defined in `test-urls.txt`.
- **Visual Reports**: Generates HTML dashboards for overall status and regression diffs.
- **Jira Integration**: Automatically syncs accessibility issues to Jira.
- **Regression Testing**: Compare current results against a baseline to detect new issues.
- **Baseline Management**: Scalable baseline storage using JSON sharding.

## 📋 Prerequisites

- Node.js 16+
- NPM

## 🛠️ Installation

```powershell
npm install
```

## 🏃‍♂️ Usage

### 1. Basic Audit (Bulk Scan)
Runs Axe against all URLs in `test-urls.txt` and generates reports.
```powershell
npm run axe:all
```

### 2. Regression Testing Workflow
This is the recommended workflow to ensure no new bugs are introduced.

**Step A: Run Audit & Check Regression**
Runs the audit and compares it against the saved baseline.
```powershell
npm run axe:regression
```
*Output:* `reports/regression-report.html` (Visual Diff)

**Step B: Check Regression Only**
If you already ran an audit and just want to re-check the diff.
```powershell
npm run check:regression
```

**Step C: Update Baseline**
If the new issues are expected or fixed, update the baseline to the current state.
```powershell
npm run save:baseline
```

### 3. Jira Synchronization
Syncs the latest results to Jira (requires `.env` configuration).
```powershell
npm run jira:sync
```

## 📊 Reports

Artifacts are generated in the `reports/` folder:

- **`reports/aggregate/aggregate.html`**: Main dashboard with all issues and Jira status.
- **`reports/regression-report.html`**: Visual report showing **New** vs **Resolved** issues.
- **`reports/per-url/`**: Individual JSON/HTML reports for each URL.

## ⚙️ Configuration

- **`test-urls.txt`**: List of URLs to scan (one per line).
- **`axe.config.json`**: Axe-core configuration (rules, tags, etc.).
- **`.env`**: Environment variables for Jira (URL, User, Token).

## 📂 Project Structure

```
├── history/pages/       # Baseline JSON files (one per URL)
├── reports/             # Generated reports
├── scripts/             # Utility scripts (cleanup, regeneration)
├── src/                 # Source code
│   ├── run-axe.js       # Main runner
│   ├── regression-check.js # Regression logic
│   ├── save-baseline.js # Baseline saver
│   └── jira-sync.js     # Jira integration
└── test-urls.txt        # Input URLs
```

````
