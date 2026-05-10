"use client";
import { useState, useEffect, useCallback } from "react";

const STAGES = ["RFQ Submitted","Negotiation","PO Received","In Fulfillment","Delivered","Invoiced","Payment Pending","Closed","Lost"] as const;
const VAT_TYPES = ["VAT Inclusive","Zero Rated","Exempt"] as const;
const PAYMENT_TERMS_LIST = ["30 Days","60 Days","COD","Upon Delivery","50% DP 50% Balance"];
const EXPENSE_TYPES = ["COGS","Shipping Cost","Shipping Revenue","Project Expense","OpEx"] as const;
const OPEX_CATS = ["Rent","Utilities","Office Supplies","Fuel / Transport","Meals & Entertainment","Permits & Licenses","Staff Costs","Miscellaneous"];
const PROJECT_EXPENSE_CATS = ["Transport","Packaging","Labor","Customs / Duties","Miscellaneous"];
const PAYMENT_STATUSES = ["Unpaid","Paid","Overdue"] as const;

const STAGE_C: Record<string,{bg:string;fg:string}> = {
  "RFQ Submitted":{bg:"#EBF3FC",fg:"#185FA5"},"Negotiation":{bg:"#F4F3FE",fg:"#534AB7"},
  "PO Received":{bg:"#FFF8EC",fg:"#854F0B"},"In Fulfillment":{bg:"#FFF3CD",fg:"#856404"},
  "Delivered":{bg:"#f0faf5",fg:"#3B6D11"},"Invoiced":{bg:"#EBF3FC",fg:"#185FA5"},
  "Payment Pending":{bg:"#FFF8EC",fg:"#854F0B"},"Closed":{bg:"#f0f2f5",fg:"#8a9ab0"},
  "Lost":{bg:"#FEF0F0",fg:"#A32D2D"},
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
  createdAt:string; updatedAt:string;
}
interface Expense {
  id:string; projectId?:string; projectName?:string; date:string;
  type:ExpenseType; category:string; description:string;
  amount:number; vatApplicable:boolean; vatAmount:number; netAmount:number; createdAt:string;
}

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function fmt(n?:number) { return n!==undefined ? `₱${n.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"; }
function daysSince(dateStr:string) { return Math.floor((Date.now()-new Date(dateStr).getTime())/(1000*60*60*24)); }

const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

export default function Projects() {
  const [view, setView] = useState<"list"|"detail"|"expenses">("list");
  const [projects, setProjects] = useState<Project[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [filterStage, setFilterStage] = useState("All");
  const [filterClient, setFilterClient] = useState("");
  const [expenseTab, setExpenseTab] = useState<"project"|"opex">("project");

  // New project form
  const [np, setNP] = useState({name:"",client:"",stage:"RFQ Submitted" as Stage,vatType:"VAT Inclusive" as VatType,rfqDate:new Date().toISOString().split("T")[0],notes:""});

  // New expense form
  const [ne, setNE] = useState({projectId:"",date:new Date().toISOString().split("T")[0],type:"COGS" as ExpenseType,category:"",description:"",amount:"",vatApplicable:true});

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects||[]);
      setExpenses(data.expenses||[]);
      // Auto-flag overdue RFQs
      const updated = (data.projects||[]).map((p:Project) => {
        if (p.stage==="RFQ Submitted" && daysSince(p.rfqDate)>30) return {...p, stage:"Lost" as Stage};
        if (p.paymentDueDate && new Date(p.paymentDueDate)<new Date() && p.paymentStatus==="Unpaid") return {...p, paymentStatus:"Overdue" as PaymentStatus};
        return p;
      });
      setProjects(updated);
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
    setNP({name:"",client:"",stage:"RFQ Submitted",vatType:"VAT Inclusive",rfqDate:new Date().toISOString().split("T")[0],notes:""});
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
      // Refresh projects for updated financials
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

  // Filtered projects
  const filtered = projects.filter(p => {
    if (filterStage!=="All" && p.stage!==filterStage) return false;
    if (filterClient && !p.client.toLowerCase().includes(filterClient.toLowerCase())) return false;
    return true;
  });

  // Stats
  const openProjects = projects.filter(p=>!["Closed","Lost"].includes(p.stage)).length;
  const overduePayments = projects.filter(p=>p.paymentStatus==="Overdue").length;
  const followUpAlert = projects.filter(p=>p.stage==="RFQ Submitted"&&daysSince(p.rfqDate)>=15&&daysSince(p.rfqDate)<=30).length;
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

  const projectExpenses = selectedProject ? expenses.filter(e=>e.projectId===selectedProject.id) : [];

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
          {(["list","expenses"] as const).map(v=>(
            <button key={v} style={S.tabBtn(view===v)} onClick={()=>setView(v)}>
              {v==="list"?"Projects":"Expenses"}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:16}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>

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
              <button onClick={loadData} style={{fontSize:13,padding:"7px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>↺ Refresh</button>
            </div>

            {/* New Project Form */}
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

            {/* Projects table */}
            {loading?<div style={{textAlign:"center",padding:40,color:"#b0bec8"}}><Spinner/></div>:(
              <div style={S.card}>
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
                      {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:"center",padding:28,color:"#b0bec8",fontSize:13}}>No projects yet.</td></tr>}
                      {filtered.map((p,i)=>{
                        const rfqDays = daysSince(p.rfqDate);
                        const needsFollowUp = p.stage==="RFQ Submitted" && rfqDays>=15 && rfqDays<=30;
                        return(
                          <tr key={p.id} style={{background:i%2===0?"#fff":"#fafbfc",cursor:"pointer"}} onClick={()=>{setSelectedProject(p);setView("detail" as any);}}>
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
                              <button onClick={()=>{setSelectedProject(p);setView("detail" as any);}} style={{fontSize:11,padding:"4px 9px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Open</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>}

          {/* PROJECT DETAIL VIEW */}
          {(view as string)==="detail"&&selectedProject&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <button onClick={()=>setView("list")} style={{fontSize:12,padding:"5px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>← Back</button>
              <div style={{fontSize:16,fontWeight:600,color:"#1a2332",flex:1}}>{selectedProject.name}</div>
              <span style={S.pill(STAGE_C[selectedProject.stage]?.bg||"#f0f2f5",STAGE_C[selectedProject.stage]?.fg||"#8a9ab0")}>{selectedProject.stage}</span>
              {saving&&<Spinner/>}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
              {/* Project Info */}
              <div style={{...S.card,padding:16}}>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>Project Details</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
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
                        <select style={S.inp} value={val} onChange={e=>saveProject({...selectedProject,[key]:e.target.value})}>
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
              </div>

              {/* P&L Summary */}
              <div style={{...S.card,padding:16}}>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Mono',monospace",marginBottom:12}}>P&L Summary</div>
                <div style={{marginBottom:10}}>
                  <span style={S.lbl}>Invoice Amount (Revenue)</span>
                  <input style={S.inp} type="number" placeholder="0.00" value={selectedProject.invoiceAmount||""} onChange={e=>saveProject({...selectedProject,invoiceAmount:parseFloat(e.target.value)||0})}/>
                </div>
                {[
                  ["Total COGS",selectedProject.totalCogs||0,"#A32D2D"],
                  ["Total Shipping Cost",selectedProject.totalShipping||0,"#854F0B"],
                  ["Total Project Expenses",selectedProject.totalProjectExpenses||0,"#534AB7"],
                ].map(([lbl,val,clr])=>(
                  <div key={lbl as string} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"0.5px solid #f0f2f5"}}>
                    <span style={{fontSize:12,color:"#4a6a8a"}}>{lbl as string}</span>
                    <span style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:clr as string}}>({fmt(val as number)})</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:"2px solid #1a2332",marginTop:6}}>
                  <span style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>Gross Profit</span>
                  <span style={{fontSize:16,fontWeight:600,fontFamily:"'DM Mono',monospace",color:(selectedProject.grossProfit||0)>=0?"#3B6D11":"#A32D2D"}}>{fmt(selectedProject.grossProfit)}</span>
                </div>
                {selectedProject.grossMarginPct!==undefined&&(
                  <div style={{textAlign:"right",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>Gross Margin: {selectedProject.grossMarginPct}%</div>
                )}
              </div>
            </div>

            {/* Expenses for this project */}
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

            {/* Notes */}
            <div style={{...S.card,padding:16}}>
              <span style={S.lbl}>Notes</span>
              <textarea style={{...S.inp,minHeight:80,resize:"vertical" as const}} value={selectedProject.notes||""}
                onChange={e=>saveProject({...selectedProject,notes:e.target.value})}
                placeholder="Project notes, follow-up actions, client context..."/>
            </div>
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

        </div>
      </div>
    </div>
  );
}
