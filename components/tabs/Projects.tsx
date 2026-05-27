"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import type { Quotation } from "@/lib/constants";

const STAGES = ["RFQ Received","Sourcing","RFQ Submitted","Negotiation","PO Received","In Fulfillment","Delivered","Invoiced","Payment Pending","Closed","Lost","No Offer"] as const;
const VAT_TYPES = ["VAT Inclusive","Zero Rated","Exempt"] as const;
const PAYMENT_TERMS_LIST = ["30 Days","60 Days","COD","Upon Delivery","50% DP 50% Balance"];
const EXPENSE_TYPES = ["COGS","Shipping Cost","Shipping Revenue","Project Expense","OpEx"] as const;
const OPEX_CATS = ["Rent","Utilities","Office Supplies","Fuel / Transport","Meals & Entertainment","Permits & Licenses","Staff Costs","Miscellaneous"];
const PROJECT_EXPENSE_CATS = ["Transport","Packaging","Labor","Customs / Duties","Miscellaneous"];
const PAYMENT_STATUSES = ["Unpaid","Paid","Overdue"] as const;

const STAGE_C: Record<string,{bg:string;fg:string}> = {
  "RFQ Received":{bg:"#f0f2f5",fg:"#4a6a8a"},"Sourcing":{bg:"#F4F3FE",fg:"#534AB7"},
  "RFQ Submitted":{bg:"#EBF3FC",fg:"#185FA5"},"Negotiation":{bg:"#FFF8EC",fg:"#854F0B"},
  "PO Received":{bg:"#FFF8EC",fg:"#854F0B"},"In Fulfillment":{bg:"#FFF3CD",fg:"#856404"},
  "Delivered":{bg:"#f0faf5",fg:"#3B6D11"},"Invoiced":{bg:"#EBF3FC",fg:"#185FA5"},
  "Payment Pending":{bg:"#FFF8EC",fg:"#854F0B"},"Closed":{bg:"#f0f2f5",fg:"#8a9ab0"},
  "Lost":{bg:"#FEF0F0",fg:"#A32D2D"},"No Offer":{bg:"#f0f2f5",fg:"#8a9ab0"},
};
const PAY_C: Record<string,{bg:string;fg:string}> = {
  "Unpaid":{bg:"#FFF8EC",fg:"#854F0B"},"Paid":{bg:"#f0faf5",fg:"#3B6D11"},"Overdue":{bg:"#FEF0F0",fg:"#A32D2D"},
};

type Stage = typeof STAGES[number];
type VatType = typeof VAT_TYPES[number];
type ExpenseType = typeof EXPENSE_TYPES[number];
type PaymentStatus = typeof PAYMENT_STATUSES[number];

interface Project {
  id:string; name:string; client:string; stage:Stage; vatType:VatType;
  rfqDate:string; poDate?:string; invoiceDate?:string; invoiceAmount?:number;
  paymentTerms?:string; paymentDueDate?:string; paymentStatus?:PaymentStatus;
  totalCogs?:number; totalShipping?:number; totalProjectExpenses?:number;
  grossProfit?:number; grossMarginPct?:number;
  linkedDocuments?:string[]; linkedSourcing?:string[]; notes?:string;
  rfqDocument?:string; rfqDocumentName?:string; archived?:boolean;
  rfqDeadline?:string; finalDeliveryDate?:string; rfqNumber?:string;
  rfqSubject?:string; rfqContactPersonId?:number; rfqContactPersonName?:string;
  rfqLineItems?:LocalLineItem[];
  quotations?:Quotation[];
  createdAt:string; updatedAt:string;
}
interface Expense {
  id:string; projectId?:string; projectName?:string; date:string;
  type:ExpenseType; category:string; description:string;
  amount:number; vatApplicable:boolean; vatAmount:number; netAmount:number; createdAt:string;
}

interface CRMDoc { id:string; type:string; number:string; date:string; amount:string; status:string; html?:string; }
interface LocalLineItem { id:string; description:string; quantity:number; unit:string; unitPrice:number; total:number; productId?:string; }
interface CatalogProduct { id:string; code:string; description:string; unit:string; standardPrice:number; category:string; }
interface CatalogSupplier { id:string; name:string; contactPerson:string; email:string; phone:string; categories:string[]; }
interface LocalCRMContact { id:number; name:string; company:string; email?:string; phone?:string; role?:string; }
interface QSSupplier { name:string; type:string; price_range:string; unit:string; stock?:string; lead_time:string; moq:string; certifications?:string; import_notes?:string; notes?:string; url?:string; }
interface QSResult { name:string; summary:string; local_available:boolean; local_suppliers:QSSupplier[]; international_suppliers:QSSupplier[]; recommendation:string; quotation_hint:string; }
interface CRMRFQRecord { id:number; rfqNumber:string; client:string; subject:string; dateSubmitted:string; deadline:string; status:string; notes:string; projectId?:string; documents?:CRMDoc[]; archived?:boolean; lineItems?:LocalLineItem[]; contactPersonId?:number; contactPersonName?:string; }
interface CRMPORecord { id:number; poNumber:string; client:string; items:string; value:string; dateReceived:string; expectedDelivery:string; supplierStatus:string; status:string; notes:string; projectId?:string; documents?:CRMDoc[]; archived?:boolean; }
interface CRMSPORecord { id:number; poNumber:string; supplierId?:string; supplierName:string; projectId?:string; totalAmount:number; expectedDelivery:string; status:string; archived?:boolean; items?:LocalLineItem[]; }
interface CRMStore { pendingRFQs?:CRMRFQRecord[]; pendingPOs?:CRMPORecord[]; supplierPOs?:CRMSPORecord[]; contacts?:LocalCRMContact[]; [key:string]:unknown; }
interface SourcingSession { id:string; query?:string; subject?:string; date?:string; projectId?:string; [key:string]:unknown; }

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function fmt(n?:number) { return n!==undefined ? `₱${n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"; }
function daysSince(dateStr:string) { return Math.floor((Date.now()-new Date(dateStr).getTime())/(1000*60*60*24)); }

const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

function useDebounce<T extends unknown[]>(fn: (...args: T) => void, delay: number): (...args: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback((...args: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
}

export default function Projects() {
  const [view, setView] = useState<"list"|"detail"|"expenses"|"reports">("list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project|null>(null);
  const [selectedPreview, setSelectedPreview] = useState<Project|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [filterStage, setFilterStage] = useState("All");
  const [filterClient, setFilterClient] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expenseTab, setExpenseTab] = useState<"project"|"opex">("project");

  // Reports state
  const _phNow = new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
  const [rptMonth, setRptMonth] = useState(_phNow.getMonth()+1);
  const [rptYear, setRptYear] = useState(_phNow.getFullYear());

  // Assets tab system
  const [assetTab, setAssetTab] = useState<"quotations"|"overview"|"rfqspos"|"sourcing"|"documents">("overview");
  const [allCRM, setAllCRM] = useState<CRMStore>({});
  const [allSourcing, setAllSourcing] = useState<SourcingSession[]>([]);
  const [showLinkRFQ, setShowLinkRFQ] = useState(false);
  const [showLinkPO, setShowLinkPO] = useState(false);
  const [showLinkSourcing, setShowLinkSourcing] = useState(false);
  const [showLinkSPO, setShowLinkSPO] = useState(false);
  const [showNewRFQ, setShowNewRFQ] = useState(false);
  const [showNewSPO, setShowNewSPO] = useState(false);
  const [showQuickSource, setShowQuickSource] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogSuppliers, setCatalogSuppliers] = useState<CatalogSupplier[]>([]);
  const [newRFQForm, setNewRFQForm] = useState({subject:"",deadline:"",status:"Pending",notes:"",contactPersonName:"",lineItems:[] as LocalLineItem[]});
  const [newSPOForm, setNewSPOForm] = useState({supplierName:"",supplierId:"",expectedDelivery:"",status:"Draft",notes:"",items:[] as LocalLineItem[]});
  const [quickSourceItems, setQuickSourceItems] = useState([{name:"",quantity:"1",specs:""}]);
  const [quickSourceResults, setQuickSourceResults] = useState<QSResult[]>([]);
  const [quickSourceLoading, setQuickSourceLoading] = useState(false);
  const [quickSourceSessionName, setQuickSourceSessionName] = useState("");
  const [quickSourceSaved, setQuickSourceSaved] = useState(false);
  const [qsExpandedItem, setQsExpandedItem] = useState<number|null>(null);
  const [qsWebSearch, setQsWebSearch] = useState(true);

  // Quotation overlay
  const [showQuotationOverlay, setShowQuotationOverlay] = useState(false);
  const [quotationOverlayUrl, setQuotationOverlayUrl] = useState("");

  // Inline project name edit
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Local editable fields
  const [migrationBanner, setMigrationBanner] = useState(0);
  const [localNotes, setLocalNotes] = useState("");
  const [plFields, setPLFields] = useState({invoiceAmount:0,totalCogs:0,totalShipping:0,totalProjectExpenses:0});

  // New project form
  const [np, setNP] = useState({name:"",client:"",stage:"RFQ Received" as Stage,vatType:"VAT Inclusive" as VatType,rfqDate:new Date().toISOString().split("T")[0],notes:""});

  // New expense form
  const [ne, setNE] = useState({projectId:"",date:new Date().toISOString().split("T")[0],type:"COGS" as ExpenseType,category:"",description:"",amount:"",vatApplicable:true});

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    fetch("/api/migrate?type=status")
      .then(r => r.json())
      .then(d => { if ((d.orphanedRFQs||0) > 0) setMigrationBanner(d.orphanedRFQs); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLocalNotes(selectedProject?.notes || "");
    if (selectedProject) {
      setPLFields({
        invoiceAmount: selectedProject.invoiceAmount || 0,
        totalCogs: selectedProject.totalCogs || 0,
        totalShipping: selectedProject.totalShipping || 0,
        totalProjectExpenses: selectedProject.totalProjectExpenses || 0,
      });
    }
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject) return;
    setAssetTab("overview");
    setShowQuotationOverlay(false); setQuotationOverlayUrl("");
    setShowLinkRFQ(false); setShowLinkPO(false); setShowLinkSourcing(false); setShowLinkSPO(false);
    setShowNewRFQ(false); setShowNewSPO(false); setShowQuickSource(false);
    setQuickSourceResults([]); setQuickSourceSaved(false); setQsExpandedItem(null);
    setQuickSourceItems([{name:"",quantity:"1",specs:""}]);
    setQuickSourceSessionName(selectedProject.name);
    setNewRFQForm({subject:"",deadline:"",status:"Pending",notes:"",contactPersonName:"",lineItems:[]});
    setNewSPOForm({supplierName:"",supplierId:"",expectedDelivery:"",status:"Draft",notes:"",items:[]});
    const doFetch = async () => {
      try {
        const [crm, src] = await Promise.all([
          kvGet<CRMStore>("crm"),
          kvGet<SourcingSession[]>("sourcing:history"),
        ]);
        setAllCRM(crm || {}); setAllSourcing(src || []);
      } catch(e) { console.error(e); setAllCRM({}); setAllSourcing([]); }
      try {
        const [prodRes, suppRes] = await Promise.all([
          fetch("/api/catalog?type=products"),
          fetch("/api/catalog?type=suppliers"),
        ]);
        const [prodData, suppData] = await Promise.all([prodRes.json(), suppRes.json()]);
        setCatalogProducts(prodData.products||[]);
        setCatalogSuppliers(suppData.suppliers||[]);
      } catch { /* catalog optional */ }
    };
    doFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const updated = (data.projects||[]).map((p:Project) => {
        if (["RFQ Received","Sourcing","RFQ Submitted"].includes(p.stage) && daysSince(p.rfqDate)>30) return {...p, stage:"Lost" as Stage};
        if (p.paymentDueDate && new Date(p.paymentDueDate)<new Date() && p.paymentStatus==="Unpaid") return {...p, paymentStatus:"Overdue" as PaymentStatus};
        return p;
      });
      setProjects(updated);
      setExpenses(data.expenses||[]);
      const autoOpenId = sessionStorage.getItem("openProjectId");
      if (autoOpenId) {
        sessionStorage.removeItem("openProjectId");
        const found = updated.find((p:Project) => p.id === autoOpenId);
        if (found) { setSelectedProject(found); setView("detail" as const); }
      }
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const saveProject = useCallback(async (proj: Project) => {
    setSaving(true);
    const updated = {...proj, updatedAt: new Date().toISOString()};
    try {
      const res = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"saveProject",project:updated}) });
      const data = await res.json();
      setProjects(data.projects||[]);
      if (selectedProject?.id===updated.id) setSelectedProject(updated);
    } catch(e) { console.error(e); }
    setSaving(false);
  }, [selectedProject]);

  const createProject = async () => {
    if (!np.name.trim()||!np.client.trim()) return;
    const proj: Project = { id:genId(), ...np, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    await saveProject(proj);
    setNP({name:"",client:"",stage:"RFQ Received",vatType:"VAT Inclusive",rfqDate:new Date().toISOString().split("T")[0],notes:""});
    setShowNewProject(false);
  };

  const saveExpense = async () => {
    const amt = parseFloat(ne.amount);
    if (!amt||isNaN(amt)) return;
    const proj = projects.find(p=>p.id===ne.projectId);
    const vatAmt = ne.vatApplicable ? amt*0.12 : 0;
    const expense: Expense = {
      id: genId(), projectId:ne.projectId||undefined, projectName:proj?.name,
      date:ne.date, type:ne.type, category:ne.category, description:ne.description,
      amount:amt, vatApplicable:ne.vatApplicable, vatAmount:vatAmt, netAmount:amt+vatAmt,
      createdAt:new Date().toISOString(),
    };
    setSaving(true);
    try {
      const res = await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"saveExpense",expense}) });
      const data = await res.json();
      setExpenses(data.expenses||[]);
      const projRes = await fetch("/api/projects");
      const projData = await projRes.json();
      setProjects(projData.projects||[]);
      if (selectedProject?.id===ne.projectId) setSelectedProject(projData.projects?.find((p:Project)=>p.id===ne.projectId)||null);
    } catch(e) { console.error(e); }
    setSaving(false);
    setNE({projectId:selectedProject?.id||"",date:new Date().toISOString().split("T")[0],type:"COGS",category:"",description:"",amount:"",vatApplicable:true});
    setShowNewExpense(false);
  };

  const deleteExpense = async (id:string) => {
    if (!confirm("Delete this expense?")) return;
    await fetch("/api/projects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"deleteExpense",id}) });
    setExpenses(prev=>prev.filter(e=>e.id!==id));
  };

  const doLinkRFQ = async (rfqId:number) => {
    if (!selectedProject) return;
    const updated = {...allCRM, pendingRFQs:(allCRM.pendingRFQs||[]).map(r=>r.id===rfqId?{...r,projectId:selectedProject.id}:r)};
    await kvSet("crm",updated); setAllCRM(updated);
  };
  const doUnlinkRFQ = async (rfqId:number) => {
    const updated = {...allCRM, pendingRFQs:(allCRM.pendingRFQs||[]).map(r=>{if(r.id!==rfqId)return r;const copy={...r};delete copy.projectId;return copy;})};
    await kvSet("crm",updated); setAllCRM(updated);
  };
  const doLinkPO = async (poId:number) => {
    if (!selectedProject) return;
    const updated = {...allCRM, pendingPOs:(allCRM.pendingPOs||[]).map(p=>p.id===poId?{...p,projectId:selectedProject.id}:p)};
    await kvSet("crm",updated); setAllCRM(updated);
  };
  const doUnlinkPO = async (poId:number) => {
    const updated = {...allCRM, pendingPOs:(allCRM.pendingPOs||[]).map(p=>{if(p.id!==poId)return p;const copy={...p};delete copy.projectId;return copy;})};
    await kvSet("crm",updated); setAllCRM(updated);
  };
  const doLinkSourcing = async (sid:string) => {
    if (!selectedProject) return;
    const updated = allSourcing.map(s=>s.id===sid?{...s,projectId:selectedProject.id}:s);
    await kvSet("sourcing:history",updated); setAllSourcing(updated);
  };
  const doUnlinkSourcing = async (sid:string) => {
    const updated = allSourcing.map(s=>{if(s.id!==sid)return s;const copy={...s};delete copy.projectId;return copy;});
    await kvSet("sourcing:history",updated); setAllSourcing(updated);
  };
  const doLinkSPO = async (spoId:number) => {
    if (!selectedProject) return;
    const updated = {...allCRM, supplierPOs:(allCRM.supplierPOs||[]).map(s=>s.id===spoId?{...s,projectId:selectedProject.id}:s)};
    await kvSet("crm",updated); setAllCRM(updated);
  };
  const doUnlinkSPO = async (spoId:number) => {
    const updated = {...allCRM, supplierPOs:(allCRM.supplierPOs||[]).map(s=>{if(s.id!==spoId)return s;const copy={...s};delete copy.projectId;return copy;})};
    await kvSet("crm",updated); setAllCRM(updated);
  };

  const generateDocNum = async (type:string):Promise<string> => {
    try { const r=await fetch(`/api/docnum?type=${type}`);const d=await r.json();return d.docNumber||`${type}-${Date.now()}`; }
    catch { return `${type}-${Date.now()}`; }
  };

  const liUpdate = (items:LocalLineItem[],idx:number,field:keyof LocalLineItem,value:string|number):LocalLineItem[] =>
    items.map((it,i)=>{
      if(i!==idx) return it;
      const next={...it,[field]:value} as LocalLineItem;
      if(field==="quantity"||field==="unitPrice") next.total=Number(next.quantity)*Number(next.unitPrice);
      return next;
    });

  const saveNewRFQ = async () => {
    if(!selectedProject||!newRFQForm.subject.trim()) return;
    setSaving(true);
    try {
      const docNumber=await generateDocNum("RFQ");
      const crm=await kvGet<CRMStore>("crm")||{};
      const rfqs=crm.pendingRFQs||[];
      const newId=rfqs.length>0?Math.max(...rfqs.map(r=>r.id))+1:1;
      const newRFQ:CRMRFQRecord={
        id:newId,rfqNumber:docNumber,client:selectedProject.client,subject:newRFQForm.subject,
        dateSubmitted:new Date().toISOString().split("T")[0],deadline:newRFQForm.deadline,
        status:newRFQForm.status,notes:newRFQForm.notes,projectId:selectedProject.id,
        lineItems:newRFQForm.lineItems,
        contactPersonName:newRFQForm.contactPersonName||undefined,documents:[],archived:false,
      };
      const updated:CRMStore={...crm,pendingRFQs:[...rfqs,newRFQ]};
      await kvSet("crm",updated); setAllCRM(updated);
      setNewRFQForm({subject:"",deadline:"",status:"Pending",notes:"",contactPersonName:"",lineItems:[]});
      setShowNewRFQ(false);
    } catch(e){console.error(e);}
    setSaving(false);
  };

  const saveNewSPO = async () => {
    if(!selectedProject||!newSPOForm.supplierName.trim()) return;
    setSaving(true);
    try {
      const docNumber=await generateDocNum("SPO");
      const crm=await kvGet<CRMStore>("crm")||{};
      const spos=crm.supplierPOs||[];
      const newId=spos.length>0?Math.max(...spos.map(s=>s.id))+1:1;
      const total=newSPOForm.items.reduce((s,it)=>s+it.total,0);
      const newSPO:CRMSPORecord={
        id:newId,poNumber:docNumber,supplierName:newSPOForm.supplierName,
        supplierId:newSPOForm.supplierId||undefined,projectId:selectedProject.id,
        totalAmount:total,expectedDelivery:newSPOForm.expectedDelivery,
        status:newSPOForm.status,items:newSPOForm.items,archived:false,
      };
      const updated:CRMStore={...crm,supplierPOs:[...spos,newSPO]};
      await kvSet("crm",updated); setAllCRM(updated);
      setNewSPOForm({supplierName:"",supplierId:"",expectedDelivery:"",status:"Draft",notes:"",items:[]});
      setShowNewSPO(false);
    } catch(e){console.error(e);}
    setSaving(false);
  };

  const runQuickSource = async () => {
    const validItems=quickSourceItems.filter(i=>i.name.trim());
    if(!validItems.length) return;
    setQuickSourceLoading(true); setQuickSourceResults([]); setQuickSourceSaved(false);
    try {
      const res=await fetch("/api/sourcing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:validItems.map(i=>({name:i.name,quantity:i.quantity,specs:i.specs})),useWebSearch:qsWebSearch})});
      const data=await res.json();
      setQuickSourceResults(data.items||[]);
      if((data.items||[]).length>0) setQsExpandedItem(0);
    } catch(e){console.error(e);}
    setQuickSourceLoading(false);
  };

  const saveQuickSourceSession = async () => {
    if(!quickSourceResults.length||!selectedProject) return;
    try {
      const history=await kvGet<SourcingSession[]>("sourcing:history")||[];
      const session:SourcingSession={
        id:genId(),
        query:quickSourceSessionName||selectedProject.name,
        subject:quickSourceSessionName||selectedProject.name,
        date:new Date().toISOString().split("T")[0],
        projectId:selectedProject.id,
        items:quickSourceResults as unknown,
        searched_at:new Date().toISOString(),
      };
      const updated=[session,...history].slice(0,20);
      await kvSet("sourcing:history",updated); setAllSourcing(updated); setQuickSourceSaved(true);
    } catch(e){console.error(e);}
  };

  const debouncedSaveNotes = useDebounce((notes: string) => {
    if (!selectedProject) return;
    saveProject({ ...selectedProject, notes });
  }, 800);

  const exportQuickSourceCSV = () => {
    if(!quickSourceResults.length) return;
    const rows:string[][]=[["Item","Summary","Local Available","Supplier","Type","Price Range","Unit","Lead Time","MOQ","Notes"]];
    quickSourceResults.forEach(r=>{
      const allS=[...(r.local_suppliers||[]),...(r.international_suppliers||[])];
      if(!allS.length){rows.push([r.name,r.summary,r.local_available?"Yes":"No","","","","","","",""]);return;}
      allS.forEach(s=>rows.push([r.name,r.summary,r.local_available?"Yes":"No",s.name,s.type,s.price_range,s.unit,s.lead_time,s.moq,s.notes||""]));
    });
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`QuickSource_${selectedProject?.name||"export"}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const QUOT_STATUS_C: Record<string,{bg:string;fg:string}> = {
    "Draft":{bg:"#f0f2f5",fg:"#8a9ab0"},"Sent":{bg:"#EBF3FC",fg:"#185FA5"},
    "Awarded":{bg:"#f0faf5",fg:"#3B6D11"},"Lost":{bg:"#FEF0F0",fg:"#A32D2D"},"No Offer":{bg:"#f0f2f5",fg:"#8a9ab0"},
  };


  // Filtered projects
  const filtered = projects.filter(p => {
    if (showArchived ? !p.archived : p.archived) return false;
    if (filterStage!=="All" && p.stage!==filterStage) return false;
    if (filterClient && !p.client.toLowerCase().includes(filterClient.toLowerCase())) return false;
    return true;
  });

  // Stats
  const openProjects = projects.filter(p=>!["Closed","Lost","No Offer"].includes(p.stage)&&!p.archived).length;
  const overduePayments = projects.filter(p=>p.paymentStatus==="Overdue").length;
  const followUpAlert = projects.filter(p=>["RFQ Received","Sourcing","RFQ Submitted"].includes(p.stage)&&daysSince(p.rfqDate)>=15&&daysSince(p.rfqDate)<=30).length;
  const thisMonth = new Date().toISOString().slice(0,7);
  const monthlyRevenue = projects.filter(p=>p.invoiceDate?.startsWith(thisMonth)).reduce((s,p)=>s+(p.invoiceAmount||0),0);
  const monthlyGP = projects.filter(p=>p.invoiceDate?.startsWith(thisMonth)).reduce((s,p)=>s+(p.grossProfit||0),0);

  const S = {
    card:{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:12,overflow:"hidden"} as React.CSSProperties,
    inp:{fontSize:13,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"} as React.CSSProperties,
    lbl:{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase" as const,color:"#b0bec8",marginBottom:4,display:"block",fontFamily:"'DM Mono',monospace"},
    pill:(bg:string,fg:string):React.CSSProperties=>({fontSize:10,padding:"2px 8px",borderRadius:20,background:bg,color:fg,fontWeight:600,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap",display:"inline-block"}),
    tabBtn:(a:boolean):React.CSSProperties=>({padding:"8px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400}),
    addBtn:{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600} as React.CSSProperties,
  };

  // P&L computed values (from plFields local state)
  const gp = plFields.invoiceAmount - plFields.totalCogs - plFields.totalShipping - plFields.totalProjectExpenses;
  const gm = plFields.invoiceAmount > 0 ? ((gp / plFields.invoiceAmount) * 100).toFixed(1) : null;

  // Derived values for Assets tabs
  type DocWithSource = CRMDoc & {source:string; client:string};
  const linkedRFQs: CRMRFQRecord[] = selectedProject ? (allCRM.pendingRFQs||[]).filter(r=>r.projectId===selectedProject.id) : [];
  const linkedPOs: CRMPORecord[] = selectedProject ? (allCRM.pendingPOs||[]).filter(p=>p.projectId===selectedProject.id) : [];
  const linkedSPOs: CRMSPORecord[] = selectedProject ? (allCRM.supplierPOs||[]).filter(s=>s.projectId===selectedProject.id) : [];
  const linkedSourcing: SourcingSession[] = selectedProject ? (allSourcing||[]).filter(s=>s.projectId===selectedProject.id) : [];
  const allDocs: DocWithSource[] = [
    ...linkedRFQs.flatMap(r=>(r.documents||[]).map(d=>({...d,source:`RFQ ${r.rfqNumber||r.id}`,client:r.client}))),
    ...linkedPOs.flatMap(p=>(p.documents||[]).map(d=>({...d,source:`PO ${p.poNumber||p.id}`,client:p.client}))),
  ];

  const projectExpenses = selectedProject ? expenses.filter(e=>e.projectId===selectedProject.id) : [];

  const handleProjectFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      if (selectedProject) saveProject({...selectedProject, rfqDocument: e.target?.result as string, rfqDocumentName: file.name});
    };
    reader.readAsDataURL(file);
  };

  const handleProjectPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) { handleProjectFile(file); break; }
      }
    }
  };

  return (
    <div style={{flex:1,overflow:"auto"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:5}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Projects</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Pipeline · Finance · Operations</div>
        </div>
        <div style={{display:"flex"}}>
          {(["list","expenses","reports"] as const).map(v=>(
            <button key={v} style={S.tabBtn(view===v)} onClick={()=>{setView(v);setSelectedPreview(null);}}>
              {v==="list"?"Projects":v==="expenses"?"Expenses":"Reports"}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:16}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>

          {/* Migration banner */}
          {migrationBanner > 0 && (
            <div style={{background:"#FFF8EC",border:"0.5px solid #854F0B",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{fontSize:12,color:"#854F0B"}}>{migrationBanner} CRM RFQ{migrationBanner!==1?"s":""} found without a linked project. Run migration to convert them.</div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                <button onClick={()=>fetch("/api/migrate?type=rfqs").then(r=>r.json()).then(()=>{setMigrationBanner(0);loadData();})} style={{fontSize:12,padding:"4px 12px",borderRadius:8,border:"0.5px solid #854F0B",background:"#854F0B",color:"#fff",cursor:"pointer"}}>Migrate Now</button>
                <button onClick={()=>setMigrationBanner(0)} style={{fontSize:12,color:"#854F0B",background:"none",border:"none",cursor:"pointer"}}>Dismiss</button>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
            {[
              ["Open Projects",String(openProjects),"#185FA5","#EBF3FC"],
              ["Follow Up Alerts",String(followUpAlert),"#854F0B","#FFF8EC"],
              ["Overdue Payments",String(overduePayments),"#A32D2D","#FEF0F0"],
              ["Month Revenue",fmt(monthlyRevenue),"#3B6D11","#f0faf5"],
              ["Month Gross Profit",fmt(monthlyGP),monthlyGP>=0?"#3B6D11":"#A32D2D",monthlyGP>=0?"#f0faf5":"#FEF0F0"],
            ].map(([lbl,val,fg,bg])=>(
              <div key={lbl} style={{background:bg as string,border:`0.5px solid ${fg as string}33`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:18,fontWeight:600,color:fg as string,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                <div style={{fontSize:10,color:fg as string,opacity:0.7,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* PROJECTS LIST VIEW */}
          {view==="list"&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <select style={{...S.inp,width:160}} value={filterStage} onChange={e=>setFilterStage(e.target.value)}>
                <option value="All">All Stages</option>
                {STAGES.map(s=><option key={s}>{s}</option>)}
              </select>
              <input style={{...S.inp,width:200}} placeholder="Filter by client..." value={filterClient} onChange={e=>setFilterClient(e.target.value)}/>
              <button onClick={()=>setShowNewProject(s=>!s)} style={S.addBtn}>{showNewProject?"Cancel":"+ New Project"}</button>
              <button onClick={()=>{setShowArchived(s=>!s);setSelectedPreview(null);}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${showArchived?"#854F0B":"#e2e6ea"}`,background:showArchived?"#FFF8EC":"#f8f9fb",color:showArchived?"#854F0B":"#4a6a8a",cursor:"pointer"}}>
                {showArchived?"← Active":"Show Archived"}{!showArchived&&` (${projects.filter(p=>p.archived).length})`}
              </button>
              <button onClick={loadData} style={{fontSize:13,padding:"7px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>↺ Refresh</button>
            </div>

            {showNewProject&&(
              <div style={{...S.card,padding:18,marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"#1a2332",marginBottom:14,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>New Project</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <span style={S.lbl}>Project Name</span>
                    <input style={S.inp} placeholder="e.g. PGPC Wireline Surveillance Apr 2026" value={np.name} onChange={e=>setNP(n=>({...n,name:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>Client</span>
                    <input style={S.inp} placeholder="e.g. PGPC" value={np.client} onChange={e=>setNP(n=>({...n,client:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>RFQ Date</span>
                    <input style={S.inp} type="date" value={np.rfqDate} onChange={e=>setNP(n=>({...n,rfqDate:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>VAT Type</span>
                    <select style={S.inp} value={np.vatType} onChange={e=>setNP(n=>({...n,vatType:e.target.value as VatType}))}>
                      {VAT_TYPES.map(v=><option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <span style={S.lbl}>Notes</span>
                    <input style={S.inp} placeholder="Optional notes" value={np.notes} onChange={e=>setNP(n=>({...n,notes:e.target.value}))}/>
                  </div>
                </div>
                <button onClick={createProject} disabled={saving} style={{...S.addBtn,background:"#1a2332",color:"#fff",borderColor:"#1a2332"}}>
                  {saving?<Spinner/>:<span>Create Project</span>}
                </button>
              </div>
            )}

            {loading?<div style={{textAlign:"center",padding:40,color:"#b0bec8"}}><Spinner/></div>:(
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{...S.card,flex:1,minWidth:0}}>
                  <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"#fafbfc"}}>
                        {["Project Name","Client","Stage","RFQ Date","Invoice","Payment","Gross Profit","Margin","Actions"].map(h=>(
                          <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"9px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:28,color:"#b0bec8",fontSize:13}}>{showArchived?"No archived projects.":"No projects yet."}</td></tr>}
                      {filtered.map((p,i)=>{
                        const rfqDays = daysSince(p.rfqDate);
                        const needsFollowUp = ["RFQ Received","Sourcing","RFQ Submitted"].includes(p.stage) && rfqDays>=15 && rfqDays<=30;
                        return(
                          <tr key={p.id} style={{background:selectedPreview?.id===p.id?"#EBF3FC":i%2===0?"#fff":"#fafbfc",cursor:"pointer"}} onClick={()=>setSelectedPreview(p)}>
                            <td style={{padding:"10px 13px",fontSize:13}}>
                              <div style={{fontWeight:500,color:"#1a2332"}}>{p.name}</div>
                              {needsFollowUp&&<div style={{fontSize:10,color:"#854F0B",fontFamily:"'DM Mono',monospace",marginTop:2}}>⚠ Follow up ({rfqDays}d)</div>}
                            </td>
                            <td style={{padding:"10px 13px",fontSize:13,color:"#4a6a8a"}}>{p.client}</td>
                            <td style={{padding:"10px 13px"}}><span style={S.pill(STAGE_C[p.stage]?.bg||"#f0f2f5",STAGE_C[p.stage]?.fg||"#8a9ab0")}>{p.stage}</span></td>
                            <td style={{padding:"10px 13px",fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{p.rfqDate}</td>
                            <td style={{padding:"10px 13px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"#3B6D11"}}>{fmt(p.invoiceAmount)}</td>
                            <td style={{padding:"10px 13px"}}>
                              {p.paymentStatus?<span style={S.pill(PAY_C[p.paymentStatus]?.bg||"#f0f2f5",PAY_C[p.paymentStatus]?.fg||"#8a9ab0")}>{p.paymentStatus}</span>:"—"}
                              {p.paymentDueDate&&<div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Due: {p.paymentDueDate}</div>}
                            </td>
                            <td style={{padding:"10px 13px",fontSize:13,fontFamily:"'DM Mono',monospace",color:(p.grossProfit||0)>=0?"#3B6D11":"#A32D2D",fontWeight:600}}>{fmt(p.grossProfit)}</td>
                            <td style={{padding:"10px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",color:(p.grossMarginPct||0)>=0?"#3B6D11":"#A32D2D"}}>{p.grossMarginPct!==undefined?`${p.grossMarginPct}%`:"—"}</td>
                            <td style={{padding:"10px 13px"}} onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>{setSelectedProject(p);setSelectedPreview(null);setView("detail" as any);}} style={{fontSize:11,padding:"4px 9px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Open</button>
                              <button onClick={()=>saveProject({...p,archived:!p.archived})} style={{fontSize:11,padding:"4px 9px",borderRadius:6,border:`0.5px solid ${p.archived?"#3B6D11":"#d0d8e0"}`,background:p.archived?"#f0faf5":"#f8f9fb",color:p.archived?"#3B6D11":"#8a9ab0",cursor:"pointer"}}>
                                {p.archived?"Restore":"Archive"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>

                {/* Side preview panel -- push layout with CSS transition */}
                <div style={{width:selectedPreview?360:0,overflow:"hidden",transition:"width 0.2s ease",flexShrink:0}}>
                  <div style={{...S.card,width:360,padding:16}}>
                    {selectedPreview&&(<>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
                        <div style={{flex:1,minWidth:0,paddingRight:8}}>
                          <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:6,lineHeight:1.3}}>{selectedPreview.name}</div>
                          <span style={S.pill(STAGE_C[selectedPreview.stage]?.bg||"#f0f2f5",STAGE_C[selectedPreview.stage]?.fg||"#8a9ab0")}>{selectedPreview.stage}</span>
                        </div>
                        <button onClick={()=>setSelectedPreview(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#b0bec8",padding:0,lineHeight:1,flexShrink:0}}>×</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                        <div>
                          <span style={S.lbl}>RFQ Deadline</span>
                          <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{selectedPreview.rfqDeadline||selectedPreview.rfqDate||"--"}</div>
                        </div>
                        <div>
                          <span style={S.lbl}>Final Delivery</span>
                          <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{selectedPreview.finalDeliveryDate||selectedPreview.poDate||"--"}</div>
                        </div>
                        <div>
                          <span style={S.lbl}>VAT Type</span>
                          <div style={{fontSize:12,color:"#4a6a8a"}}>{selectedPreview.vatType}</div>
                        </div>
                        <div>
                          <span style={S.lbl}>Invoice Amount</span>
                          <div style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#3B6D11"}}>{fmt(selectedPreview.invoiceAmount)}</div>
                        </div>
                        <div>
                          <span style={S.lbl}>Payment</span>
                          <div>{selectedPreview.paymentStatus?<span style={S.pill(PAY_C[selectedPreview.paymentStatus]?.bg||"#f0f2f5",PAY_C[selectedPreview.paymentStatus]?.fg||"#8a9ab0")}>{selectedPreview.paymentStatus}</span>:<span style={{fontSize:12,color:"#b0bec8"}}>--</span>}</div>
                        </div>
                        <div>
                          <span style={S.lbl}>Gross Profit</span>
                          <div style={{fontSize:13,fontWeight:600,fontFamily:"'DM Mono',monospace",color:(selectedPreview.grossProfit||0)>=0?"#3B6D11":"#A32D2D"}}>{fmt(selectedPreview.grossProfit)}</div>
                        </div>
                      </div>
                      <div style={{marginBottom:12}}>
                        <span style={S.lbl}>Notes</span>
                        <textarea
                          style={{...S.inp,minHeight:70,resize:"vertical" as const,fontSize:12}}
                          value={selectedPreview.notes||""}
                          onChange={e=>setSelectedPreview(prev=>prev?{...prev,notes:e.target.value}:null)}
                          onBlur={e=>saveProject({...selectedPreview,notes:e.target.value})}
                          placeholder="Notes..."/>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setSelectedProject(selectedPreview);setSelectedPreview(null);setView("detail" as any);}} style={{...S.addBtn,flex:1,background:"#1a2332",color:"#fff",borderColor:"#1a2332"}}>
                          Open Project →
                        </button>
                        <button onClick={()=>saveProject({...selectedPreview,archived:!selectedPreview.archived})} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${selectedPreview.archived?"#854F0B":"#e2e6ea"}`,background:selectedPreview.archived?"#FFF8EC":"#f8f9fb",color:selectedPreview.archived?"#854F0B":"#4a6a8a",cursor:"pointer"}}>
                          {selectedPreview.archived?"Restore":"Archive"}
                        </button>
                      </div>
                    </>)}
                  </div>
                </div>
              </div>
            )}
          </>}

          {/* PROJECT DETAIL VIEW */}
          {(view as string)==="detail"&&selectedProject&&<>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <button onClick={()=>{setView("list");setSelectedPreview(null);}} style={{fontSize:12,padding:"5px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>← Back</button>
              {editingName
                ? <input
                    autoFocus
                    value={nameInput}
                    onChange={e=>setNameInput(e.target.value)}
                    onBlur={()=>{if(nameInput.trim()&&nameInput.trim()!==selectedProject.name)saveProject({...selectedProject,name:nameInput.trim()});setEditingName(false);}}
                    onKeyDown={e=>{if(e.key==="Enter"){if(nameInput.trim()&&nameInput.trim()!==selectedProject.name)saveProject({...selectedProject,name:nameInput.trim()});setEditingName(false);}if(e.key==="Escape")setEditingName(false);}}
                    style={{fontSize:16,fontWeight:600,color:"#1a2332",flex:1,border:"none",borderBottom:"1.5px solid #185FA5",outline:"none",background:"transparent",fontFamily:"'Plus Jakarta Sans',sans-serif",width:"100%",minWidth:0}}
                  />
                : <div
                    onClick={()=>{setNameInput(selectedProject.name);setEditingName(true);}}
                    title="Click to rename"
                    style={{fontSize:16,fontWeight:600,color:"#1a2332",flex:1,cursor:"text",borderBottom:"1.5px solid transparent"}}
                  >{selectedProject.name}</div>
              }
              <span style={S.pill(STAGE_C[selectedProject.stage]?.bg||"#f0f2f5",STAGE_C[selectedProject.stage]?.fg||"#8a9ab0")}>{selectedProject.stage}</span>
              {saving&&<Spinner/>}
            </div>

            {/* Action bar */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" as const}}>
              <button onClick={()=>{setShowNewRFQ(s=>!s);setShowNewSPO(false);setShowQuickSource(false);}}
                style={{...S.addBtn,background:showNewRFQ?"#1a2332":"#EBF3FC",color:showNewRFQ?"#fff":"#185FA5",borderColor:showNewRFQ?"#1a2332":"#185FA5"}}>
                {showNewRFQ?"✕ Cancel":"+ New RFQ"}
              </button>
              <button onClick={()=>{setShowNewSPO(s=>!s);setShowNewRFQ(false);setShowQuickSource(false);}}
                style={{...S.addBtn,background:showNewSPO?"#1a2332":"#FFF8EC",color:showNewSPO?"#fff":"#854F0B",borderColor:showNewSPO?"#1a2332":"#854F0B"}}>
                {showNewSPO?"✕ Cancel":"+ New Supplier PO"}
              </button>
              <button onClick={()=>{setShowQuickSource(s=>!s);setShowNewRFQ(false);setShowNewSPO(false);}}
                style={{...S.addBtn,background:showQuickSource?"#1a2332":"#f0faf5",color:showQuickSource?"#fff":"#3B6D11",borderColor:showQuickSource?"#1a2332":"#3B6D11"}}>
                {showQuickSource?"✕ Cancel":"⚡ Quick Source"}
              </button>
            </div>

            {/* New RFQ panel */}
            {showNewRFQ&&(
              <div style={{...S.card,padding:16,marginBottom:12,border:"0.5px solid #185FA5"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#185FA5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>New RFQ -- {selectedProject.client}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:12}}>
                  <div style={{gridColumn:"span 2"}}>
                    <span style={S.lbl}>Subject</span>
                    <input style={S.inp} placeholder="e.g. LED lighting supply for Substation A" value={newRFQForm.subject} onChange={e=>setNewRFQForm(f=>({...f,subject:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>Deadline</span>
                    <input style={S.inp} type="date" value={newRFQForm.deadline} onChange={e=>setNewRFQForm(f=>({...f,deadline:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>Status</span>
                    <select style={S.inp} value={newRFQForm.status} onChange={e=>setNewRFQForm(f=>({...f,status:e.target.value}))}>
                      {["Pending","Submitted","Awarded","No Offer","Cancelled"].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={S.lbl}>Contact Person</span>
                    <input style={S.inp} placeholder="Name (optional)" value={newRFQForm.contactPersonName} onChange={e=>setNewRFQForm(f=>({...f,contactPersonName:e.target.value}))}/>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <span style={S.lbl}>Notes</span>
                    <input style={S.inp} placeholder="Optional notes" value={newRFQForm.notes} onChange={e=>setNewRFQForm(f=>({...f,notes:e.target.value}))}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={S.lbl}>Line Items (optional)</span>
                    <button onClick={()=>setNewRFQForm(f=>({...f,lineItems:[...f.lineItems,{id:genId(),description:"",quantity:1,unit:"pc",unitPrice:0,total:0}]}))} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer"}}>+ Add Item</button>
                  </div>
                  {newRFQForm.lineItems.length>0&&(
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#f8f9fb"}}>
                        {["Description","Qty","Unit","Unit Price","Total",""].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {newRFQForm.lineItems.map((li,idx)=>(
                          <tr key={li.id}>
                            <td style={{padding:"3px 4px"}}><input style={{...S.inp,padding:"4px 6px"}} value={li.description} onChange={e=>setNewRFQForm(f=>({...f,lineItems:liUpdate(f.lineItems,idx,"description",e.target.value)}))}/></td>
                            <td style={{padding:"3px 4px",width:60}}><input style={{...S.inp,padding:"4px 6px"}} type="number" value={li.quantity} onChange={e=>setNewRFQForm(f=>({...f,lineItems:liUpdate(f.lineItems,idx,"quantity",Number(e.target.value))}))}/></td>
                            <td style={{padding:"3px 4px",width:60}}><input style={{...S.inp,padding:"4px 6px"}} value={li.unit} onChange={e=>setNewRFQForm(f=>({...f,lineItems:liUpdate(f.lineItems,idx,"unit",e.target.value)}))}/></td>
                            <td style={{padding:"3px 4px",width:100}}><input style={{...S.inp,padding:"4px 6px"}} type="number" value={li.unitPrice} onChange={e=>setNewRFQForm(f=>({...f,lineItems:liUpdate(f.lineItems,idx,"unitPrice",Number(e.target.value))}))}/></td>
                            <td style={{padding:"3px 4px",width:100,fontFamily:"'DM Mono',monospace",color:"#3B6D11",fontSize:12,paddingLeft:8}}>{fmt(li.total)}</td>
                            <td style={{padding:"3px 4px",width:28}}><button onClick={()=>setNewRFQForm(f=>({...f,lineItems:f.lineItems.filter((_,i)=>i!==idx)}))} style={{color:"#d0d8e0",background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <button onClick={saveNewRFQ} disabled={saving||!newRFQForm.subject.trim()} style={{...S.addBtn,background:"#185FA5",color:"#fff",borderColor:"#185FA5",opacity:!newRFQForm.subject.trim()?0.5:1}}>
                  {saving?<Spinner/>:<span>Save RFQ</span>}
                </button>
              </div>
            )}

            {/* New Supplier PO panel */}
            {showNewSPO&&(
              <div style={{...S.card,padding:16,marginBottom:12,border:"0.5px solid #854F0B"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#854F0B",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>New Supplier PO</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:12}}>
                  <div>
                    <span style={S.lbl}>Supplier</span>
                    {catalogSuppliers.length>0&&(
                      <select style={S.inp} value={newSPOForm.supplierId} onChange={e=>{
                        const sup=catalogSuppliers.find(s=>s.id===e.target.value);
                        setNewSPOForm(f=>({...f,supplierId:e.target.value,supplierName:sup?.name||f.supplierName}));
                      }}>
                        <option value="">-- Select from catalog --</option>
                        {catalogSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    {(!newSPOForm.supplierId||!catalogSuppliers.length)&&(
                      <input style={{...S.inp,marginTop:catalogSuppliers.length>0?4:0}} placeholder="Supplier name" value={newSPOForm.supplierName} onChange={e=>setNewSPOForm(f=>({...f,supplierName:e.target.value}))}/>
                    )}
                  </div>
                  <div>
                    <span style={S.lbl}>Expected Delivery</span>
                    <input style={S.inp} type="date" value={newSPOForm.expectedDelivery} onChange={e=>setNewSPOForm(f=>({...f,expectedDelivery:e.target.value}))}/>
                  </div>
                  <div>
                    <span style={S.lbl}>Status</span>
                    <select style={S.inp} value={newSPOForm.status} onChange={e=>setNewSPOForm(f=>({...f,status:e.target.value}))}>
                      {["Draft","Sent","Acknowledged","Partially Delivered","Delivered","Cancelled"].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <span style={S.lbl}>Notes</span>
                    <input style={S.inp} placeholder="Optional notes" value={newSPOForm.notes} onChange={e=>setNewSPOForm(f=>({...f,notes:e.target.value}))}/>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={S.lbl}>Line Items</span>
                    <button onClick={()=>setNewSPOForm(f=>({...f,items:[...f.items,{id:genId(),description:"",quantity:1,unit:"pc",unitPrice:0,total:0}]}))} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"0.5px solid #854F0B",background:"#FFF8EC",color:"#854F0B",cursor:"pointer"}}>+ Add Item</button>
                  </div>
                  {newSPOForm.items.length>0&&<>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#f8f9fb"}}>
                        {["Description","Qty","Unit","Unit Price","Total",""].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {newSPOForm.items.map((li,idx)=>(
                          <tr key={li.id}>
                            <td style={{padding:"3px 4px"}}><input style={{...S.inp,padding:"4px 6px"}} value={li.description} onChange={e=>setNewSPOForm(f=>({...f,items:liUpdate(f.items,idx,"description",e.target.value)}))}/></td>
                            <td style={{padding:"3px 4px",width:60}}><input style={{...S.inp,padding:"4px 6px"}} type="number" value={li.quantity} onChange={e=>setNewSPOForm(f=>({...f,items:liUpdate(f.items,idx,"quantity",Number(e.target.value))}))}/></td>
                            <td style={{padding:"3px 4px",width:60}}><input style={{...S.inp,padding:"4px 6px"}} value={li.unit} onChange={e=>setNewSPOForm(f=>({...f,items:liUpdate(f.items,idx,"unit",e.target.value)}))}/></td>
                            <td style={{padding:"3px 4px",width:100}}><input style={{...S.inp,padding:"4px 6px"}} type="number" value={li.unitPrice} onChange={e=>setNewSPOForm(f=>({...f,items:liUpdate(f.items,idx,"unitPrice",Number(e.target.value))}))}/></td>
                            <td style={{padding:"3px 4px",width:100,fontFamily:"'DM Mono',monospace",color:"#3B6D11",fontSize:12,paddingLeft:8}}>{fmt(li.total)}</td>
                            <td style={{padding:"3px 4px",width:28}}><button onClick={()=>setNewSPOForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}))} style={{color:"#d0d8e0",background:"none",border:"none",cursor:"pointer",fontSize:14}}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{textAlign:"right",fontFamily:"'DM Mono',monospace",fontSize:13,color:"#1a2332",fontWeight:600,paddingTop:6}}>
                      Total: {fmt(newSPOForm.items.reduce((s,it)=>s+it.total,0))}
                    </div>
                  </>}
                </div>
                <button onClick={saveNewSPO} disabled={saving||!newSPOForm.supplierName.trim()} style={{...S.addBtn,background:"#854F0B",color:"#fff",borderColor:"#854F0B",opacity:!newSPOForm.supplierName.trim()?0.5:1}}>
                  {saving?<Spinner/>:<span>Save Supplier PO</span>}
                </button>
              </div>
            )}

            {/* Quick Source panel */}
            {showQuickSource&&(
              <div style={{...S.card,padding:16,marginBottom:12,border:"0.5px solid #3B6D11"}}>
                <div style={{fontSize:12,fontWeight:600,color:"#3B6D11",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>⚡ Quick Source</div>
                <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap" as const}}>
                  <div style={{flex:1,minWidth:200}}>
                    <span style={S.lbl}>Session Name</span>
                    <input style={S.inp} value={quickSourceSessionName} onChange={e=>setQuickSourceSessionName(e.target.value)} placeholder="Name for saving to Sourcing"/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
                    <input type="checkbox" id="qs-web" checked={qsWebSearch} onChange={e=>setQsWebSearch(e.target.checked)}/>
                    <label htmlFor="qs-web" style={{fontSize:12,color:"#4a6a8a",cursor:"pointer"}}>Web search</label>
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={S.lbl}>Items to Source (max 5)</span>
                    <button onClick={()=>setQuickSourceItems(prev=>prev.length<5?[...prev,{name:"",quantity:"1",specs:""}]:prev)} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"0.5px solid #3B6D11",background:"#f0faf5",color:"#3B6D11",cursor:"pointer"}}>+ Item</button>
                  </div>
                  {quickSourceItems.map((item,idx)=>(
                    <div key={idx} style={{display:"grid",gridTemplateColumns:"2fr 1fr 3fr auto",gap:6,marginBottom:6,alignItems:"center"}}>
                      <input style={S.inp} placeholder="Item name" value={item.name} onChange={e=>setQuickSourceItems(prev=>prev.map((x,i)=>i===idx?{...x,name:e.target.value}:x))}/>
                      <input style={S.inp} placeholder="Qty" value={item.quantity} onChange={e=>setQuickSourceItems(prev=>prev.map((x,i)=>i===idx?{...x,quantity:e.target.value}:x))}/>
                      <input style={S.inp} placeholder="Specs (optional)" value={item.specs} onChange={e=>setQuickSourceItems(prev=>prev.map((x,i)=>i===idx?{...x,specs:e.target.value}:x))}/>
                      {quickSourceItems.length>1&&<button onClick={()=>setQuickSourceItems(prev=>prev.filter((_,i)=>i!==idx))} style={{color:"#d0d8e0",background:"none",border:"none",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>}
                    </div>
                  ))}
                </div>
                <button onClick={runQuickSource} disabled={quickSourceLoading||!quickSourceItems.some(i=>i.name.trim())} style={{...S.addBtn,background:"#3B6D11",color:"#fff",borderColor:"#3B6D11",marginBottom:14,opacity:!quickSourceItems.some(i=>i.name.trim())?0.5:1}}>
                  {quickSourceLoading?<><Spinner/>&nbsp;Sourcing...</>:<span>Run Quick Source</span>}
                </button>
                {quickSourceResults.length>0&&(
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:8}}>Results</div>
                    {quickSourceResults.map((r,idx)=>(
                      <div key={idx} style={{border:"0.5px solid #e2e6ea",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
                        <button onClick={()=>setQsExpandedItem(qsExpandedItem===idx?null:idx)} style={{width:"100%",background:"#f8f9fb",border:"none",cursor:"pointer",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",textAlign:"left" as const}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:13,fontWeight:600,color:"#1a2332"}}>{r.name}</span>
                            <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,fontFamily:"'DM Mono',monospace",fontWeight:600,...(r.local_available?{background:"#f0faf5",color:"#3B6D11"}:{background:"#f0f2f5",color:"#8a9ab0"})}}>
                              {r.local_available?"Local Available":"Import"}
                            </span>
                          </div>
                          <span style={{color:"#b0bec8",fontSize:12}}>{qsExpandedItem===idx?"▲":"▼"}</span>
                        </button>
                        {qsExpandedItem===idx&&(
                          <div style={{padding:"12px 14px"}}>
                            <div style={{fontSize:12,color:"#4a6a8a",marginBottom:10,lineHeight:1.5}}>{r.summary}</div>
                            {r.local_suppliers?.length>0&&(
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:10,fontWeight:600,color:"#3B6D11",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:5}}>Local Suppliers</div>
                                {r.local_suppliers.map((s,si)=>(
                                  <div key={si} style={{fontSize:12,padding:"7px 10px",borderRadius:7,background:"#f0faf5",marginBottom:4}}>
                                    <div style={{fontWeight:600,color:"#1a2332"}}>{s.name} <span style={{fontWeight:400,color:"#8a9ab0"}}>({s.type})</span></div>
                                    <div style={{color:"#4a6a8a",marginTop:2}}>{s.price_range} / {s.unit} &middot; Lead: {s.lead_time} &middot; MOQ: {s.moq}</div>
                                    {s.notes&&<div style={{color:"#8a9ab0",marginTop:2,fontSize:11}}>{s.notes}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {r.international_suppliers?.length>0&&(
                              <div style={{marginBottom:10}}>
                                <div style={{fontSize:10,fontWeight:600,color:"#185FA5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace",marginBottom:5}}>International Suppliers</div>
                                {r.international_suppliers.map((s,si)=>(
                                  <div key={si} style={{fontSize:12,padding:"7px 10px",borderRadius:7,background:"#EBF3FC",marginBottom:4}}>
                                    <div style={{fontWeight:600,color:"#1a2332"}}>{s.name} <span style={{fontWeight:400,color:"#8a9ab0"}}>({s.type})</span></div>
                                    <div style={{color:"#4a6a8a",marginTop:2}}>{s.price_range} / {s.unit} &middot; Lead: {s.lead_time} &middot; MOQ: {s.moq}</div>
                                    {s.import_notes&&<div style={{color:"#854F0B",marginTop:2,fontSize:11}}>{s.import_notes}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{padding:"8px 10px",background:"#f4f3fe",borderRadius:7,fontSize:12,color:"#534AB7",marginBottom:8}}>
                              <span style={{fontWeight:600}}>Recommendation: </span>{r.recommendation}
                            </div>
                            <div style={{padding:"8px 10px",background:"#FFF8EC",borderRadius:7,fontSize:12,color:"#854F0B"}}>
                              <span style={{fontWeight:600}}>Quotation Hint: </span>{r.quotation_hint}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button onClick={exportQuickSourceCSV} style={{...S.addBtn,background:"#f0faf5",color:"#3B6D11",borderColor:"#3B6D11"}}>↓ Export CSV</button>
                      <button onClick={saveQuickSourceSession} disabled={quickSourceSaved} style={{...S.addBtn,background:quickSourceSaved?"#f0f2f5":"#EBF3FC",color:quickSourceSaved?"#8a9ab0":"#185FA5",borderColor:quickSourceSaved?"#e2e6ea":"#185FA5"}}>
                        {quickSourceSaved?"Saved to Sourcing":"Save to Sourcing"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Asset tab bar */}
            <div style={{display:"flex",borderBottom:"0.5px solid #e2e6ea",marginBottom:14,background:"#fff",borderRadius:"12px 12px 0 0"}}>
              {(["quotations","overview","rfqspos","sourcing","documents"] as const).map(t=>(
                <button key={t} style={S.tabBtn(assetTab===t)} onClick={()=>setAssetTab(t)}>
                  {t==="quotations"?`Quotations${(selectedProject.quotations||[]).length>0?` (${(selectedProject.quotations||[]).length})`:""}`
                    :t==="overview"?"Overview":t==="rfqspos"?"RFQs & POs":t==="sourcing"?"Sourcing":"Documents"}
                </button>
              ))}
            </div>

            {/* QUOTATIONS TAB */}
            {assetTab==="quotations"&&<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Quotations</div>
                <button onClick={async()=>{
                  const dn=await generateDocNum("QUOT");
                  const url=`/tools/docmaker.html?client=${encodeURIComponent(selectedProject.client)}&subject=${encodeURIComponent(selectedProject.rfqSubject||selectedProject.name)}&rfq=${encodeURIComponent(selectedProject.rfqNumber||"")}&docnum=${encodeURIComponent(dn)}&projectId=${encodeURIComponent(selectedProject.id)}&mode=quotation`;
                  setQuotationOverlayUrl(url);
                  setShowQuotationOverlay(true);
                  document.body.style.overflow="hidden";
                }} style={S.addBtn}>+ New Quotation</button>
              </div>

              {/* Existing quotation cards */}
              {(selectedProject.quotations||[]).length===0&&(
                <div style={{...S.card,padding:32,textAlign:"center",color:"#b0bec8",fontSize:13}}>No quotations yet. Click + New Quotation to create one.</div>
              )}
              {(selectedProject.quotations||[]).map((q,i)=>(
                <div key={q.id} style={{...S.card,padding:"12px 16px",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1,flexWrap:"wrap" as const}}>
                      <span style={{fontSize:11,padding:"1px 7px",borderRadius:20,background:"#f0f2f5",color:"#4a6a8a",fontFamily:"'DM Mono',monospace",fontWeight:600}}>v{q.version||i+1}</span>
                      <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:600,color:"#185FA5"}}>{q.docNumber}</span>
                      <span style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{q.dateCreated}</span>
                      <span style={S.pill(QUOT_STATUS_C[q.status]?.bg||"#f0f2f5",QUOT_STATUS_C[q.status]?.fg||"#8a9ab0")}>{q.status}</span>
                      <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",fontWeight:700,color:"#3B6D11",marginLeft:4}}>{fmt(q.grandTotal)}</span>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button onClick={()=>{if(q.html){const w=window.open("","_blank");if(w){w.document.write(q.html as string);w.document.close();}}else{const url=`/tools/docmaker.html?client=${encodeURIComponent(selectedProject.client)}&subject=${encodeURIComponent(selectedProject.rfqSubject||selectedProject.name)}&rfq=${encodeURIComponent(selectedProject.rfqNumber||"")}&docnum=${encodeURIComponent(q.docNumber)}&projectId=${encodeURIComponent(selectedProject.id)}&mode=quotation&editId=${encodeURIComponent(q.id)}&existingDocnum=${encodeURIComponent(q.docNumber)}`;setQuotationOverlayUrl(url);setShowQuotationOverlay(true);document.body.style.overflow="hidden";}}} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer"}}>View</button>
                      <button onClick={()=>{const url=`/tools/docmaker.html?client=${encodeURIComponent(selectedProject.client)}&subject=${encodeURIComponent(selectedProject.rfqSubject||selectedProject.name)}&rfq=${encodeURIComponent(selectedProject.rfqNumber||"")}&docnum=${encodeURIComponent(q.docNumber)}&projectId=${encodeURIComponent(selectedProject.id)}&mode=quotation&editId=${encodeURIComponent(q.id)}&existingDocnum=${encodeURIComponent(q.docNumber)}`;setQuotationOverlayUrl(url);setShowQuotationOverlay(true);document.body.style.overflow="hidden";}} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Edit</button>
                      <button onClick={async()=>{const dn=await generateDocNum("QUOT");const url=`/tools/docmaker.html?client=${encodeURIComponent(selectedProject.client)}&subject=${encodeURIComponent(selectedProject.rfqSubject||selectedProject.name)}&rfq=${encodeURIComponent(selectedProject.rfqNumber||"")}&docnum=${encodeURIComponent(dn)}&projectId=${encodeURIComponent(selectedProject.id)}&mode=quotation`;setQuotationOverlayUrl(url);setShowQuotationOverlay(true);document.body.style.overflow="hidden";}} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Duplicate</button>
                      <select value={q.status} onChange={e=>{const updated={...q,status:e.target.value as Quotation["status"]};const updProj={...selectedProject,quotations:(selectedProject.quotations||[]).map(x=>x.id===q.id?updated:x)};saveProject(updProj);}} style={{fontSize:11,padding:"3px 8px",borderRadius:7,border:`0.5px solid ${QUOT_STATUS_C[q.status]?.fg||"#e2e6ea"}44`,background:QUOT_STATUS_C[q.status]?.bg||"#f0f2f5",color:QUOT_STATUS_C[q.status]?.fg||"#8a9ab0",fontWeight:600,cursor:"pointer"}}>
                        {(["Draft","Sent","Awarded","Lost","No Offer"] as const).map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

            </>}

            {/* OVERVIEW TAB */}
            {assetTab==="overview"&&<>
              {/* 1. Reference Documents */}
              <div style={{...S.card,padding:16,marginBottom:12}} onPaste={handleProjectPaste}>
                <span style={S.lbl}>Reference Documents</span>
                {!selectedProject.rfqDocument?(
                  <label style={{display:"block",marginTop:8,border:"1.5px dashed #e2e6ea",borderRadius:10,padding:"28px 16px",textAlign:"center" as const,cursor:"pointer",background:"#fafbfc"}}>
                    <input type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleProjectFile(f);}}/>
                    <div style={{fontSize:22,marginBottom:8,color:"#d0d8e0",lineHeight:1}}>↑</div>
                    <div style={{fontSize:13,fontWeight:500,color:"#8a9ab0",marginBottom:4}}>Click to upload or paste (Ctrl+V)</div>
                    <div style={{fontSize:11,color:"#b0bec8"}}>Image or PDF -- reference, RFQ, spec sheet</div>
                  </label>
                ):(
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontSize:12,color:"#4a6a8a",fontFamily:"'DM Mono',monospace"}}>{selectedProject.rfqDocumentName}</span>
                      <button onClick={()=>saveProject({...selectedProject,rfqDocument:undefined,rfqDocumentName:undefined})} style={{fontSize:11,color:"#A32D2D",background:"none",border:"none",cursor:"pointer"}}>Remove</button>
                    </div>
                    {selectedProject.rfqDocumentName?.toLowerCase().endsWith(".pdf")
                      ?<iframe src={selectedProject.rfqDocument} style={{width:"100%",height:420,border:"0.5px solid #e2e6ea",borderRadius:6}}/>
                      :<img src={selectedProject.rfqDocument} alt="reference doc" style={{width:"100%",borderRadius:6,border:"0.5px solid #e2e6ea"}}/>
                    }
                  </div>
                )}
              </div>

              {/* 2. Project Details */}
              <div style={{...S.card,padding:16,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>Project Details</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
                  {[
                    ["Client",selectedProject.client,"client"],
                    ["VAT Type",selectedProject.vatType,"vatType"],
                    ["RFQ Date",selectedProject.rfqDate,"rfqDate"],
                    ["PO Date",selectedProject.poDate||"","poDate"],
                    ["Invoice Date",selectedProject.invoiceDate||"","invoiceDate"],
                    ["Payment Terms",selectedProject.paymentTerms||"","paymentTerms"],
                    ["Payment Due Date",selectedProject.paymentDueDate||"","paymentDueDate"],
                  ].map(([lbl,val,key])=>(
                    <div key={key}>
                      <span style={S.lbl}>{lbl}</span>
                      {key==="vatType"?(
                        <select style={S.inp} value={val} onChange={e=>saveProject({...selectedProject, vatType:e.target.value as VatType})}>
                          {VAT_TYPES.map(v=><option key={v}>{v}</option>)}
                        </select>
                      ):key==="paymentTerms"?(
                        <select style={S.inp} value={val} onChange={e=>{
                          const pt=e.target.value;
                          const invDate=selectedProject.invoiceDate;
                          let dueDate=selectedProject.paymentDueDate||"";
                          if(invDate&&pt.match(/^\d+ Days/)){const days=parseInt(pt);const d=new Date(invDate);d.setDate(d.getDate()+days);dueDate=d.toISOString().split("T")[0];}
                          saveProject({...selectedProject,paymentTerms:pt,paymentDueDate:dueDate});
                        }}>
                          <option value="">-- Select --</option>
                          {PAYMENT_TERMS_LIST.map(t=><option key={t}>{t}</option>)}
                        </select>
                      ):key.includes("Date")?(
                        <input style={S.inp} type="date" value={val} onChange={e=>saveProject({...selectedProject,[key]:e.target.value})}/>
                      ):(
                        <input style={S.inp} value={val} onChange={e=>saveProject({...selectedProject,[key]:e.target.value})}/>
                      )}
                    </div>
                  ))}
                  <div>
                    <span style={S.lbl}>Stage</span>
                    <select style={{...S.inp,background:STAGE_C[selectedProject.stage]?.bg,color:STAGE_C[selectedProject.stage]?.fg,fontWeight:600}} value={selectedProject.stage} onChange={e=>saveProject({...selectedProject,stage:e.target.value as Stage})}>
                      {STAGES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={S.lbl}>Payment Status</span>
                    <select style={{...S.inp,background:PAY_C[selectedProject.paymentStatus||"Unpaid"]?.bg,color:PAY_C[selectedProject.paymentStatus||"Unpaid"]?.fg,fontWeight:600}} value={selectedProject.paymentStatus||"Unpaid"} onChange={e=>saveProject({...selectedProject,paymentStatus:e.target.value as PaymentStatus})}>
                      {PAYMENT_STATUSES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginTop:14,borderTop:"0.5px solid #f0f2f5",paddingTop:12}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#b0bec8",textTransform:"uppercase" as const,letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:8}}>RFQ Details</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
                    <div>
                      <span style={S.lbl}>RFQ Number</span>
                      <div style={{display:"flex",gap:4}}>
                        <input style={{...S.inp,flex:1}} value={selectedProject.rfqNumber||""} onChange={e=>saveProject({...selectedProject,rfqNumber:e.target.value})} placeholder="e.g. RFQ-260518-001"/>
                        {!selectedProject.rfqNumber&&<button onClick={()=>{const d=new Date().toISOString().split("T")[0].replace(/-/g,"").slice(2);const r=Math.floor(Math.random()*900)+100;saveProject({...selectedProject,rfqNumber:`RFQ-${d}-${r}`});}} style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap" as const}}>Gen</button>}
                      </div>
                    </div>
                    <div>
                      <span style={S.lbl}>Contact Person</span>
                      <input style={S.inp} value={selectedProject.rfqContactPersonName||""} onChange={e=>saveProject({...selectedProject,rfqContactPersonName:e.target.value})} placeholder="Procurement contact"/>
                    </div>
                    <div style={{gridColumn:"span 2"}}>
                      <span style={S.lbl}>RFQ Subject</span>
                      <input style={S.inp} value={selectedProject.rfqSubject||""} onChange={e=>saveProject({...selectedProject,rfqSubject:e.target.value})} placeholder="e.g. LED lighting supply for Substation A"/>
                    </div>
                    <div>
                      <span style={S.lbl}>RFQ Deadline</span>
                      <input style={S.inp} type="date" value={selectedProject.rfqDeadline||""} onChange={e=>saveProject({...selectedProject,rfqDeadline:e.target.value})}/>
                    </div>
                    <div>
                      <span style={S.lbl}>Final Delivery</span>
                      <input style={S.inp} type="date" value={selectedProject.finalDeliveryDate||""} onChange={e=>saveProject({...selectedProject,finalDeliveryDate:e.target.value})}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. P&L Summary -- manual inputs */}
              <div style={{...S.card,padding:16,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>P&L Summary</div>

                <div style={{fontSize:10,fontWeight:600,color:"#b0bec8",textTransform:"uppercase" as const,letterSpacing:"0.12em",fontFamily:"'DM Mono',monospace",marginBottom:8}}>Revenue</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:"#4a6a8a"}}>Invoice Amount</span>
                    <span style={S.pill(selectedProject.vatType==="VAT Inclusive"?"#EBF3FC":selectedProject.vatType==="Zero Rated"?"#f0faf5":"#f0f2f5",selectedProject.vatType==="VAT Inclusive"?"#185FA5":selectedProject.vatType==="Zero Rated"?"#3B6D11":"#8a9ab0")}>{selectedProject.vatType}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>₱</span>
                    <input type="number" style={{...S.inp,width:130,textAlign:"right" as const,fontFamily:"'DM Mono',monospace",fontSize:13,padding:"4px 8px"}} value={plFields.invoiceAmount||""} placeholder="0.00"
                      onChange={e=>setPLFields(f=>({...f,invoiceAmount:Number(e.target.value)||0}))}
                      onBlur={()=>saveProject({...selectedProject,invoiceAmount:plFields.invoiceAmount})}/>
                  </div>
                </div>

                <div style={{fontSize:10,fontWeight:600,color:"#b0bec8",textTransform:"uppercase" as const,letterSpacing:"0.12em",fontFamily:"'DM Mono',monospace",marginBottom:8}}>Costs</div>
                {([
                  ["COGS","totalCogs"],
                  ["Shipping Cost","totalShipping"],
                  ["Project Expenses","totalProjectExpenses"],
                ] as [string,"totalCogs"|"totalShipping"|"totalProjectExpenses"][]).map(([lbl,key])=>(
                  <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:11,color:"#A32D2D",fontFamily:"'DM Mono',monospace",fontWeight:700}}>-</span>
                      <span style={{fontSize:12,color:"#4a6a8a"}}>{lbl}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>₱</span>
                      <input type="number" style={{...S.inp,width:130,textAlign:"right" as const,fontFamily:"'DM Mono',monospace",fontSize:13,padding:"4px 8px"}} value={plFields[key]||""} placeholder="0.00"
                        onChange={e=>setPLFields(f=>({...f,[key]:Number(e.target.value)||0}))}
                        onBlur={()=>saveProject({...selectedProject,[key]:plFields[key]})}/>
                    </div>
                  </div>
                ))}

                <div style={{borderTop:"1px solid #1a2332",marginTop:12,paddingTop:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>Gross Profit</span>
                    <span style={{fontSize:18,fontWeight:700,fontFamily:"'DM Mono',monospace",color:gp>=0?"#3B6D11":"#A32D2D"}}>{fmt(gp)}</span>
                  </div>
                  <div style={{textAlign:"right" as const,fontSize:12,fontFamily:"'DM Mono',monospace",color:gp>=0?"#3B6D11":"#A32D2D",marginBottom:4}}>
                    {gm!==null?`${gm}% gross margin`:"--"}
                  </div>
                </div>

                {selectedProject.invoiceDate&&(
                  <div style={{borderTop:"0.5px solid #f0f2f5",marginTop:8,paddingTop:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#8a9ab0"}}>Payment Terms</span>
                      <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#4a6a8a"}}>{selectedProject.paymentTerms||"--"}</span>
                    </div>
                    {selectedProject.paymentDueDate&&(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:12,color:"#8a9ab0"}}>Due Date</span>
                        <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#4a6a8a"}}>{selectedProject.paymentDueDate}</span>
                      </div>
                    )}
                    {selectedProject.paymentStatus&&(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#8a9ab0"}}>Status</span>
                        <span style={S.pill(PAY_C[selectedProject.paymentStatus]?.bg||"#f0f2f5",PAY_C[selectedProject.paymentStatus]?.fg||"#8a9ab0")}>{selectedProject.paymentStatus}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Notes */}
              <div style={{...S.card,padding:16,marginBottom:12}}>
                <span style={S.lbl}>Notes</span>
                <textarea style={{...S.inp,minHeight:80,resize:"vertical" as const}} value={localNotes}
                  onChange={e=>{setLocalNotes(e.target.value);debouncedSaveNotes(e.target.value);}}
                  onBlur={()=>saveProject({...selectedProject,notes:localNotes})}
                  placeholder="Project notes, follow-up actions, client context..."/>
              </div>

              {/* Project Expenses */}
              <div style={{...S.card,marginBottom:12}}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Project Expenses</div>
                  <button onClick={()=>{setNE(n=>({...n,projectId:selectedProject.id,type:"COGS"}));setShowNewExpense(s=>!s);}} style={S.addBtn}>{showNewExpense?"Cancel":"+ Add Expense"}</button>
                </div>
                {showNewExpense&&(
                  <div style={{padding:14,borderBottom:"0.5px solid #f0f2f5",background:"#f8f9fb"}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:10}}>
                      <div><span style={S.lbl}>Date</span><input style={S.inp} type="date" value={ne.date} onChange={e=>setNE(n=>({...n,date:e.target.value}))}/></div>
                      <div><span style={S.lbl}>Type</span>
                        <select style={S.inp} value={ne.type} onChange={e=>setNE(n=>({...n,type:e.target.value as ExpenseType,category:""}))}>
                          {["COGS","Shipping Cost","Shipping Revenue","Project Expense"].map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div><span style={S.lbl}>Category</span>
                        {ne.type==="Project Expense"?(
                          <select style={S.inp} value={ne.category} onChange={e=>setNE(n=>({...n,category:e.target.value}))}>
                            <option value="">-- Select --</option>{PROJECT_EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
                          </select>
                        ):<input style={S.inp} placeholder="e.g. Supplier name" value={ne.category} onChange={e=>setNE(n=>({...n,category:e.target.value}))}/>}
                      </div>
                      <div><span style={S.lbl}>Description</span><input style={S.inp} placeholder="Brief description" value={ne.description} onChange={e=>setNE(n=>({...n,description:e.target.value}))}/></div>
                      <div><span style={S.lbl}>Amount (₱)</span><input style={S.inp} type="number" placeholder="0.00" value={ne.amount} onChange={e=>setNE(n=>({...n,amount:e.target.value}))}/></div>
                      <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
                        <input type="checkbox" checked={ne.vatApplicable} onChange={e=>setNE(n=>({...n,vatApplicable:e.target.checked}))} id="vat-chk"/>
                        <label htmlFor="vat-chk" style={{fontSize:12,color:"#4a6a8a",cursor:"pointer"}}>12% VAT</label>
                      </div>
                    </div>
                    <button onClick={saveExpense} disabled={saving} style={{...S.addBtn,background:"#1a2332",color:"#fff",borderColor:"#1a2332"}}>{saving?<Spinner/>:<span>Save Expense</span>}</button>
                  </div>
                )}
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["Date","Type","Category","Description","Amount","VAT","Net",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {projectExpenses.length===0&&<tr><td colSpan={8} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No expenses yet.</td></tr>}
                      {projectExpenses.map((e,i)=>(
                        <tr key={e.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"8px 13px",fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{e.date}</td>
                          <td style={{padding:"8px 13px",fontSize:12}}><span style={S.pill("#EBF3FC","#185FA5")}>{e.type}</span></td>
                          <td style={{padding:"8px 13px",fontSize:12,color:"#4a6a8a"}}>{e.category||"—"}</td>
                          <td style={{padding:"8px 13px",fontSize:12,color:"#1a2332"}}>{e.description}</td>
                          <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",color:"#A32D2D"}}>{fmt(e.amount)}</td>
                          <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{fmt(e.vatAmount)}</td>
                          <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:500}}>{fmt(e.netAmount)}</td>
                          <td style={{padding:"8px 13px"}}><button onClick={()=>deleteExpense(e.id)} style={{fontSize:11,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            {/* RFQs & POs TAB */}
            {assetTab==="rfqspos"&&<>
              <div style={{...S.card,marginBottom:12}}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Linked RFQs</div>
                  <button onClick={()=>setShowLinkRFQ(true)} style={S.addBtn}>Link RFQ</button>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["RFQ #","Client","Subject","Submitted","Status",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {linkedRFQs.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No linked RFQs. Click "Link RFQ" to connect a CRM record.</td></tr>}
                      {linkedRFQs.map((r,i)=>(
                        <tr key={r.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#185FA5",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{r.rfqNumber||`RFQ-${r.id}`}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#4a6a8a"}}>{r.client}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#1a2332"}}>{r.subject}</td>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{r.dateSubmitted}</td>
                          <td style={{padding:"9px 13px"}}><span style={S.pill("#EBF3FC","#185FA5")}>{r.status}</span></td>
                          <td style={{padding:"9px 13px"}}><button onClick={()=>doUnlinkRFQ(r.id)} style={{fontSize:11,color:"#A32D2D",background:"none",border:"none",cursor:"pointer"}}>Unlink</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={S.card}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Linked POs</div>
                  <button onClick={()=>setShowLinkPO(true)} style={S.addBtn}>Link PO</button>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["PO #","Client","Items","Value","Status",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {linkedPOs.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No linked POs. Click "Link PO" to connect a CRM record.</td></tr>}
                      {linkedPOs.map((p,i)=>(
                        <tr key={p.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#185FA5",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{p.poNumber||`PO-${p.id}`}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#4a6a8a"}}>{p.client}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#1a2332"}}>{p.items}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#3B6D11",fontFamily:"'DM Mono',monospace"}}>{p.value}</td>
                          <td style={{padding:"9px 13px"}}><span style={S.pill("#EBF3FC","#185FA5")}>{p.status}</span></td>
                          <td style={{padding:"9px 13px"}}><button onClick={()=>doUnlinkPO(p.id)} style={{fontSize:11,color:"#A32D2D",background:"none",border:"none",cursor:"pointer"}}>Unlink</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{...S.card,marginTop:12}}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Supplier POs</div>
                  <button onClick={()=>setShowLinkSPO(true)} style={S.addBtn}>Link Supplier PO</button>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["PO #","Supplier","Status","Items","Total","Expected Delivery",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {linkedSPOs.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No linked Supplier POs. Click "Link Supplier PO" to connect a record.</td></tr>}
                      {linkedSPOs.map((s,i)=>(
                        <tr key={s.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#185FA5",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{s.poNumber||`SPO-${s.id}`}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#4a6a8a"}}>{s.supplierName}</td>
                          <td style={{padding:"9px 13px"}}><span style={S.pill("#EBF3FC","#185FA5")}>{s.status}</span></td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#4a6a8a"}}>{(s.items||[]).length} item{(s.items||[]).length!==1?"s":""}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#3B6D11",fontFamily:"'DM Mono',monospace"}}>{s.totalAmount>0?fmt(s.totalAmount):"--"}</td>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{s.expectedDelivery||"--"}</td>
                          <td style={{padding:"9px 13px"}}><button onClick={()=>doUnlinkSPO(s.id)} style={{fontSize:11,color:"#A32D2D",background:"none",border:"none",cursor:"pointer"}}>Unlink</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            {/* SOURCING TAB */}
            {assetTab==="sourcing"&&<>
              <div style={S.card}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Linked Sourcing Sessions</div>
                  <button onClick={()=>setShowLinkSourcing(true)} style={S.addBtn}>Link Session</button>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["Session ID","Query / Subject","Date",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {linkedSourcing.length===0&&<tr><td colSpan={4} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No linked sourcing sessions. Click "Link Session" to connect a sourcing search.</td></tr>}
                      {linkedSourcing.map((s,i)=>(
                        <tr key={s.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{String(s.id).slice(-8)}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#1a2332"}}>{s.query||s.subject||"—"}</td>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{s.date||"—"}</td>
                          <td style={{padding:"9px 13px"}}><button onClick={()=>doUnlinkSourcing(s.id)} style={{fontSize:11,color:"#A32D2D",background:"none",border:"none",cursor:"pointer"}}>Unlink</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            {/* DOCUMENTS TAB */}
            {assetTab==="documents"&&<>
              <div style={S.card}>
                <div style={{padding:"12px 16px",borderBottom:"0.5px solid #f0f2f5"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace"}}>Documents</div>
                  <div style={{fontSize:11,color:"#b0bec8",marginTop:2}}>Saved from Document Maker via linked RFQs and POs</div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead><tr style={{background:"#fafbfc"}}>
                      {["Source","Type","Number","Date","Amount","Status",""].map(h=>(
                        <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {allDocs.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No documents yet. Documents saved from Document Maker will appear here once RFQs or POs are linked.</td></tr>}
                      {allDocs.map((d,i)=>(
                        <tr key={d.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{d.source}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#4a6a8a"}}>{d.type}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#185FA5",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{d.number}</td>
                          <td style={{padding:"9px 13px",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{d.date}</td>
                          <td style={{padding:"9px 13px",fontSize:12,color:"#3B6D11",fontFamily:"'DM Mono',monospace"}}>{d.amount}</td>
                          <td style={{padding:"9px 13px"}}><span style={S.pill("#EBF3FC","#185FA5")}>{d.status}</span></td>
                          <td style={{padding:"9px 13px"}}>
                            {d.html&&<button onClick={()=>{const w=window.open("","_blank");if(w){w.document.write(d.html!);w.document.close();}}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer"}}>View</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}

            {/* LINK RFQ MODAL */}
            {showLinkRFQ&&<>
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200}} onClick={()=>setShowLinkRFQ(false)}/>
              <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",borderRadius:13,padding:20,zIndex:201,width:500,maxHeight:"70vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:4}}>Link RFQ</div>
                <div style={{fontSize:12,color:"#8a9ab0",marginBottom:14}}>Select an RFQ to link to this project</div>
                {(allCRM.pendingRFQs||[]).filter(r=>!r.archived).length===0&&<div style={{color:"#b0bec8",fontSize:12,textAlign:"center",padding:"16px 0"}}>No RFQ records in CRM.</div>}
                {(allCRM.pendingRFQs||[]).filter(r=>!r.archived).map(r=>{
                  const isLinkedHere = r.projectId===selectedProject.id;
                  const isLinkedElsewhere = !!r.projectId && r.projectId!==selectedProject.id;
                  return(
                    <div key={r.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{r.rfqNumber||`RFQ-${r.id}`}</div>
                        <div style={{fontSize:12,color:"#4a6a8a"}}>{r.client} -- {r.subject}</div>
                        {isLinkedElsewhere&&<div style={{fontSize:10,color:"#854F0B",marginTop:1}}>Linked to another project</div>}
                      </div>
                      {isLinkedHere
                        ? <span style={{fontSize:11,color:"#3B6D11",fontWeight:600}}>Linked</span>
                        : <button onClick={()=>doLinkRFQ(r.id)} disabled={isLinkedElsewhere} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #185FA5",background:isLinkedElsewhere?"#f0f2f5":"#EBF3FC",color:isLinkedElsewhere?"#b0bec8":"#185FA5",cursor:isLinkedElsewhere?"not-allowed":"pointer"}}>Link</button>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>setShowLinkRFQ(false)} style={{...S.addBtn,marginTop:14,width:"100%",justifyContent:"center",display:"block",textAlign:"center"}}>Done</button>
              </div>
            </>}

            {/* LINK PO MODAL */}
            {showLinkPO&&<>
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200}} onClick={()=>setShowLinkPO(false)}/>
              <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",borderRadius:13,padding:20,zIndex:201,width:500,maxHeight:"70vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:4}}>Link PO</div>
                <div style={{fontSize:12,color:"#8a9ab0",marginBottom:14}}>Select a PO to link to this project</div>
                {(allCRM.pendingPOs||[]).filter(p=>!p.archived).length===0&&<div style={{color:"#b0bec8",fontSize:12,textAlign:"center",padding:"16px 0"}}>No PO records in CRM.</div>}
                {(allCRM.pendingPOs||[]).filter(p=>!p.archived).map(p=>{
                  const isLinkedHere = p.projectId===selectedProject.id;
                  const isLinkedElsewhere = !!p.projectId && p.projectId!==selectedProject.id;
                  return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{p.poNumber||`PO-${p.id}`}</div>
                        <div style={{fontSize:12,color:"#4a6a8a"}}>{p.client} -- {p.items}</div>
                        {isLinkedElsewhere&&<div style={{fontSize:10,color:"#854F0B",marginTop:1}}>Linked to another project</div>}
                      </div>
                      {isLinkedHere
                        ? <span style={{fontSize:11,color:"#3B6D11",fontWeight:600}}>Linked</span>
                        : <button onClick={()=>doLinkPO(p.id)} disabled={isLinkedElsewhere} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #185FA5",background:isLinkedElsewhere?"#f0f2f5":"#EBF3FC",color:isLinkedElsewhere?"#b0bec8":"#185FA5",cursor:isLinkedElsewhere?"not-allowed":"pointer"}}>Link</button>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>setShowLinkPO(false)} style={{...S.addBtn,marginTop:14,width:"100%",display:"block",textAlign:"center"}}>Done</button>
              </div>
            </>}

            {/* LINK SPO MODAL */}
            {showLinkSPO&&<>
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200}} onClick={()=>setShowLinkSPO(false)}/>
              <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",borderRadius:13,padding:20,zIndex:201,width:500,maxHeight:"70vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:4}}>Link Supplier PO</div>
                <div style={{fontSize:12,color:"#8a9ab0",marginBottom:14}}>Select a Supplier PO to link to this project</div>
                {(allCRM.supplierPOs||[]).filter(s=>!s.archived).length===0&&<div style={{color:"#b0bec8",fontSize:12,textAlign:"center",padding:"16px 0"}}>No Supplier PO records in CRM.</div>}
                {(allCRM.supplierPOs||[]).filter(s=>!s.archived).map(s=>{
                  const isLinkedHere = s.projectId===selectedProject!.id;
                  const isLinkedElsewhere = !!s.projectId && s.projectId!==selectedProject!.id;
                  return(
                    <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{s.poNumber||`SPO-${s.id}`}</div>
                        <div style={{fontSize:12,color:"#4a6a8a"}}>{s.supplierName}</div>
                        {isLinkedElsewhere&&<div style={{fontSize:10,color:"#854F0B",marginTop:1}}>Linked to another project</div>}
                      </div>
                      {isLinkedHere
                        ? <span style={{fontSize:11,color:"#3B6D11",fontWeight:600}}>Linked</span>
                        : <button onClick={()=>doLinkSPO(s.id)} disabled={isLinkedElsewhere} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #185FA5",background:isLinkedElsewhere?"#f0f2f5":"#EBF3FC",color:isLinkedElsewhere?"#b0bec8":"#185FA5",cursor:isLinkedElsewhere?"not-allowed":"pointer"}}>Link</button>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>setShowLinkSPO(false)} style={{...S.addBtn,marginTop:14,width:"100%",display:"block",textAlign:"center"}}>Done</button>
              </div>
            </>}

            {/* LINK SOURCING MODAL */}
            {showLinkSourcing&&<>
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:200}} onClick={()=>setShowLinkSourcing(false)}/>
              <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"#fff",borderRadius:13,padding:20,zIndex:201,width:500,maxHeight:"70vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:4}}>Link Sourcing Session</div>
                <div style={{fontSize:12,color:"#8a9ab0",marginBottom:14}}>Select a sourcing session to link to this project</div>
                {(allSourcing||[]).filter(s=>!s.projectId||s.projectId===selectedProject.id).length===0&&<div style={{color:"#b0bec8",fontSize:12,textAlign:"center",padding:"16px 0"}}>No sourcing sessions available to link.</div>}
                {(allSourcing||[]).filter(s=>!s.projectId||s.projectId===selectedProject.id).map(s=>{
                  const isLinkedHere = s.projectId===selectedProject.id;
                  return(
                    <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                      <div>
                        <div style={{fontSize:12,color:"#1a2332",fontWeight:500}}>{s.query||s.subject||"Untitled session"}</div>
                        <div style={{fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{s.date||""} -- {String(s.id).slice(-8)}</div>
                      </div>
                      {isLinkedHere
                        ? <span style={{fontSize:11,color:"#3B6D11",fontWeight:600}}>Linked</span>
                        : <button onClick={()=>doLinkSourcing(s.id)} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer"}}>Link</button>
                      }
                    </div>
                  );
                })}
                <button onClick={()=>setShowLinkSourcing(false)} style={{...S.addBtn,marginTop:14,width:"100%",display:"block",textAlign:"center"}}>Done</button>
              </div>
            </>}
          </>}

          {/* EXPENSES VIEW -- General OpEx */}
          {view==="expenses"&&<>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              <button onClick={()=>setExpenseTab("project")} style={{...S.tabBtn(expenseTab==="project"),border:"0.5px solid #e2e6ea",borderRadius:8,marginBottom:0}}>Project Expenses</button>
              <button onClick={()=>setExpenseTab("opex")} style={{...S.tabBtn(expenseTab==="opex"),border:"0.5px solid #e2e6ea",borderRadius:8,marginBottom:0}}>General OpEx</button>
              <button onClick={()=>{setNE(n=>({...n,projectId:"",type:expenseTab==="opex"?"OpEx":"COGS"}));setShowNewExpense(s=>!s);}} style={{...S.addBtn,marginLeft:"auto"}}>{showNewExpense?"Cancel":"+ Add Expense"}</button>
            </div>

            {showNewExpense&&(
              <div style={{...S.card,padding:16,marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:10}}>
                  <div><span style={S.lbl}>Date</span><input style={S.inp} type="date" value={ne.date} onChange={e=>setNE(n=>({...n,date:e.target.value}))}/></div>
                  {expenseTab==="project"&&(
                    <div><span style={S.lbl}>Project</span>
                      <select style={S.inp} value={ne.projectId} onChange={e=>setNE(n=>({...n,projectId:e.target.value}))}>
                        <option value="">-- Select Project --</option>
                        {projects.filter(p=>!["Closed","Lost"].includes(p.stage)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div><span style={S.lbl}>Type</span>
                    <select style={S.inp} value={ne.type} onChange={e=>setNE(n=>({...n,type:e.target.value as ExpenseType,category:""}))}>
                      {expenseTab==="opex"?["OpEx"].map(t=><option key={t}>{t}</option>):["COGS","Shipping Cost","Shipping Revenue","Project Expense"].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><span style={S.lbl}>Category</span>
                    <select style={S.inp} value={ne.category} onChange={e=>setNE(n=>({...n,category:e.target.value}))}>
                      <option value="">-- Select --</option>
                      {(expenseTab==="opex"?OPEX_CATS:PROJECT_EXPENSE_CATS).map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><span style={S.lbl}>Description</span><input style={S.inp} placeholder="Brief description" value={ne.description} onChange={e=>setNE(n=>({...n,description:e.target.value}))}/></div>
                  <div><span style={S.lbl}>Amount (₱)</span><input style={S.inp} type="number" placeholder="0.00" value={ne.amount} onChange={e=>setNE(n=>({...n,amount:e.target.value}))}/></div>
                  <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:20}}>
                    <input type="checkbox" checked={ne.vatApplicable} onChange={e=>setNE(n=>({...n,vatApplicable:e.target.checked}))} id="vat-chk2"/>
                    <label htmlFor="vat-chk2" style={{fontSize:12,color:"#4a6a8a",cursor:"pointer"}}>12% VAT</label>
                  </div>
                </div>
                <button onClick={saveExpense} disabled={saving} style={{...S.addBtn,background:"#1a2332",color:"#fff",borderColor:"#1a2332"}}>{saving?<Spinner/>:<span>Save Expense</span>}</button>
              </div>
            )}

            <div style={S.card}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#fafbfc"}}>
                    {["Date","Project","Type","Category","Description","Amount","VAT","Net",""].map(h=>(
                      <th key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",padding:"8px 13px",textAlign:"left",borderBottom:"0.5px solid #f0f2f5",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {expenses.filter(e=>expenseTab==="opex"?e.type==="OpEx":e.type!=="OpEx").length===0&&(
                      <tr><td colSpan={9} style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:12}}>No expenses yet.</td></tr>
                    )}
                    {expenses.filter(e=>expenseTab==="opex"?e.type==="OpEx":e.type!=="OpEx").map((e,i)=>(
                      <tr key={e.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                        <td style={{padding:"8px 13px",fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{e.date}</td>
                        <td style={{padding:"8px 13px",fontSize:12,color:"#4a6a8a"}}>{e.projectName||"—"}</td>
                        <td style={{padding:"8px 13px"}}><span style={S.pill("#EBF3FC","#185FA5")}>{e.type}</span></td>
                        <td style={{padding:"8px 13px",fontSize:12,color:"#4a6a8a"}}>{e.category||"—"}</td>
                        <td style={{padding:"8px 13px",fontSize:12,color:"#1a2332"}}>{e.description}</td>
                        <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",color:"#A32D2D"}}>{fmt(e.amount)}</td>
                        <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{fmt(e.vatAmount)}</td>
                        <td style={{padding:"8px 13px",fontSize:12,fontFamily:"'DM Mono',monospace",fontWeight:500}}>{fmt(e.netAmount)}</td>
                        <td style={{padding:"8px 13px"}}><button onClick={()=>deleteExpense(e.id)} style={{fontSize:11,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>}

          {/* REPORTS VIEW */}
          {view==="reports"&&(()=>{
            const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const YEARS = [2024,2025,2026,2027];
            const rptKey = `${rptYear}-${String(rptMonth).padStart(2,"0")}`;
            const rptLabel = `${MONTH_NAMES[rptMonth-1]} ${rptYear}`;

            // VAT Summary computations
            const monthProjects = projects.filter(p=>p.invoiceDate?.startsWith(rptKey));
            const vatableProjects = monthProjects.filter(p=>p.vatType==="VAT Inclusive");
            const zeroRatedProjects = monthProjects.filter(p=>p.vatType==="Zero Rated");
            const exemptProjects = monthProjects.filter(p=>p.vatType==="Exempt");
            const vatableSales = vatableProjects.reduce((s,p)=>s+(p.invoiceAmount||0),0);
            const zeroRatedSales = zeroRatedProjects.reduce((s,p)=>s+(p.invoiceAmount||0),0);
            const exemptSales = exemptProjects.reduce((s,p)=>s+(p.invoiceAmount||0),0);
            const totalSales = vatableSales+zeroRatedSales+exemptSales;
            const outputVAT = vatableSales*0.12;
            const netVatableSales = vatableSales/1.12;

            const vatExpenses = expenses.filter(e=>e.date?.startsWith(rptKey)&&e.vatApplicable);
            const totalVatablePurchases = vatExpenses.reduce((s,e)=>s+e.amount,0);
            const inputVAT = vatExpenses.reduce((s,e)=>s+e.vatAmount,0);
            const netVatablePurchases = vatExpenses.reduce((s,e)=>s+(e.amount-e.vatAmount),0);
            const vatPayable = outputVAT-inputVAT;

            // P&L computations
            const cogsExpenses = expenses.filter(e=>e.date?.startsWith(rptKey)&&e.type==="COGS");
            const opexExpenses = expenses.filter(e=>e.date?.startsWith(rptKey)&&e.type==="OpEx");
            const totalRevenue = totalSales;
            const totalCOGS = cogsExpenses.reduce((s,e)=>s+e.amount,0);
            const totalOpEx = opexExpenses.reduce((s,e)=>s+e.amount,0);
            const grossProfit = totalRevenue-totalCOGS;
            const netProfit = grossProfit-totalOpEx;
            const grossMarginPct = totalRevenue>0 ? Math.round((grossProfit/totalRevenue)*1000)/10 : 0;
            const netMarginPct = totalRevenue>0 ? Math.round((netProfit/totalRevenue)*1000)/10 : 0;

            // Group COGS by project
            const cogsByProject: Record<string,number> = {};
            cogsExpenses.forEach(e=>{ const k=e.projectName||"Unassigned"; cogsByProject[k]=(cogsByProject[k]||0)+e.amount; });
            // Group OpEx by category
            const opexByCategory: Record<string,number> = {};
            opexExpenses.forEach(e=>{ const k=e.category||"Uncategorized"; opexByCategory[k]=(opexByCategory[k]||0)+e.amount; });

            const hasData = monthProjects.length>0||vatExpenses.length>0||cogsExpenses.length>0||opexExpenses.length>0;

            const exportVATCSV = () => {
              const rows: string[][] = [
                ["Category","Description","Amount","VAT Amount"],
                ["Sales","VATable Sales (12%)",vatableSales.toFixed(2),""],
                ["Sales","Zero Rated Sales",zeroRatedSales.toFixed(2),""],
                ["Sales","VAT Exempt Sales",exemptSales.toFixed(2),""],
                ["Sales","Total Sales",totalSales.toFixed(2),""],
                ["Sales","Output VAT (12%)",outputVAT.toFixed(2),""],
                ["Sales","Net VATable Sales",netVatableSales.toFixed(2),""],
                ["Purchases","Total VATable Purchases",totalVatablePurchases.toFixed(2),""],
                ["Purchases","Input VAT (12%)",inputVAT.toFixed(2),""],
                ["Purchases","Net VATable Purchases",netVatablePurchases.toFixed(2),""],
                ["VAT","Output VAT",outputVAT.toFixed(2),""],
                ["VAT","Less Input VAT",inputVAT.toFixed(2),""],
                ["VAT","VAT Payable / (Creditable)",vatPayable.toFixed(2),""],
              ];
              const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
              a.download = `UltraPower_VAT_${rptKey}.csv`;
              a.click();
            };

            const exportPLCSV = () => {
              const rows: string[][] = [["Section","Description","Client / Category","Amount"]];
              monthProjects.forEach(p=>rows.push(["Revenue",p.name,p.client,String(p.invoiceAmount||0)]));
              rows.push(["Revenue","Total Revenue","",totalRevenue.toFixed(2)]);
              cogsExpenses.forEach(e=>rows.push(["COGS",e.description||e.category,e.projectName||"",e.amount.toFixed(2)]));
              rows.push(["COGS","Total COGS","",totalCOGS.toFixed(2)]);
              opexExpenses.forEach(e=>rows.push(["OpEx",e.description||e.category,e.category||"",e.amount.toFixed(2)]));
              rows.push(["OpEx","Total OpEx","",totalOpEx.toFixed(2)]);
              rows.push(["Summary","Gross Revenue","",totalRevenue.toFixed(2)]);
              rows.push(["Summary","Less Total COGS","",totalCOGS.toFixed(2)]);
              rows.push(["Summary","Gross Profit","",grossProfit.toFixed(2)]);
              rows.push(["Summary","Less Total OpEx","",totalOpEx.toFixed(2)]);
              rows.push(["Summary","Net Operating Profit","",netProfit.toFixed(2)]);
              rows.push(["Summary","Gross Margin %","",`${grossMarginPct}%`]);
              rows.push(["Summary","Net Margin %","",`${netMarginPct}%`]);
              const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
              a.download = `UltraPower_PL_${rptKey}.csv`;
              a.click();
            };

            const mRow = (label:string,value:string,opts?:{bold?:boolean;color?:string;indent?:boolean}) => (
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                <span style={{fontSize:13,color:opts?.color||(opts?.bold?"#1a2332":"#4a6a8a"),fontWeight:opts?.bold?600:400,paddingLeft:opts?.indent?16:0}}>{label}</span>
                <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:opts?.color||"#1a2332",fontWeight:opts?.bold?600:400}}>{value}</span>
              </div>
            );

            const sectionHdr = (label:string) => (
              <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase" as const,color:"#b0bec8",fontFamily:"'DM Mono',monospace",padding:"12px 0 6px",borderBottom:"2px solid #e2e6ea",marginBottom:2}}>{label}</div>
            );

            return (
              <div>
                {/* Month/Year selector */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap" as const}}>
                  <select style={{...S.inp,width:130}} value={rptMonth} onChange={e=>setRptMonth(Number(e.target.value))}>
                    {MONTH_NAMES.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <select style={{...S.inp,width:90}} value={rptYear} onChange={e=>setRptYear(Number(e.target.value))}>
                    {YEARS.map(y=><option key={y}>{y}</option>)}
                  </select>
                  <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                    <button onClick={exportVATCSV} style={{...S.addBtn,background:"#f0faf5",color:"#3B6D11",borderColor:"#3B6D11"}}>↓ VAT CSV</button>
                    <button onClick={exportPLCSV} style={{...S.addBtn,background:"#EBF3FC",color:"#185FA5",borderColor:"#185FA5"}}>↓ P&amp;L CSV</button>
                  </div>
                </div>

                {!hasData?(
                  <div style={{...S.card,padding:32,textAlign:"center",color:"#b0bec8",fontSize:13}}>
                    No financial data for {rptLabel}. Projects must have an invoice date set and expenses must have a date in this month to appear in reports.
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>

                    {/* VAT Summary Report */}
                    <div style={{...S.card,padding:18}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace",marginBottom:14}}>VAT Summary Report -- {rptLabel}</div>

                      {sectionHdr("Sales")}
                      {mRow("VATable Sales (12%)",fmt(vatableSales))}
                      {mRow("Zero Rated Sales",fmt(zeroRatedSales))}
                      {mRow("VAT Exempt Sales",fmt(exemptSales))}
                      {mRow("Total Sales",fmt(totalSales),{bold:true})}
                      {mRow("Output VAT (12%)",fmt(outputVAT),{indent:true,color:"#534AB7"})}
                      {mRow("Net VATable Sales",fmt(netVatableSales),{indent:true,color:"#185FA5"})}

                      {sectionHdr("Purchases")}
                      {mRow("Total VATable Purchases",fmt(totalVatablePurchases))}
                      {mRow("Input VAT (12%)",fmt(inputVAT),{indent:true,color:"#854F0B"})}
                      {mRow("Net VATable Purchases",fmt(netVatablePurchases),{indent:true,color:"#185FA5"})}

                      {sectionHdr("VAT Payable")}
                      {mRow("Output VAT",fmt(outputVAT))}
                      {mRow("Less Input VAT",fmt(inputVAT))}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:"2px solid #1a2332",marginTop:4}}>
                        <span style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>VAT Payable / (Creditable)</span>
                        <span style={{fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:vatPayable>=0?"#A32D2D":"#3B6D11"}}>
                          {vatPayable>=0?fmt(vatPayable):`(${fmt(Math.abs(vatPayable))})`}
                        </span>
                      </div>
                      {vatPayable<0&&<div style={{fontSize:11,color:"#3B6D11",fontFamily:"'DM Mono',monospace",textAlign:"right",marginTop:2}}>Creditable excess input VAT</div>}

                      <div style={{marginTop:14,padding:"10px 12px",borderRadius:8,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontSize:11,color:"#8a9ab0",lineHeight:1.5}}>
                        For reference only. Consult your accountant for official BIR filing.
                      </div>
                    </div>

                    {/* Monthly P&L Summary */}
                    <div style={{...S.card,padding:18}}>
                      <div style={{fontSize:14,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace",marginBottom:14}}>Monthly P&amp;L -- {rptLabel}</div>

                      {sectionHdr("Revenue")}
                      {monthProjects.length===0
                        ? <div style={{fontSize:12,color:"#b0bec8",padding:"8px 0"}}>No invoiced projects this month.</div>
                        : monthProjects.map(p=>(
                          <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                            <div>
                              <div style={{fontSize:12,color:"#1a2332",fontWeight:500}}>{p.name}</div>
                              <div style={{fontSize:10,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{p.client} · {p.vatType}</div>
                            </div>
                            <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#3B6D11"}}>{fmt(p.invoiceAmount)}</span>
                          </div>
                        ))
                      }
                      {monthProjects.length>0&&mRow("Total Revenue",fmt(totalRevenue),{bold:true,color:"#3B6D11"})}

                      {sectionHdr("Cost of Goods Sold")}
                      {Object.keys(cogsByProject).length===0
                        ? <div style={{fontSize:12,color:"#b0bec8",padding:"8px 0"}}>No COGS expenses this month.</div>
                        : Object.entries(cogsByProject).map(([k,v])=>(
                          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                            <span style={{fontSize:12,color:"#4a6a8a"}}>{k}</span>
                            <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#A32D2D"}}>{fmt(v)}</span>
                          </div>
                        ))
                      }
                      {Object.keys(cogsByProject).length>0&&mRow("Total COGS",fmt(totalCOGS),{bold:true,color:"#A32D2D"})}

                      {sectionHdr("Operating Expenses")}
                      {Object.keys(opexByCategory).length===0
                        ? <div style={{fontSize:12,color:"#b0bec8",padding:"8px 0"}}>No OpEx this month.</div>
                        : Object.entries(opexByCategory).map(([k,v])=>(
                          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                            <span style={{fontSize:12,color:"#4a6a8a"}}>{k}</span>
                            <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:"#854F0B"}}>{fmt(v)}</span>
                          </div>
                        ))
                      }
                      {Object.keys(opexByCategory).length>0&&mRow("Total OpEx",fmt(totalOpEx),{bold:true,color:"#854F0B"})}

                      {sectionHdr("Summary")}
                      {mRow("Gross Revenue",fmt(totalRevenue))}
                      {mRow("Less Total COGS",`(${fmt(totalCOGS)})`,{color:"#A32D2D"})}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#1a2332"}}>Gross Profit</span>
                        <span style={{fontSize:13,fontWeight:600,fontFamily:"'DM Mono',monospace",color:grossProfit>=0?"#3B6D11":"#A32D2D"}}>{fmt(grossProfit)}</span>
                      </div>
                      {mRow("Less Total OpEx",`(${fmt(totalOpEx)})`,{color:"#854F0B"})}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:"2px solid #1a2332",marginTop:4}}>
                        <span style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>Net Operating Profit</span>
                        <span style={{fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:netProfit>=0?"#3B6D11":"#A32D2D"}}>{fmt(netProfit)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                        <span style={{fontSize:12,color:"#8a9ab0"}}>Gross Margin</span>
                        <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:grossMarginPct>=0?"#3B6D11":"#A32D2D",fontWeight:600}}>{grossMarginPct}%</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                        <span style={{fontSize:12,color:"#8a9ab0"}}>Net Margin</span>
                        <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:netMarginPct>=0?"#3B6D11":"#A32D2D",fontWeight:600}}>{netMarginPct}%</span>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* Quotation Document Maker overlay */}
      {showQuotationOverlay&&selectedProject&&(
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",flexDirection:"column" as const}}>
          <div style={{height:52,background:"#1a2332",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky" as const,top:0,flexShrink:0}}>
            <span style={{color:"#fff",fontSize:14,fontWeight:600}}>New Quotation -- {selectedProject.name}</span>
            <button onClick={()=>{setShowQuotationOverlay(false);setQuotationOverlayUrl("");document.body.style.overflow="";}} style={{fontSize:13,color:"rgba(255,255,255,0.8)",background:"rgba(255,255,255,0.1)",border:"none",padding:"6px 14px",borderRadius:7,cursor:"pointer"}}>✕ Close</button>
          </div>
          <iframe src={quotationOverlayUrl} style={{width:"100%",height:"calc(100vh - 52px)",border:"none",background:"#fff"}}/>
        </div>
      )}
    </div>
  );
}
