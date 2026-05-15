# Ultra Power Executive OS — Claude Code Instructions

## Project Overview

This is a Next.js PWA called the **Ultra Power Executive OS**, built for Khalil Joseph Banares, Engineering Solutions Director at Ultra Power Industrial Resources Inc., Makati Philippines. It is a unified personal life and business operating system — a single productivity tool that replaces all others. It is deployed on Vercel and accessible on iPad, iPhone, and desktop.

Ultra Power is an authorized distributor of Goodlite LED and Philips (Signify) solutions, serving clients in power, oil and gas, mining, manufacturing, government, and food and beverage sectors — including EDC, NGCP, Maibarara Geothermal, PGPC, First Gen, Aboitiz Power, and NPC.

**Khalil's contact:** khalil@ultrapowerindustrialinc.com
**TIN:** 238-917-595-000
**GitHub:** kjb18
**Vercel URL:** https://ultrapower-executive-os-vgrr.vercel.app
**Vercel project name:** ultrapower-executive-os

---

## Core Philosophy and Design Rules

This OS must always feel like a real executive tool — not a side project or a prototype. Every design and UX decision must reflect these principles without exception:

- **Low cognitive load** — minimize decisions, reduce visual noise
- **Minimal friction** — fewest possible clicks to accomplish any task
- **ADHD-friendly** — clear states, no ambiguity, immediate feedback
- **Single source of truth** — Khalil does not use Notion or any other tool; this OS is the only productivity environment

**Design language:**
- Light theme, white surfaces (#fff)
- Plus Jakarta Sans for UI text
- DM Mono for monospace/data elements
- Blue accent: #185FA5
- All panels use 0.5px borders at #e2e6ea, border-radius 12-13px
- No em dashes anywhere in the UI or in code comments
- Prose over bullet points in all UI text

---

## Tech Stack

- **Framework:** Next.js 14+ with App Router, React 19, TypeScript (strict)
- **Storage:** Upstash Redis via @upstash/redis — env vars: KV_REST_API_URL, KV_REST_API_TOKEN
- **AI:** Claude API (claude-sonnet-4-5) via server-side routes ONLY — never call the Anthropic API from the browser
- **Deployment:** Vercel
- **Google Sheets:** Service account ultrapower-sheets@mapify-249009.iam.gserviceaccount.com — env vars: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SHEET_ID
- **ClickUp:** env var: CLICKUP_API_TOKEN
- **PWA:** manifest.json in /public

---

## File Structure

```
app/
  layout.tsx, page.tsx, globals.css, favicon.ico
  api/
    kv/route.ts            — Upstash KV proxy with CORS headers (GET, POST, DELETE, OPTIONS)
    claude/route.ts        — Claude API proxy, max_tokens capped at 4000
    learning/route.ts      — Daily Learning module, max_tokens 4000
    clickup/route.ts       — ClickUp calendar and task fetching
    clickup-mit/route.ts   — ClickUp MIT sync (create, complete, reopen, fetch, poll)
    philgeps/route.ts      — PhilGEPS search proxy
    sourcing/route.ts      — Sourcing Module AI search, web search enabled, max 3 searches/item
    images/route.ts        — Royalty-free image search, max 2 web searches
    projects/route.ts      — Projects + Expenses CRUD, syncs to KV and Google Sheets
    sheets/route.ts        — Google Sheets JWT auth and write layer
components/
  Shell.tsx               — Main app shell, tab routing
  Sidebar.tsx             — Navigation sidebar, exports TabId type
  Calendar.tsx            — ClickUp calendar integration
  tabs/
    Dashboard.tsx          — Main dashboard with 3-row grid layout
    SecondBrain.tsx        — Second Brain capture tool
    MentalFitness.tsx      — Mental fitness tracker
    DailyLearning.tsx      — Daily learning module
    CRM.tsx                — CRM with pipeline, contacts, POs, RFQs, slide-over panels
    Projects.tsx           — Projects + Financial Tracker (ERP-style)
    SocialMedia.tsx        — Social Media OS (iframe wrapper)
    Tools.tsx              — Tools panel (PhilGEPS, Sourcing, iframe tools)
    PhilGEPSHub.tsx        — PhilGEPS native React component
    SourcingModule.tsx     — Sourcing Module with RFQ upload and split view
lib/
  kv.ts                   — Upstash KV helpers (kvGet, kvSet, kvDel)
  constants.ts            — All shared interfaces and default data
public/
  manifest.json, favicon.svg
  icons/icon-192.png, icon-512.png
  tools/
    social.html            — Social Media OS (standalone HTML)
    docmaker.html          — Document Maker 5-in-1 (standalone HTML)
    leadgen.html           — Lead Gen tool
    philgeps_legacy.html   — Legacy PhilGEPS tool
```

---

## KV Data Schema

All keys use the prefix pattern below. Never use localStorage in any component — all persistence goes through Upstash KV.

```
exec-os:dashboard          — OSData (mits, okrs, kpis, tbs, brain, brewing, crosshairs, nid)
exec-os:brain              — Second Brain items array
exec-os:mfp:{date}         — Mental Fitness daily data (PH timezone, 3am reset)
exec-os:mfp:streak         — {streak, lastDate}
exec-os:crm                — CRM data (prospects, contacts, pendingPOs, pendingRFQs, nid)
exec-os:crm:old-contacts   — Old contacts array
exec-os:pomo:sessions      — {sessions} Pomodoro session count
exec-os:learning:history   — Daily Learning history array
exec-os:learning:{date}    — Today's generated module (PH timezone key)
exec-os:learning:request   — Pending topic request string
exec-os:sourcing:history   — Sourcing Module search history (max 20)
exec-os:mit:archive        — MIT Wins Archive entries array (max 900)
projects:all               — All Project records array
expenses:all               — All Expense records array
social:posts               — Social Media OS posts
social:articles            — Social Media OS articles
social:playbook            — Social Media OS playbook
docmaker:clients           — Client memory (company, address, contacts)
docmaker:settings          — Saved field suggestions and templates
```

Note: The KV lib uses a prefix. kvGet("dashboard") reads "exec-os:dashboard". Check lib/kv.ts for the exact prefix logic.

---

## Key Interfaces (from lib/constants.ts)

```typescript
MIT { id, text, done, doneAt?, clickupId?, dueDate? }
MITArchiveEntry { text, doneAt, dayKey }
OKR { id, objective, keyResult, current, target, unit }
KPI { id, label, value, delta, up: boolean|null }
TimeBlock { id, time, label, sub, type }
BrewingItem { id, what, who, since, category }
CrosshairsTarget { id, company, sector, estDeal, priority, lastAction, nextMove }
OSData { mits, okrs, kpis, tbs, brain, brewing, crosshairs, nid }
MFPDay { mood, moodTime, mitDone, win, winDone, refl, reflDone }
```

---

## Dashboard Layout (3-row grid)

**Row 1 (4 columns):** MITs | Pomodoro | Operations Panel | OKR Tracker
**Row 2 (3 columns):** Time Blocks | Crosshairs | Brewing
**Row 3 (3 columns):** Vitals | Calendar (span 2) | AI Insight

**Operations Panel tabs:** Projects (default) | RFQs | POs
- Projects tab shows live data from /api/projects
- RFQs and POs show data from exec-os:crm KV key
- "Go to Projects" and "Go to CRM" buttons use the onNavigate prop

**Pomodoro modes:** Standard (25/5) | Extended (50/10) | Deep Work (60-180min slider, no break)

---

## Token Safety Rules (CRITICAL — never violate these)

All Claude API calls MUST go through server-side routes. Direct browser calls to api.anthropic.com fail due to CORS and are forbidden.

Hard limits per route:
- /api/claude — max_tokens 4000, NO web search
- /api/learning — max_tokens 4000, NO web search
- /api/sourcing — max_tokens 2000 per item, web search ON with max_uses: 3
- /api/images — max_tokens 1000, web search ON with max_uses: 2

Never use claude-opus on any route. Always use claude-sonnet-4-5.

---

## API Routes — CORS

The /api/kv route has full CORS headers (Access-Control-Allow-Origin: *) to allow calls from the static HTML tools in /public/tools/. All other routes do not need CORS headers since they are called from React components on the same domain.

---

## Google Sheets Integration

The workbook "Ultra Power OS Data" has three sheets: Projects, Transactions, Documents.

The /api/sheets route handles JWT auth using the service account private key from GOOGLE_SERVICE_ACCOUNT_JSON. It auto-creates sheets with headers on first use. The /api/projects route syncs to Sheets on every save.

Sheet ID is stored in GOOGLE_SHEET_ID env var.

---

## ClickUp Integration

Two routes handle ClickUp:
- /api/clickup — fetches tasks with due dates for the Calendar component
- /api/clickup-mit — handles MIT sync: create task, complete task, reopen task, fetch tasks, poll completion status

MIT tasks are created in a dedicated "Executive MITs" list. The list is auto-created on first use inside the first available Space.

The Dashboard polls ClickUp every 2 minutes for completion status of linked MITs.

---

## Projects Module (ERP-style)

Project lifecycle: RFQ Submitted → Negotiation → PO Received → In Fulfillment → Delivered → Invoiced → Payment Pending → Closed | Lost

Rules:
- One project = one PO = one delivery (no partial deliveries)
- RFQs open more than 30 days auto-flag as Lost
- RFQs 15-30 days old get a Follow Up alert
- Payment due date auto-calculates from invoice date + payment terms
- Overdue flag triggers when payment due date passes and status is Unpaid

VAT types: VAT Inclusive (12%), Zero Rated, Exempt — some clients are zero-rated

Expense types: COGS | Shipping Cost | Shipping Revenue | Project Expense | OpEx
OpEx categories: Rent, Utilities, Office Supplies, Fuel/Transport, Meals & Entertainment, Permits & Licenses, Staff Costs, Miscellaneous
Project Expense categories: Transport, Packaging, Labor, Customs/Duties, Miscellaneous

Gross Profit = Revenue - COGS - Shipping Cost - Project Expenses

---

## CRM Slide-Over Panels

Both POs and RFQs have an Open button that opens a slide-over panel from the right side. The panel has two tabs:
- Details — full form editing of all fields
- Documents — documents saved from Document Maker via Save to CRM button

The Document Maker has a Save to CRM button that saves the rendered document HTML into the linked RFQ or PO record.

The Open in Document Maker link in the slide-over passes URL params (?rfq=, ?po=, ?client=, ?subject=) to pre-fill the Document Maker form.

---

## Document Maker (/public/tools/docmaker.html)

Static HTML file served from /public/tools/. All KV calls use the hardcoded Vercel URL because the file is loaded inside an iframe and cannot use relative paths.

Key functions:
- saveClientFromForm() — auto-saves client memory on Preview click
- kvLoadDocs() / kvSaveDocs() — document tracker persistence via KV
- loadSettings() / saveSettings() — saved field suggestions and templates
- showSaveToCRM() / saveToCRM() — saves document to CRM record
- openPreview() — generates and renders the document HTML
- URL params on load: rfq=, po=, client=, subject= for pre-fill from CRM

Document types: Quotation, Purchase Order, Invoice, Delivery Receipt, RFQ Response

---

## Social Media OS (/public/tools/social.html)

Static HTML file. All storage uses Upstash KV via hardcoded Vercel URL (NOT window.storage which does not work outside Claude.ai artifacts).

KV keys: social:posts, social:articles, social:playbook

The Find Images feature calls /api/images for royalty-free image search. The image export uses canvas to render branded PNG cards (1200x628 landscape, 1080x1080 square).

---

## Working Style and Preferences

- Always run `npm run build` and fix all TypeScript errors before committing
- Never commit broken builds
- Commit after each working feature with a descriptive message
- Prefer targeted edits over full file rewrites when possible
- No em dashes anywhere (use -- instead)
- Structured formal English in all UI text and comments
- When adding new interfaces, always add them to lib/constants.ts and export them
- When adding new KV keys, document them in the KV Data Schema section above
- Files and instructions must always be in the same response

---

## Known Issues and Watch Points

1. **package.json devDependencies** — after any ZIP upload or dependency change, verify devDependencies block includes: typescript, @types/react, @types/react-dom, @types/node

2. **Static HTML KV calls** — docmaker.html and social.html use hardcoded Vercel URL for KV calls. If the Vercel URL ever changes, update both files.

3. **Google Sheets service account key** — the original key was exposed in chat and revoked. A new key is in Vercel env vars. Never log or expose GOOGLE_SERVICE_ACCOUNT_JSON.

4. **MITArchiveEntry** — must be exported from lib/constants.ts. This has been missing in previous deploys causing build failures.

5. **OKR interface** — uses {id, objective, keyResult, current, target, unit} NOT the old {id, name, pct, note} schema. The DEFAULT_OS in constants.ts must use the new schema.

6. **ClickUp MIT list** — the "Executive MITs" list is auto-created on first use. If CLICKUP_API_TOKEN is not set, MIT sync silently disables itself without breaking the UI.

---

## Environment Variables Required in Vercel

```
KV_REST_API_URL
KV_REST_API_TOKEN
ANTHROPIC_API_KEY
CLICKUP_API_TOKEN
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_SHEET_ID
```

For local development, copy these into .env.local (never commit .env.local to git).
