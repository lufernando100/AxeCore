require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

// Config from .env
const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_USER = process.env.JIRA_USERNAME;
const JIRA_PASS = process.env.JIRA_PASSWORD;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const ISSUE_TYPE = process.env.JIRA_ISSUE_TYPE || 'Bug';

if (!JIRA_HOST || !JIRA_USER || !JIRA_PASS || !PROJECT_KEY) {
  console.error('Error: Missing Jira configuration in .env file.');
  console.error('Please create a .env file with JIRA_HOST, JIRA_USERNAME, JIRA_PASSWORD, and JIRA_PROJECT_KEY.');
  process.exit(1);
}

// Configure Axios for Jira Cloud
const jiraClient = axios.create({
  baseURL: `https://${JIRA_HOST}/rest/api/3`,
  headers: {
    'Authorization': `Basic ${Buffer.from(`${JIRA_USER}:${JIRA_PASS}`).toString('base64')}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

const RESULTS_PATH = path.join(__dirname, '../reports/all-results.json');

// Helper to create a unique signature for an issue
function getIssueSignature(ruleId, selector) {
  const str = `${ruleId}|${selector}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

// Helper to map Axe impact to Jira Priority
function mapPriority(impact) {
  switch (impact) {
    case 'critical': return 'High';
    case 'serious': return 'Medium';
    case 'moderate': return 'Low';
    case 'minor': return 'Lowest';
    default: return 'Medium';
  }
}

// Helper to convert Wiki Markup to Atlassian Document Format (ADF)
// Jira Cloud API v3 requires ADF for description, not wiki markup string.
// This is a simplified converter.
function createADFDescription(data, signature) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Rule: ", marks: [{ type: "strong" }] },
          { type: "text", text: data.ruleId }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Impact: ", marks: [{ type: "strong" }] },
          { type: "text", text: data.impact }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Description: ", marks: [{ type: "strong" }] },
          { type: "text", text: data.description }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Help: ", marks: [{ type: "strong" }] },
          { type: "text", text: "Link", marks: [{ type: "link", attrs: { href: data.helpUrl } }] }
        ]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Selector:", marks: [{ type: "strong" }] }]
      },
      {
        type: "codeBlock",
        content: [{ type: "text", text: data.selector }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: `Affected URLs (${data.urls.size}):`, marks: [{ type: "strong" }] }]
      },
      {
        type: "bulletList",
        content: Array.from(data.urls).slice(0, 20).map(u => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: u }] }]
        }))
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Snippet:", marks: [{ type: "strong" }] }]
      },
      {
        type: "codeBlock",
        attrs: { language: "html" },
        content: [{ type: "text", text: data.html || '' }]
      },
      {
        type: "rule"
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Signature: ", marks: [{ type: "strong" }] },
          { type: "text", text: signature }
        ]
      }
    ]
  };
}

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error('Error: Results file not found:', RESULTS_PATH);
    console.error('Run "npm run axe:all" first to generate the report.');
    return;
  }

  console.log('Reading results from:', RESULTS_PATH);
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  
  // 1. Group violations by Signature (Rule + Selector)
  const issuesMap = new Map(); 
  const uniqueRules = new Set();
  const ruleHelpMap = new Map();

  results.forEach(res => {
    const url = res.url;
    if (res.violations) {
      res.violations.forEach(v => {
        uniqueRules.add(v.id); // Collect rule IDs for JQL
        ruleHelpMap.set(v.id, v.help); // Store help text
        v.nodes.forEach(node => {
          const selector = node.target.join(', ');
          const sig = getIssueSignature(v.id, selector);
          
          if (!issuesMap.has(sig)) {
            issuesMap.set(sig, {
              signature: sig,
              ruleId: v.id,
              help: v.help,
              description: v.description,
              helpUrl: v.helpUrl,
              impact: v.impact,
              selector: selector,
              html: node.html,
              urls: new Set()
            });
          }
          issuesMap.get(sig).urls.add(url);
        });
      });
    }
  });

  console.log(`Found ${issuesMap.size} unique issues candidates across ${uniqueRules.size} rules.`);

  // 2. Fetch existing tickets to avoid duplicates
  let existingIssues = new Map(); // Signature -> { key, status }
  
  try {
    console.log(`Querying Jira for existing automation tickets...`);
    
    // MULTI-PROJECT SUPPORT:
    const projectEnv = process.env.JIRA_PROJECT_KEY || '';
    let projectJql = '';
    const projectsList = projectEnv.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    if (projectsList.length > 1) {
      const projects = projectsList.join(', ');
      projectJql = `project in (${projects})`;
    } else if (projectsList.length === 1) {
      projectJql = `project = "${projectsList[0]}"`;
    } else {
      projectJql = 'project IS NOT EMPTY';
    }

    // DYNAMIC JQL CONSTRUCTION
    // Query: project... AND (labels = "Accessibility" OR text ~ "Accessibility") AND ( (text ~ "rule1" OR text ~ "help1") OR ... )
    const ruleClauses = Array.from(uniqueRules).map(ruleId => {
        const help = ruleHelpMap.get(ruleId);
        const safeHelp = help ? help.replace(/"/g, '\\"') : ruleId;
        // Using 'text' (equivalent to textfields) to search in Summary, Description, Environment, etc.
        return `(text ~ "${ruleId}" OR text ~ "${safeHelp}")`;
    });
    
    const rulesPart = ruleClauses.length > 0 ? `AND (${ruleClauses.join(' OR ')})` : '';

    // JQL Final
    const jql = `${projectJql} AND (labels = "Accessibility" OR text ~ "Accessibility") ${rulesPart}`;
    console.log(`   Query: ${jql}`);
    
    // Use POST /search/jql
    const response = await jiraClient.post('/search/jql', {
      jql: jql,
      maxResults: 1000,
      fields: ['description', 'summary', 'status', 'labels']
    });
    
    const issues = response.data.issues || [];
    const ticketsByRule = new Map(); // RuleID -> [Tickets]

    issues.forEach(issue => {
      const ticketInfo = { key: issue.key, status: issue.fields.status.name };
      const summary = issue.fields.summary || '';
      // Convert description (ADF Object) to string to search text within it
      const description = issue.fields.description ? JSON.stringify(issue.fields.description) : '';

      // A. Check labels for exact signature match 'sig-MD5...'
      (issue.fields.labels || []).forEach(l => {
          if(l.startsWith('sig-')) {
              const sig = l.replace('sig-', '');
              existingIssues.set(sig, ticketInfo);
          }
      });

      // B. Map by Rule (Fuzzy Match based on Summary OR Description)
      uniqueRules.forEach(ruleId => {
         const help = ruleHelpMap.get(ruleId);
         // Check if summary OR description contains Rule ID OR Help Text
         if (summary.includes(ruleId) || (help && summary.includes(help)) ||
             description.includes(ruleId) || (help && description.includes(help))) {
             if (!ticketsByRule.has(ruleId)) ticketsByRule.set(ruleId, []);
             ticketsByRule.get(ruleId).push(ticketInfo);
         }
      });
    });
    
    // Fill existingIssues with fuzzy matches if no exact match exists
    issuesMap.forEach((data, sig) => {
        if (!existingIssues.has(sig) && ticketsByRule.has(data.ruleId)) {
            const candidates = ticketsByRule.get(data.ruleId);
            if (candidates.length > 0) {
                // Use the first candidate found for this rule
                existingIssues.set(sig, candidates[0]);
            }
        }
    });

    console.log(`Found ${existingIssues.size} active issues already in Jira (Exact + Fuzzy).`);

  } catch (err) {
    console.error('Failed to search Jira.');
    console.error('Error:', err.response ? err.response.data : err.message);
    // Continue to generate report even if sync fails
  }

  // 3. Create new tickets (SKIPPED)
  let createdCount = 0;
  let skippedCount = 0;

  for (const [sig, issueData] of issuesMap) {
    if (existingIssues.has(sig)) {
      const existing = existingIssues.get(sig);
      // console.log(`Skipping ${issueData.ruleId}: Already exists as ${existing.key} (${existing.status})`);
      skippedCount++;
      continue;
    }
    // console.log(`Would create ticket for: ${issueData.ruleId} ...`);
  }

  console.log('------------------------------------------------');
  console.log(`Sync Complete.`);
  console.log(`Mapped: ${skippedCount}`);
  console.log(`New (Unmapped): ${issuesMap.size - skippedCount}`);

  // 4. Update Aggregate Report with Jira Status
  const AGG_PATH = path.join(__dirname, '../reports/aggregate/aggregate.html');
  if (fs.existsSync(AGG_PATH)) {
      console.log('Updating aggregate report with Jira status...');
      let html = fs.readFileSync(AGG_PATH, 'utf8');
      
      const injectionData = {};
      for(const [sig, data] of existingIssues) {
          injectionData[sig] = data;
      }
      
      const scriptPayload = `
<script>
  window.JIRA_HOST = '${JIRA_HOST}';
  if(window.updateJiraBadges) {
    window.updateJiraBadges(${JSON.stringify(injectionData)});
  }
</script>`;

      // Remove previous injection if exists to avoid accumulation
      const marker = '<!-- JIRA_INJECTION -->';
      const regex = new RegExp(`${marker}[\\s\\S]*?${marker}`, 'g');
      
      html = html.replace(regex, ''); // Clear old
      
      // Append new
      const newContent = `${marker}${scriptPayload}${marker}`;
      html = html.replace('</body>', `${newContent}</body>`);
      
      fs.writeFileSync(AGG_PATH, html);
      console.log('Report updated.');
  }
}

main().catch(console.error);