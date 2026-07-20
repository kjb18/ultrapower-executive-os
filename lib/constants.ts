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
  // Use Philippine Time (UTC+8) explicitly to ensure consistent key across devices
  const now = new Date();
  const ph = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  // 3am reset logic
  if (ph.getHours() < 3) ph.setDate(ph.getDate() - 1);
  return `${ph.getFullYear()}-${String(ph.getMonth()+1).padStart(2,"0")}-${String(ph.getDate()).padStart(2,"0")}`;
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

export interface MIT { id: number; text: string; done: boolean; doneAt?: number; clickupId?: string; dueDate?: string; }
export interface MITArchiveEntry { text: string; doneAt: number; dayKey: string; }
export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  doneAt?: number;
  clickupId?: string;
  scheduledDate?: string;
  timeBlockId?: number;
  projectId?: string;
  priority?: "high"|"medium"|"low";
  createdAt: number;
  carriedOver?: boolean;
}
export interface OKR { id: number; objective: string; keyResult: string; current: number; target: number; unit: string; }
export interface KPI { id: number; label: string; value: string; delta: string; up: boolean | null; } // displayed as "Vitals" in UI
export interface TimeBlock { id: number; time: string; label: string; sub: string; type: string; mitId?: number; }
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
  tasks?: TaskItem[];
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
    { id:1, objective:"Revenue Growth", keyResult:"Achieve ₱5M quarterly revenue", current:3.4, target:5, unit:"M₱" },
    { id:2, objective:"Client Acquisition", keyResult:"Close 5 new accounts", current:2, target:5, unit:"clients" },
    { id:3, objective:"Bid Win Rate", keyResult:"Win 80% of submitted bids", current:4, target:5, unit:"bids" },
    { id:4, objective:"System Automation", keyResult:"Deploy Executive OS", current:80, target:100, unit:"%" },
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

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  productId?: string;
}

export interface ProductItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  standardPrice: number;
  category: string;
  supplierId?: string;
  notes?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: number;
  categories: string[];
  notes?: string;
  createdAt: string;
}

export interface CRMDocument {
  id: string;
  type: string;
  number: string;
  date: string;
  amount: string;
  status: string;
  html?: string;
}

export interface PendingRFQ {
  id: number;
  rfqNumber: string;
  client: string;
  subject: string;
  dateSubmitted: string;
  deadline: string;
  status: string;
  notes: string;
  archived?: boolean;
  documents?: CRMDocument[];
  lineItems?: LineItem[];
  contactPersonId?: number;
  contactPersonName?: string;
  projectId?: string;
  docNumber?: string;
}

export interface PendingPO {
  id: number;
  poNumber: string;
  client: string;
  items: string;
  value: string;
  dateReceived: string;
  expectedDelivery: string;
  supplierStatus: string;
  status: string;
  notes: string;
  archived?: boolean;
  documents?: CRMDocument[];
  lineItems?: LineItem[];
  contactPersonId?: number;
  contactPersonName?: string;
  projectId?: string;
  docNumber?: string;
}

export interface SupplierPO {
  id: number;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  projectId?: string;
  clientPoId?: number;
  items: LineItem[];
  totalAmount: number;
  dateIssued: string;
  expectedDelivery: string;
  status: "Draft"|"Sent"|"Acknowledged"|"Partially Delivered"|"Delivered"|"Cancelled";
  paymentTerms: string;
  notes: string;
  archived?: boolean;
}

export const STAGES = [
  "RFQ Received",
  "Sourcing",
  "RFQ Submitted",
  "Negotiation",
  "PO Received",
  "In Fulfillment",
  "Delivered",
  "Invoiced",
  "Payment Pending",
  "Closed",
  "Lost",
  "No Offer",
] as const;

export type Stage = typeof STAGES[number];

export const STAGE_C: Record<string, {bg:string; fg:string}> = {
  "RFQ Received":    {bg:"#f0f2f5",  fg:"#8a9ab0"},
  "Sourcing":        {bg:"#F4F3FE",  fg:"#534AB7"},
  "RFQ Submitted":   {bg:"#EBF3FC",  fg:"#185FA5"},
  "Negotiation":     {bg:"#FFF8EC",  fg:"#854F0B"},
  "PO Received":     {bg:"#FFF8EC",  fg:"#854F0B"},
  "In Fulfillment":  {bg:"#FFF3CD",  fg:"#856404"},
  "Delivered":       {bg:"#f0faf5",  fg:"#3B6D11"},
  "Invoiced":        {bg:"#EBF3FC",  fg:"#185FA5"},
  "Payment Pending": {bg:"#FFF8EC",  fg:"#854F0B"},
  "Closed":          {bg:"#f0f2f5",  fg:"#8a9ab0"},
  "Lost":            {bg:"#FEF0F0",  fg:"#A32D2D"},
  "No Offer":        {bg:"#f0f2f5",  fg:"#8a9ab0"},
};

export interface Quotation {
  id: string;
  version: number;
  docNumber: string;
  dateCreated: string;
  status: "Draft"|"Sent"|"Awarded"|"Lost"|"No Offer";
  lineItems: LineItem[];
  totalAmount: number;
  vatType: "VAT Inclusive"|"Zero Rated"|"Exempt";
  vatAmount: number;
  grandTotal: number;
  notes: string;
  html?: string;
  salutation: "Dear Sir,"|"Dear Ma'am,"|"Dear Sir/Ma'am,";
  validity: string;
  delivery: string;
  warranty: string;
  paymentTerms: string;
}

export interface Project {
  rfqDeadline?: string;
  finalDeliveryDate?: string;
  rfqNumber?: string;
  rfqSubject?: string;
  rfqContactPersonId?: number;
  rfqContactPersonName?: string;
  rfqLineItems?: LineItem[];
  rfqDocument?: string;
  rfqDocumentName?: string;
  quotations?: Quotation[];
  archived?: boolean;
}
