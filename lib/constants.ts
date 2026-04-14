export const MOODS = [
  { id: "focused",   emoji: "🎯", label: "Focused"   },
  { id: "energized", emoji: "⚡", label: "Energized"  },
  { id: "calm",      emoji: "🌊", label: "Calm"       },
  { id: "onfire",    emoji: "🔥", label: "On Fire"    },
  { id: "happy",     emoji: "😄", label: "Happy"      },
  { id: "foggy",     emoji: "🌫️", label: "Foggy"      },
  { id: "anxious",   emoji: "😤", label: "Anxious"    },
  { id: "drained",   emoji: "🪫", label: "Drained"    },
  { id: "heavy",     emoji: "🌧️", label: "Heavy"      },
  { id: "scattered", emoji: "🌀", label: "Scattered"  },
];

export const BRAIN_TYPES = ["Idea","Decision","Task","Reference","Note"] as const;
export type BrainType = typeof BRAIN_TYPES[number];

export const BRAIN_COLORS: Record<BrainType, { bg: string; fg: string }> = {
  Idea:      { bg:"#EBF3FC", fg:"#185FA5" },
  Decision:  { bg:"#FFF8EC", fg:"#854F0B" },
  Task:      { bg:"#FEF0F0", fg:"#A32D2D" },
  Reference: { bg:"#f0faf5", fg:"#3B6D11" },
  Note:      { bg:"#F4F3FE", fg:"#534AB7" },
};

export const TB_COLORS: Record<string, string> = {
  "Deep Work":       "#185FA5",
  "Client Calls":    "#BA7517",
  "Admin":           "#3B6D11",
  "Strategic Review":"#534AB7",
  "Break":           "#b0bec8",
  "Personal":        "#0F6E56",
};

export const MOMENTUM = [
  { label:"Launching",    color:"#9A8FD0", min:0 },
  { label:"Accelerating", color:"#4AAAD4", min:2 },
  { label:"In Motion",    color:"#2478AA", min:4 },
  { label:"Locked In",    color:"#0D5080", min:6 },
  { label:"On Full Send", color:"#042A50", min:8 },
];

export const TOOLS = [
  {
    id: "philgeps",
    name: "PhilGEPS Hub",
    description: "Live bid monitoring and opportunity tracking from PhilGEPS",
    category: "Procurement",
    icon: "🏛️",
  },
  {
    id: "leadgen",
    name: "Lead Gen System",
    description: "Prospect tracking, scoring, and pipeline management",
    category: "Sales",
    icon: "🎯",
  },
  {
    id: "docmaker",
    name: "Document Maker",
    description: "Quotation, PO, Invoice, RFQ Response, Delivery Receipt",
    category: "Operations",
    icon: "📄",
  },
];

export const PW = 25 * 60;
export const PB = 5 * 60;

export function pad(n: number) { return String(n).padStart(2, "0"); }

export function getTodayKey() {
  const n = new Date(), b = new Date(n);
  b.setHours(3, 0, 0, 0);
  if (n < b) b.setDate(b.getDate() - 1);
  return b.toISOString().split("T")[0];
}

export function getResetMs() {
  const n = new Date(), r = new Date(n);
  r.setHours(3, 0, 0, 0);
  if (n >= r) r.setDate(r.getDate() + 1);
  return r.getTime();
}

export function fmtCountdown(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const pctColor = (p: number) =>
  p >= 70 ? "#3B6D11" : p >= 40 ? "#185FA5" : "#A32D2D";

export interface MIT { id: number; text: string; done: boolean; }
export interface OKR { id: number; name: string; pct: number; note: string; }
export interface KPI { id: number; label: string; value: string; delta: string; up: boolean | null; }
export interface TimeBlock { id: number; time: string; label: string; sub: string; type: string; }
export interface BrainItem { id: number; type: BrainType; text: string; }
export interface MFPDay {
  mood: string | null; moodTime: string | null;
  mitDone: boolean; win: string; winDone: boolean;
  refl: string; reflDone: boolean;
}

export interface BrewingItem {
  id: number;
  what: string;
  who: string;
  since: string;
  category: "Client"|"Gov"|"Supplier"|"Internal"|"Other";
}

export interface CrosshairsTarget {
  id: number;
  company: string;
  sector: string;
  estDeal: string;
  priority: "High"|"Medium"|"Watch";
  lastAction: string;
  nextMove: string;
}

export interface OSData {
  mits: MIT[];
  okrs: OKR[];
  kpis: KPI[];
  tbs: TimeBlock[];
  brain: BrainItem[];
  brewing: BrewingItem[];
  crosshairs: CrosshairsTarget[];
  nid: number;
}

export const BREWING_CATEGORIES = ["Client","Gov","Supplier","Internal","Other"] as const;
export const BREWING_COLORS: Record<string,{bg:string;fg:string}> = {
  Client:   {bg:"#EBF3FC", fg:"#185FA5"},
  Gov:      {bg:"#FFF8EC", fg:"#854F0B"},
  Supplier: {bg:"#f0faf5", fg:"#3B6D11"},
  Internal: {bg:"#F4F3FE", fg:"#534AB7"},
  Other:    {bg:"#f0f2f5", fg:"#8a9ab0"},
};

export const CROSSHAIRS_PRIORITY_COLORS: Record<string,{bg:string;fg:string}> = {
  High:   {bg:"#FEF0F0", fg:"#A32D2D"},
  Medium: {bg:"#EBF3FC", fg:"#185FA5"},
  Watch:  {bg:"#f0f2f5", fg:"#8a9ab0"},
};

export const DEFAULT_OS: OSData = {
  mits: [
    { id:1, text:"Finalize substation LED proposal for EDC", done:false },
    { id:2, text:"Follow up NGCP PhilGEPS bid #881", done:false },
    { id:3, text:"Update Goodlite pricing in Document Maker", done:false },
  ],
  okrs: [
    { id:1, name:"Revenue Growth", pct:68, note:"Q2 pipeline strong" },
    { id:2, name:"Client Acquisition", pct:45, note:"3 prospects in negotiation" },
    { id:3, name:"Bid Win Rate", pct:80, note:"4 of 5 bids won YTD" },
    { id:4, name:"System Automation", pct:30, note:"Executive OS in progress" },
  ],
  kpis: [
    { id:1, label:"Pipeline", value:"₱2.4M", delta:"+12%", up:true },
    { id:2, label:"Win Rate", value:"87%", delta:"+4%", up:true },
    { id:3, label:"Active Bids", value:"14", delta:"0%", up:null },
    { id:4, label:"Overdue", value:"3", delta:"+1", up:false },
  ],
  tbs: [
    { id:1, time:"08:00", label:"Deep Work", sub:"Proposal writing · 2 hrs", type:"Deep Work" },
    { id:2, time:"10:00", label:"Client Calls", sub:"EDC, NGCP · 1.5 hrs", type:"Client Calls" },
    { id:3, time:"11:30", label:"Admin", sub:"PhilGEPS review · 1 hr", type:"Admin" },
    { id:4, time:"14:00", label:"Strategic Review", sub:"OKR + pipeline · 1 hr", type:"Strategic Review" },
    { id:5, time:"15:00", label:"Deep Work", sub:"Systems & dashboard · 2 hrs", type:"Deep Work" },
    { id:6, time:"17:00", label:"Break", sub:"Wind down · 30 min", type:"Break" },
  ],
  brain: [
    { id:1, type:"Idea", text:"Bundle Goodlite + Philips for NPC industrial package" },
    { id:2, type:"Reference", text:"Philips Signify 2025 industrial catalog — download" },
    { id:3, type:"Decision", text:"Extend warranty as bid differentiator?" },
    { id:4, type:"Task", text:"Update EDC contact info in CRM" },
  ],
  brewing: [
    { id:1, what:"EDC substation LED proposal decision", who:"EDC Procurement", since:"Apr 3", category:"Client" },
    { id:2, what:"NGCP PhilGEPS bid #881 award", who:"BAC Committee", since:"Mar 28", category:"Gov" },
  ],
  crosshairs: [
    { id:1, company:"Aboitiz Power", sector:"Power Generation", estDeal:"₱3–5M", priority:"High", lastAction:"Sent capability deck Mar 20", nextMove:"Follow up with plant manager" },
    { id:2, company:"San Miguel Corporation", sector:"Manufacturing", estDeal:"₱2–4M", priority:"Medium", lastAction:"LinkedIn outreach Mar 15", nextMove:"Request facility visit" },
    { id:3, company:"Pilipinas Shell", sector:"Oil & Gas", estDeal:"₱1–3M", priority:"Watch", lastAction:"No contact yet", nextMove:"Find procurement contact" },
  ],
  nid: 100,
};

export const DEFAULT_MFP: MFPDay = {
  mood: null, moodTime: null,
  mitDone: false, win: "", winDone: false,
  refl: "", reflDone: false,
};
