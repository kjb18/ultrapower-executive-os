"use client";
import { useState, useEffect, useCallback } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import type { ProductItem, Supplier } from "@/lib/constants";

const STAGES = ["Prospecting","Qualified","Proposal","Follow-Up","Negotiation","Closed-Won","Closed-Lost"];
const LABELS = ["Unlabeled","To Reactivate","Key Account","Refer to Alex","Dead Lead","Watch List","Needs Follow-Up"];
const SECTORS = ["Power Generation","Oil & Gas","Manufacturing","Mining","Government / B2G","Food & Beverage","Other"];
const SOURCES = ["Referral","LinkedIn","PhilGEPS","Cold Outreach","Inbound","Event","Other"];
const PO_STATUSES = ["Received","Processing","Ordered from Supplier","Waiting for Delivery","Ready for Delivery","Delivered","Completed"];
const RFQ_STATUSES = ["Draft","Submitted","Followed Up","Awarded","Lost","Cancelled"];
const PAGE_SIZE = 50;

const STAGE_C: Record<string,{bg:string;fg:string}> = {
  "Prospecting":{bg:"#EBF3FC",fg:"#185FA5"},"Qualified":{bg:"#f0faf5",fg:"#3B6D11"},
  "Proposal":{bg:"#FFF8EC",fg:"#854F0B"},"Follow-Up":{bg:"#F4F3FE",fg:"#534AB7"},
  "Negotiation":{bg:"#FEF0F0",fg:"#A32D2D"},"Closed-Won":{bg:"#f0faf5",fg:"#3B6D11"},
  "Closed-Lost":{bg:"#FEF0F0",fg:"#A32D2D"},
};
const LABEL_C: Record<string,{bg:string;fg:string}> = {
  "Unlabeled":{bg:"#f0f2f5",fg:"#b0bec8"},"To Reactivate":{bg:"#FFF8EC",fg:"#854F0B"},
  "Key Account":{bg:"#f0faf5",fg:"#3B6D11"},"Refer to Alex":{bg:"#EBF3FC",fg:"#185FA5"},
  "Dead Lead":{bg:"#FEF0F0",fg:"#A32D2D"},"Watch List":{bg:"#F4F3FE",fg:"#534AB7"},
  "Needs Follow-Up":{bg:"#FEF3FF",fg:"#7B1FA2"},
};
const PO_STATUS_C: Record<string,{bg:string;fg:string}> = {
  "Received":{bg:"#EBF3FC",fg:"#185FA5"},"Processing":{bg:"#FFF8EC",fg:"#854F0B"},
  "Ordered from Supplier":{bg:"#F4F3FE",fg:"#534AB7"},
  "Waiting for Delivery":{bg:"#FFF3CD",fg:"#856404"},
  "Ready for Delivery":{bg:"#f0faf5",fg:"#3B6D11"},
  "Delivered":{bg:"#f0faf5",fg:"#3B6D11"},"Completed":{bg:"#f0f2f5",fg:"#8a9ab0"},
};
const RFQ_STATUS_C: Record<string,{bg:string;fg:string}> = {
  "Draft":{bg:"#f0f2f5",fg:"#8a9ab0"},"Submitted":{bg:"#EBF3FC",fg:"#185FA5"},
  "Followed Up":{bg:"#FFF8EC",fg:"#854F0B"},"Awarded":{bg:"#f0faf5",fg:"#3B6D11"},
  "Lost":{bg:"#FEF0F0",fg:"#A32D2D"},"Cancelled":{bg:"#f0f2f5",fg:"#8a9ab0"},
};

const PRODUCT_CATEGORIES = ["LED Lighting","Mechanical","Electrical","Instrumentation","Safety","Consumables","Other"];
const PAYMENT_TERMS_OPTIONS = ["30 Days","60 Days","COD","Upon Delivery","Consignment"];

interface Prospect { id:number;company:string;contact:string;stage:string;lastAction:string;nextStep:string;nextUpdate:string;notes:string; }
interface Contact { id:number;name:string;company:string;email:string;sector:string;source:string;notes:string;date:string; }
interface CRMDocument { id:string;type:string;number:string;date:string;amount:string;status:string;html?:string; }
interface PendingPO { id:number;poNumber:string;client:string;items:string;value:string;dateReceived:string;expectedDelivery:string;supplierStatus:string;status:string;notes:string;archived?:boolean;documents?:CRMDocument[]; }
interface PendingRFQ { id:number;rfqNumber:string;client:string;subject:string;dateSubmitted:string;deadline:string;status:string;notes:string;archived?:boolean;documents?:CRMDocument[]; }
interface OldContact { _id: string; _label: string; _archived: boolean; [key:string]: string|boolean; }
interface CRMData { prospects:Prospect[];contacts:Contact[];pendingPOs:PendingPO[];pendingRFQs:PendingRFQ[];nid:number; }

const Pill=({t,c}:{t:string;c:{bg:string;fg:string}})=><span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:c.bg,color:c.fg,fontWeight:600,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{t}</span>;

function makeId(r: Record<string,string>): string {
  if (r.Email?.trim()) return r.Email.trim().toLowerCase();
  return `${(r.Name||"").trim().toLowerCase()}__${(r.Company||"").trim().toLowerCase()}`;
}

function parseCSV(text: string): Record<string,string>[] {
  const lines = text.trim().split("\n");
  const hdrs = lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
  return lines.slice(1).map(line=>{
    const cols:string[]=[],s={v:"",q:false};
    for(const ch of line){if(ch==='"'){s.q=!s.q;}else if(ch===','&&!s.q){cols.push(s.v.trim());s.v="";}else s.v+=ch;}
    cols.push(s.v.trim());
    const obj:Record<string,string>={};
    hdrs.forEach((h,i)=>{obj[h]=cols[i]||"";});
    return obj;
  });
}

export default function CRM() {
  const [tab,setTab]=useState<"pipeline"|"contacts"|"old"|"pos"|"rfqs"|"products"|"suppliers">("pipeline");
  const [data,setDataRaw]=useState<CRMData>({prospects:[],contacts:[],pendingPOs:[],pendingRFQs:[],nid:1});
  const [showArchivedPOs, setShowArchivedPOs]=useState(false);
  const [showArchivedRFQs, setShowArchivedRFQs]=useState(false);
  const [oldContacts,setOldContactsRaw]=useState<OldContact[]>([]);
  const [oldQ,setOldQ]=useState("");
  const [oldPg,setOldPg]=useState(1);
  const [showArchived,setShowArchived]=useState(false);
  const [showAddForm,setShowAddForm]=useState(false);
  const [newOld,setNewOld]=useState({Name:"",Email:"",Company:"",Type:"",Priority:"",Status:"",Account:"",Notes:""});
  const [nc,setNC]=useState({name:"",company:"",email:"",sector:"",source:"",notes:""});
  const [loaded,setLoaded]=useState(false);
  const [slideOver, setSlideOver]=useState<{type:"rfq"|"po";id:number}|null>(null);
  const [slideTab, setSlideTab]=useState<"details"|"documents">("details");
  const [products, setProducts]=useState<ProductItem[]>([]);
  const [suppliers, setSuppliers]=useState<Supplier[]>([]);
  const [prodQ, setProdQ]=useState("");
  const [suppQ, setSuppQ]=useState("");
  const [prodForm, setProdForm]=useState<ProductItem|null>(null);
  const [suppForm, setSuppForm]=useState<Supplier|null>(null);
  const [suppCatsInput, setSuppCatsInput]=useState("");

  useEffect(()=>{(async()=>{
    const [d,oc,prodRes,suppRes]=await Promise.all([
      kvGet<CRMData>("crm"),
      kvGet<OldContact[]>("crm:old-contacts"),
      fetch("/api/catalog?type=products").then(r=>r.json()).catch(()=>({data:[]})),
      fetch("/api/catalog?type=suppliers").then(r=>r.json()).catch(()=>({data:[]})),
    ]);
    if(d) setDataRaw({...d,pendingPOs:d.pendingPOs||[],pendingRFQs:d.pendingRFQs||[]});
    if(oc) setOldContactsRaw(oc);
    if(prodRes?.data) setProducts(prodRes.data as ProductItem[]);
    if(suppRes?.data) setSuppliers(suppRes.data as Supplier[]);
    setLoaded(true);
  })();},[]);

  const slideRFQ = slideOver?.type==="rfq" ? (data.pendingRFQs||[]).find(r=>r.id===slideOver.id)||null : null;
  const slidePO = slideOver?.type==="po" ? (data.pendingPOs||[]).find(p=>p.id===slideOver.id)||null : null;

  const setData=useCallback((p:Partial<CRMData>)=>{
    setDataRaw(prev=>{const next={...prev,...p};kvSet("crm",next);return next;});
  },[]);

  const saveOld=(next:OldContact[])=>{setOldContactsRaw(next);kvSet("crm:old-contacts",next);};

  // Pipeline
  const addProspect=()=>{const id=data.nid;setData({prospects:[...data.prospects,{id,company:"New Prospect",contact:"",stage:"Prospecting",lastAction:"",nextStep:"",nextUpdate:"",notes:""}],nid:id+1});};
  const updP=(id:number,p:Partial<Prospect>)=>setData({prospects:data.prospects.map(x=>x.id===id?{...x,...p}:x)});
  const delP=(id:number)=>setData({prospects:data.prospects.filter(x=>x.id!==id)});

  // New Contacts
  const addContact=()=>{
    if(!nc.name.trim()&&!nc.company.trim())return;
    const id=data.nid;
    setData({contacts:[...data.contacts,{...nc,id,date:new Date().toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}],nid:id+1});
    setNC({name:"",company:"",email:"",sector:"",source:"",notes:""});
  };
  const delC=(id:number)=>setData({contacts:data.contacts.filter(x=>x.id!==id)});

  // POs
  const addPO=()=>{const id=data.nid;setData({pendingPOs:[...(data.pendingPOs||[]),{id,poNumber:"",client:"",items:"",value:"",dateReceived:"",expectedDelivery:"",supplierStatus:"",status:"Received",notes:"",archived:false}],nid:id+1});};
  const updPO=(id:number,p:Partial<PendingPO>)=>setData({pendingPOs:(data.pendingPOs||[]).map(x=>x.id===id?{...x,...p}:x)});
  const delPO=(id:number)=>setData({pendingPOs:(data.pendingPOs||[]).filter(x=>x.id!==id)});
  const archivePO=(id:number)=>setData({pendingPOs:(data.pendingPOs||[]).map(x=>x.id===id?{...x,archived:!x.archived}:x)});

  // RFQs
  const addRFQ=()=>{const id=data.nid;setData({pendingRFQs:[...(data.pendingRFQs||[]),{id,rfqNumber:"",client:"",subject:"",dateSubmitted:"",deadline:"",status:"Submitted",notes:"",archived:false}],nid:id+1});};
  const updRFQ=(id:number,p:Partial<PendingRFQ>)=>setData({pendingRFQs:(data.pendingRFQs||[]).map(x=>x.id===id?{...x,...p}:x)});
  const delRFQ=(id:number)=>setData({pendingRFQs:(data.pendingRFQs||[]).filter(x=>x.id!==id)});
  const archiveRFQ=(id:number)=>setData({pendingRFQs:(data.pendingRFQs||[]).map(x=>x.id===id?{...x,archived:!x.archived}:x)});

  // Catalog
  const genId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const saveProducts=async(action:"save"|"delete",item:ProductItem)=>{
    const res=await fetch("/api/catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"products",action,item})});
    const json=await res.json();
    if(json.data)setProducts(json.data as ProductItem[]);
  };
  const saveSuppliers=async(action:"save"|"delete",item:Supplier)=>{
    const res=await fetch("/api/catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"suppliers",action,item})});
    const json=await res.json();
    if(json.data)setSuppliers(json.data as Supplier[]);
  };

  // Old contacts -- CSV merge
  const handleCSV=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const rows=parseCSV(ev.target?.result as string);
      const existing=[...oldContacts];
      const existingIds=new Set(existing.map(c=>c._id));
      let added=0;
      rows.forEach(r=>{
        const id=makeId(r);
        if(!existingIds.has(id)){
          existing.push({...r,_id:id,_label:"Unlabeled",_archived:false});
          existingIds.add(id);
          added++;
        }
      });
      saveOld(existing);
      alert(`Merged. ${added} new contacts added, ${rows.length-added} duplicates skipped.`);
    };
    reader.readAsText(file);
    e.target.value="";
  };

  // Old contacts -- add individual
  const addOldContact=()=>{
    if(!newOld.Name.trim()&&!newOld.Company.trim())return;
    const id=makeId(newOld as Record<string,string>);
    if(oldContacts.some(c=>c._id===id)){alert("A contact with this email or name/company already exists.");return;}
    saveOld([{...newOld,_id:id,_label:"Unlabeled",_archived:false},...oldContacts]);
    setNewOld({Name:"",Email:"",Company:"",Type:"",Priority:"",Status:"",Account:"",Notes:""});
    setShowAddForm(false);
  };

  // Old contacts -- label
  const setLabel=(id:string,lbl:string)=>saveOld(oldContacts.map(c=>c._id===id?{...c,_label:lbl}:c));

  // Old contacts -- archive / unarchive
  const toggleArchive=(id:string)=>saveOld(oldContacts.map(c=>c._id===id?{...c,_archived:!c._archived}:c));

  // Old contacts -- delete
  const deleteOld=(id:string)=>{if(confirm("Permanently delete this contact?"))saveOld(oldContacts.filter(c=>c._id!==id));};

  // Filter & paginate old contacts
  const ql=oldQ.toLowerCase();
  const filtered=oldContacts.filter(c=>{
    const archived=!!c._archived;
    if(archived!==showArchived)return false;
    if(!ql)return true;
    return (String(c.Name||"")).toLowerCase().includes(ql)||(String(c.Company||"")).toLowerCase().includes(ql)||(String(c.Email||"")).toLowerCase().includes(ql);
  });
  const totPg=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const slice=filtered.slice((oldPg-1)*PAGE_SIZE,oldPg*PAGE_SIZE);
  const activeCount=oldContacts.filter(c=>!c._archived).length;
  const archivedCount=oldContacts.filter(c=>!!c._archived).length;

  const S={
    panel:{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:12,overflow:"hidden"} as React.CSSProperties,
    th:{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase" as const,color:"#b0bec8",padding:"9px 13px",textAlign:"left" as const,borderBottom:"0.5px solid #f0f2f5",background:"#fafbfc",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap" as const},
    td:{fontSize:13,color:"#3a4a5a",padding:"9px 13px",borderBottom:"0.5px solid #f0f2f5",verticalAlign:"middle" as const} as React.CSSProperties,
    inp:{fontSize:13,padding:"7px 9px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"} as React.CSSProperties,
    tabBtn:(a:boolean)=>({padding:"9px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400,whiteSpace:"nowrap" as const}) as React.CSSProperties,
    addBtn:{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600} as React.CSSProperties,
  };

  const pos=data.pendingPOs||[];
  const rfqs=data.pendingRFQs||[];

  if(!loaded)return<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:13,fontFamily:"'DM Mono',monospace"}}>Loading CRM...</div>;

  return(
    <div style={{flex:1,overflow:"auto"}}>
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5,height:56,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>CRM</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Industrial Sales Intelligence</div>
        </div>
        <div style={{display:"flex",overflowX:"auto"}}>
          {(["pipeline","contacts","old","pos","rfqs","products","suppliers"] as const).map(t=>(
            <button key={t} style={S.tabBtn(tab===t)} onClick={()=>setTab(t)}>
              {t==="pipeline"?"Pipeline":t==="contacts"?"New Contacts":t==="old"?"Old Contacts":t==="pos"?"Pending POs"+(pos.length>0?` (${pos.length})`:""):t==="rfqs"?"Pending RFQs"+(rfqs.length>0?` (${rfqs.length})`:""):t==="products"?"Products"+(products.length>0?` (${products.length})`:""):"Suppliers"+(suppliers.length>0?` (${suppliers.length})`:"")}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:16}}>

        {/* PIPELINE */}
        {tab==="pipeline"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1a2332"}}>Active Prospects</span>
              <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{data.prospects.length}</span>
            </div>
            <button onClick={addProspect} style={S.addBtn}>+ Add Prospect</button>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Company","Contact","Stage","Last Action","Next Step","Next Update","Notes",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.prospects.length===0&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"28px"}}>No prospects yet.</td></tr>}
                  {data.prospects.map((p,i)=>(
                    <tr key={p.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                      <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                      <td style={S.td}><input style={S.inp} value={p.company} onChange={e=>updP(p.id,{company:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.contact} onChange={e=>updP(p.id,{contact:e.target.value})}/></td>
                      <td style={S.td}>
                        <select style={{...S.inp,background:STAGE_C[p.stage]?.bg||"#f8f9fb",color:STAGE_C[p.stage]?.fg||"#3a4a5a",fontWeight:600}} value={p.stage} onChange={e=>updP(p.id,{stage:e.target.value})}>
                          {STAGES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><input style={S.inp} value={p.lastAction} onChange={e=>updP(p.id,{lastAction:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.nextStep} onChange={e=>updP(p.id,{nextStep:e.target.value})}/></td>
                      <td style={S.td}><input style={{...S.inp,width:130}} type="date" value={p.nextUpdate} onChange={e=>updP(p.id,{nextUpdate:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.notes} onChange={e=>updP(p.id,{notes:e.target.value})}/></td>
                      <td style={S.td}><button onClick={()=>delP(p.id)} style={{fontSize:13,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* NEW CONTACTS */}
        {tab==="contacts"&&<>
          <div style={{...S.panel,padding:18,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Add New Contact</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:14}}>
              {([["Name","name","text","Full name"],["Company","company","text","Company"],["Email","email","email","email@domain.com"]] as [string,string,string,string][]).map(([lbl,k,t,ph])=>(
                <div key={k}>
                  <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                  <input style={S.inp} type={t} placeholder={ph} value={(nc as Record<string,string>)[k]} onChange={e=>setNC(n=>({...n,[k]:e.target.value}))}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Sector</div>
                <select style={S.inp} value={nc.sector} onChange={e=>setNC(n=>({...n,sector:e.target.value}))}>
                  <option value="">-- Select --</option>{SECTORS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Source</div>
                <select style={S.inp} value={nc.source} onChange={e=>setNC(n=>({...n,source:e.target.value}))}>
                  <option value="">-- Select --</option>{SOURCES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Notes</div>
                <input style={S.inp} placeholder="Optional" value={nc.notes} onChange={e=>setNC(n=>({...n,notes:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addContact} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Contact</button>
              <button onClick={()=>setNC({name:"",company:"",email:"",sector:"",source:"",notes:""})} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Clear</button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:600,color:"#1a2332"}}>Contact Log</span>
            <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{data.contacts.length}</span>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Name","Company","Email","Sector","Source","Notes","Date",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.contacts.length===0&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"28px"}}>No contacts yet.</td></tr>}
                  {data.contacts.map((c,i)=>(
                    <tr key={c.id}>
                      <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                      <td style={{...S.td,fontWeight:500}}>{c.name||"—"}</td>
                      <td style={S.td}>{c.company||"—"}</td>
                      <td style={{...S.td,color:"#185FA5"}}>{c.email||"—"}</td>
                      <td style={S.td}>{c.sector?<Pill t={c.sector} c={{bg:"#f0faf5",fg:"#3B6D11"}}/>:"—"}</td>
                      <td style={S.td}>{c.source||"—"}</td>
                      <td style={{...S.td,color:"#8a9ab0"}}>{c.notes||"—"}</td>
                      <td style={{...S.td,color:"#b0bec8",fontFamily:"'DM Mono',monospace",fontSize:11,whiteSpace:"nowrap"}}>{c.date}</td>
                      <td style={S.td}><button onClick={()=>delC(c.id)} style={{fontSize:13,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* OLD CONTACTS */}
        {tab==="old"&&<>
          {/* Toolbar */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <label style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600}}>
              Upload CSV (merge)<input type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
            </label>
            <button onClick={()=>setShowAddForm(s=>!s)} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontWeight:500}}>
              {showAddForm?"Cancel":"+ Add Contact"}
            </button>
            <input style={{...S.inp,width:240,flex:"none"}} placeholder="Search name, company, email..." value={oldQ} onChange={e=>{setOldQ(e.target.value);setOldPg(1);}}/>
            <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
              <button onClick={()=>{setShowArchived(false);setOldPg(1);}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${!showArchived?"#185FA5":"#e2e6ea"}`,background:!showArchived?"#EBF3FC":"#fff",color:!showArchived?"#185FA5":"#8a9ab0",cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
                Active ({activeCount})
              </button>
              <button onClick={()=>{setShowArchived(true);setOldPg(1);}} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${showArchived?"#854F0B":"#e2e6ea"}`,background:showArchived?"#FFF8EC":"#fff",color:showArchived?"#854F0B":"#8a9ab0",cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
                Archived ({archivedCount})
              </button>
            </div>
          </div>

          {/* Add contact form */}
          {showAddForm&&(
            <div style={{...S.panel,padding:18,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:12,fontFamily:"'DM Mono',monospace"}}>Add Contact Manually</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:12}}>
                {(["Name","Email","Company","Type","Priority","Status","Account","Notes"] as const).map(k=>(
                  <div key={k}>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{k}</div>
                    <input style={S.inp} value={newOld[k]} placeholder={k==="Priority"?"A / B / C":k==="Notes"?"Optional":""} onChange={e=>setNewOld(n=>({...n,[k]:e.target.value}))}/>
                  </div>
                ))}
              </div>
              <button onClick={addOldContact} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Contact</button>
            </div>
          )}

          {/* Table */}
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Name & Label","Email","Company","Type","Priority","Status","Account","First Contact","Last Contact","Emails","Unanswered","Cold","Actions"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {slice.length===0&&(
                    <tr><td colSpan={14} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"28px"}}>
                      {oldContacts.length===0?"Upload a CSV or add a contact to begin.":showArchived?"No archived contacts.":"No contacts found."}
                    </td></tr>
                  )}
                  {slice.map((r,i)=>{
                    const lbl=String(r._label||"Unlabeled");
                    const lc=LABEL_C[lbl]||LABEL_C["Unlabeled"];
                    return(
                      <tr key={r._id as string} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{(oldPg-1)*PAGE_SIZE+i+1}</td>
                        <td style={{...S.td,minWidth:200}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontWeight:500,fontSize:13}}>{String(r.Name||"—")}</span>
                            <select style={{fontSize:11,padding:"2px 7px",borderRadius:20,border:`0.5px solid ${lc.fg}44`,background:lc.bg,color:lc.fg,fontWeight:600,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}
                              value={lbl} onChange={e=>setLabel(r._id as string,e.target.value)}>
                              {LABELS.map(l=><option key={l}>{l}</option>)}
                            </select>
                          </div>
                        </td>
                        <td style={{...S.td,color:"#185FA5",fontSize:12}}>{String(r.Email||"—")}</td>
                        <td style={S.td}>{String(r.Company||"—")}</td>
                        <td style={{...S.td,color:"#8a9ab0"}}>{String(r.Type||"—")}</td>
                        <td style={S.td}>{r.Priority?<Pill t={String(r.Priority)} c={r.Priority==="A"?{bg:"#FFF8EC",fg:"#854F0B"}:r.Priority==="B"?{bg:"#EBF3FC",fg:"#185FA5"}:{bg:"#f0f2f5",fg:"#8a9ab0"}}/>:"—"}</td>
                        <td style={S.td}>{String(r.Status||"—")}</td>
                        <td style={{...S.td,color:"#8a9ab0"}}>{String(r.Account||"—")}</td>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11,whiteSpace:"nowrap"}}>{String(r["First Contact"]||"—")}</td>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11,whiteSpace:"nowrap"}}>{String(r["Last Contact"]||"—")}</td>
                        <td style={{...S.td,textAlign:"center"}}>{String(r["Total Emails"]||"—")}</td>
                        <td style={{...S.td,textAlign:"center"}}>{String(r.Unanswered||"—")}</td>
                        <td style={{...S.td,textAlign:"center"}}>{String(r.Cold||"—")}</td>
                        <td style={{...S.td,whiteSpace:"nowrap"}}>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={()=>toggleArchive(r._id as string)} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>
                              {r._archived?"Restore":"Archive"}
                            </button>
                            <button onClick={()=>deleteOld(r._id as string)} style={{fontSize:11,padding:"3px 9px",borderRadius:6,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length>PAGE_SIZE&&(
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"11px 14px",borderTop:"0.5px solid #f0f2f5"}}>
                <button onClick={()=>setOldPg(p=>Math.max(1,p-1))} disabled={oldPg<=1} style={{fontSize:13,padding:"5px 12px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",cursor:"pointer",color:"#4a6a8a"}}>← Prev</button>
                <span style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>Page {oldPg} of {totPg} · {filtered.length} {showArchived?"archived":"active"}</span>
                <button onClick={()=>setOldPg(p=>Math.min(totPg,p+1))} disabled={oldPg>=totPg} style={{fontSize:13,padding:"5px 12px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",cursor:"pointer",color:"#4a6a8a"}}>Next →</button>
              </div>
            )}
          </div>
        </>}

        {/* PENDING POs */}
        {tab==="pos"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Pending Purchase Orders</div>
              <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Track active POs from receipt to delivery</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setShowArchivedPOs(s=>!s)} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${showArchivedPOs?"#854F0B":"#e2e6ea"}`,background:showArchivedPOs?"#FFF8EC":"#f8f9fb",color:showArchivedPOs?"#854F0B":"#4a6a8a",cursor:"pointer"}}>
                {showArchivedPOs?"Active":"Archived"} ({(data.pendingPOs||[]).filter(p=>showArchivedPOs?!p.archived:p.archived).length})
              </button>
              <button onClick={addPO} style={S.addBtn}>+ Add PO</button>
            </div>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","PO Number","Client","Items Summary","Value","Date Received","Expected Delivery","Supplier Status","Status","Notes",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {pos.filter(p=>!p.archived).length===0&&!showArchivedPOs&&<tr><td colSpan={11} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>No active POs.</td></tr>}
                  {pos.filter(p=>showArchivedPOs?p.archived:!p.archived).map((p,i)=>(
                    <tr key={p.id} style={{background:p.archived?"#fafafa":i%2===0?"#fff":"#fafbfc",opacity:p.archived?0.75:1}}>
                      <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                      <td style={S.td}><input style={{...S.inp,fontFamily:"'DM Mono',monospace",fontWeight:600,color:"#185FA5"}} value={p.poNumber} placeholder="PO-2026-001" onChange={e=>updPO(p.id,{poNumber:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.client} placeholder="Client" onChange={e=>updPO(p.id,{client:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.items} placeholder="Items summary" onChange={e=>updPO(p.id,{items:e.target.value})}/></td>
                      <td style={S.td}><input style={{...S.inp,width:110}} value={p.value} placeholder="₱0.00" onChange={e=>updPO(p.id,{value:e.target.value})}/></td>
                      <td style={S.td}><input style={{...S.inp,width:130}} type="date" value={p.dateReceived} onChange={e=>updPO(p.id,{dateReceived:e.target.value})}/></td>
                      <td style={S.td}><input style={{...S.inp,width:130}} type="date" value={p.expectedDelivery} onChange={e=>updPO(p.id,{expectedDelivery:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.supplierStatus} placeholder="e.g. Ordered, ETA 2 weeks" onChange={e=>updPO(p.id,{supplierStatus:e.target.value})}/></td>
                      <td style={S.td}>
                        <select style={{...S.inp,background:PO_STATUS_C[p.status]?.bg||"#f8f9fb",color:PO_STATUS_C[p.status]?.fg||"#3a4a5a",fontWeight:600}} value={p.status} onChange={e=>updPO(p.id,{status:e.target.value})}>
                          {PO_STATUSES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><input style={S.inp} value={p.notes} placeholder="Notes" onChange={e=>updPO(p.id,{notes:e.target.value})}/></td>
                      <td style={{...S.td,whiteSpace:"nowrap"}}>
                        <button onClick={()=>{setSlideOver({type:"po",id:p.id});setSlideTab("details");}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Open</button>
                        <button onClick={()=>archivePO(p.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",marginRight:4}}>{p.archived?"Restore":"Archive"}</button>
                        <button onClick={()=>delPO(p.id)} style={{fontSize:13,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* PENDING RFQs */}
        {tab==="rfqs"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Pending RFQ Responses</div>
              <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Track submitted quotations awaiting response</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setShowArchivedRFQs(s=>!s)} style={{fontSize:12,padding:"5px 12px",borderRadius:20,border:`0.5px solid ${showArchivedRFQs?"#854F0B":"#e2e6ea"}`,background:showArchivedRFQs?"#FFF8EC":"#f8f9fb",color:showArchivedRFQs?"#854F0B":"#4a6a8a",cursor:"pointer"}}>
                {showArchivedRFQs?"Active":"Archived"} ({(data.pendingRFQs||[]).filter(r=>showArchivedRFQs?!r.archived:r.archived).length})
              </button>
              <button onClick={addRFQ} style={S.addBtn}>+ Add RFQ</button>
            </div>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","RFQ Number","Client","Subject","Date Submitted","Response Deadline","Status","Notes",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rfqs.filter(r=>!r.archived).length===0&&!showArchivedRFQs&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>No active RFQs.</td></tr>}
                  {rfqs.filter(r=>showArchivedRFQs?r.archived:!r.archived).map((r,i)=>{
                    const isOverdue=r.deadline&&new Date(r.deadline)<new Date()&&r.status==="Submitted";
                    return(
                      <tr key={r.id} style={{background:r.archived?"#fafafa":isOverdue?"#FFFBF0":i%2===0?"#fff":"#fafbfc",opacity:r.archived?0.75:1}}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                        <td style={S.td}><input style={{...S.inp,fontFamily:"'DM Mono',monospace",fontWeight:600,color:"#185FA5"}} value={r.rfqNumber} placeholder="RFQ-2026-001" onChange={e=>updRFQ(r.id,{rfqNumber:e.target.value})}/></td>
                        <td style={S.td}><input style={S.inp} value={r.client} placeholder="Client" onChange={e=>updRFQ(r.id,{client:e.target.value})}/></td>
                        <td style={S.td}><input style={S.inp} value={r.subject} placeholder="Subject" onChange={e=>updRFQ(r.id,{subject:e.target.value})}/></td>
                        <td style={S.td}><input style={{...S.inp,width:130}} type="date" value={r.dateSubmitted} onChange={e=>updRFQ(r.id,{dateSubmitted:e.target.value})}/></td>
                        <td style={S.td}>
                          <input style={{...S.inp,width:130,color:isOverdue?"#A32D2D":"#1a2332",fontWeight:isOverdue?600:400}} type="date" value={r.deadline} onChange={e=>updRFQ(r.id,{deadline:e.target.value})}/>
                          {isOverdue&&<div style={{fontSize:10,color:"#A32D2D",fontFamily:"'DM Mono',monospace",marginTop:2}}>Overdue</div>}
                        </td>
                        <td style={S.td}>
                          <select style={{...S.inp,background:RFQ_STATUS_C[r.status]?.bg||"#f8f9fb",color:RFQ_STATUS_C[r.status]?.fg||"#3a4a5a",fontWeight:600}} value={r.status} onChange={e=>updRFQ(r.id,{status:e.target.value})}>
                            {RFQ_STATUSES.map(s=><option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={S.td}><input style={S.inp} value={r.notes} placeholder="Notes" onChange={e=>updRFQ(r.id,{notes:e.target.value})}/></td>
                        <td style={{...S.td,whiteSpace:"nowrap"}}>
                          <button onClick={()=>{setSlideOver({type:"rfq",id:r.id});setSlideTab("details");}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Open</button>
                          <button onClick={()=>archiveRFQ(r.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",marginRight:4}}>{r.archived?"Restore":"Archive"}</button>
                          <button onClick={()=>delRFQ(r.id)} style={{fontSize:13,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* PRODUCTS */}
        {tab==="products"&&(()=>{
          const filteredProds=products.filter(p=>{
            if(!prodQ)return true;
            const q=prodQ.toLowerCase();
            return p.code.toLowerCase().includes(q)||p.description.toLowerCase().includes(q);
          });
          return(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Product Master</div>
                <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Catalog of products and standard pricing</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input style={{...S.inp,width:220,flex:"none"}} placeholder="Search code or description..." value={prodQ} onChange={e=>setProdQ(e.target.value)}/>
                <button onClick={()=>setProdForm({id:"",code:"",description:"",category:"LED Lighting",unit:"pcs",standardPrice:0,notes:"",createdAt:""})} style={S.addBtn}>+ Add Product</button>
              </div>
            </div>

            {prodForm!==null&&(
              <div style={{...S.panel,padding:18,marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:14,fontFamily:"'DM Mono',monospace"}}>
                  {prodForm.id?"Edit Product":"New Product"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                  {([["Code","code","text","LED-200W-IP65"],["Description","description","text","LED Flood Light 200W IP65 220V"],["Unit","unit","text","pcs"]] as [string,string,string,string][]).map(([lbl,k,t,ph])=>(
                    <div key={k}>
                      <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                      <input style={S.inp} type={t} placeholder={ph} value={(prodForm as unknown as Record<string,string|number>)[k] as string} onChange={e=>setProdForm(f=>f?{...f,[k]:e.target.value}:f)}/>
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Category</div>
                    <select style={S.inp} value={prodForm.category} onChange={e=>setProdForm(f=>f?{...f,category:e.target.value}:f)}>
                      {PRODUCT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Standard Price (PHP)</div>
                    <input style={S.inp} type="number" placeholder="0" value={prodForm.standardPrice||""} onChange={e=>setProdForm(f=>f?{...f,standardPrice:parseFloat(e.target.value)||0}:f)}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Notes</div>
                    <input style={S.inp} placeholder="Optional" value={prodForm.notes||""} onChange={e=>setProdForm(f=>f?{...f,notes:e.target.value}:f)}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    if(!prodForm)return;
                    if(!prodForm.code.trim()||!prodForm.description.trim())return;
                    const item:ProductItem={...prodForm,id:prodForm.id||genId(),createdAt:prodForm.createdAt||new Date().toISOString()};
                    await saveProducts("save",item);
                    setProdForm(null);
                  }} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Product</button>
                  <button onClick={()=>setProdForm(null)} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}

            <div style={S.panel}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["#","Code","Description","Category","Unit","Standard Price","Supplier",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredProds.length===0&&(
                      <tr><td colSpan={8} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>
                        {products.length===0?"No products yet. Add your first product above.":"No products match your search."}
                      </td></tr>
                    )}
                    {filteredProds.map((p,i)=>(
                      <tr key={p.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                        <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontWeight:600,color:"#185FA5",whiteSpace:"nowrap"}}>{p.code||"--"}</td>
                        <td style={{...S.td,fontWeight:500}}>{p.description||"--"}</td>
                        <td style={S.td}><Pill t={p.category||"Other"} c={{bg:"#EBF3FC",fg:"#185FA5"}}/></td>
                        <td style={{...S.td,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{p.unit||"--"}</td>
                        <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                          {p.standardPrice>0?`₱${p.standardPrice.toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"--"}
                        </td>
                        <td style={{...S.td,color:"#8a9ab0",fontSize:12}}>
                          {p.supplierId?(suppliers.find(s=>s.id===p.supplierId)?.name||"--"):"--"}
                        </td>
                        <td style={{...S.td,whiteSpace:"nowrap"}}>
                          <button onClick={()=>setProdForm(p)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Edit</button>
                          <button onClick={async()=>{if(confirm("Delete this product?"))await saveProducts("delete",p);}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>);
        })()}

        {/* SUPPLIERS */}
        {tab==="suppliers"&&(()=>{
          const filteredSupps=suppliers.filter(s=>{
            if(!suppQ)return true;
            const q=suppQ.toLowerCase();
            return s.name.toLowerCase().includes(q)||s.contactPerson.toLowerCase().includes(q);
          });
          return(<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Supplier Master</div>
                <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Approved suppliers and vendor information</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input style={{...S.inp,width:220,flex:"none"}} placeholder="Search name or contact..." value={suppQ} onChange={e=>setSuppQ(e.target.value)}/>
                <button onClick={()=>{setSuppForm({id:"",name:"",contactPerson:"",email:"",phone:"",address:"",paymentTerms:"30 Days",leadTimeDays:7,categories:[],notes:"",createdAt:""});setSuppCatsInput("");}} style={S.addBtn}>+ Add Supplier</button>
              </div>
            </div>

            {suppForm!==null&&(
              <div style={{...S.panel,padding:18,marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:14,fontFamily:"'DM Mono',monospace"}}>
                  {suppForm.id?"Edit Supplier":"New Supplier"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                  {([["Name","name","text","Company name"],["Contact Person","contactPerson","text","Full name"],["Email","email","email","email@domain.com"],["Phone","phone","text","+63 9XX XXX XXXX"]] as [string,string,string,string][]).map(([lbl,k,t,ph])=>(
                    <div key={k}>
                      <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                      <input style={S.inp} type={t} placeholder={ph} value={(suppForm as unknown as Record<string,string|number|string[]>)[k] as string} onChange={e=>setSuppForm(f=>f?{...f,[k]:e.target.value}:f)}/>
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Payment Terms</div>
                    <select style={S.inp} value={suppForm.paymentTerms} onChange={e=>setSuppForm(f=>f?{...f,paymentTerms:e.target.value}:f)}>
                      {PAYMENT_TERMS_OPTIONS.map(o=><option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Lead Time (days)</div>
                    <input style={S.inp} type="number" placeholder="7" value={suppForm.leadTimeDays||""} onChange={e=>setSuppForm(f=>f?{...f,leadTimeDays:parseInt(e.target.value)||0}:f)}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Categories (comma-separated)</div>
                    <input style={S.inp} placeholder="LED Lighting, Electrical" value={suppCatsInput} onChange={e=>setSuppCatsInput(e.target.value)}/>
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Address</div>
                    <textarea style={{...S.inp,minHeight:60,resize:"vertical"} as React.CSSProperties} placeholder="Full address" value={suppForm.address} onChange={e=>setSuppForm(f=>f?{...f,address:e.target.value}:f)}/>
                  </div>
                  <div style={{gridColumn:"1/-1"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Notes</div>
                    <textarea style={{...S.inp,minHeight:60,resize:"vertical"} as React.CSSProperties} placeholder="Optional" value={suppForm.notes||""} onChange={e=>setSuppForm(f=>f?{...f,notes:e.target.value}:f)}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    if(!suppForm)return;
                    if(!suppForm.name.trim())return;
                    const item:Supplier={...suppForm,id:suppForm.id||genId(),categories:suppCatsInput.split(",").map(s=>s.trim()).filter(Boolean),createdAt:suppForm.createdAt||new Date().toISOString()};
                    await saveSuppliers("save",item);
                    setSuppForm(null);
                    setSuppCatsInput("");
                  }} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Supplier</button>
                  <button onClick={()=>{setSuppForm(null);setSuppCatsInput("");}} style={{fontSize:13,padding:"8px 16px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}

            <div style={S.panel}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["#","Name","Contact Person","Email","Phone","Payment Terms","Lead Time",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredSupps.length===0&&(
                      <tr><td colSpan={8} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>
                        {suppliers.length===0?"No suppliers yet. Add your first supplier above.":"No suppliers match your search."}
                      </td></tr>
                    )}
                    {filteredSupps.map((s,i)=>(
                      <tr key={s.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:11}}>{i+1}</td>
                        <td style={{...S.td,fontWeight:600}}>{s.name||"--"}</td>
                        <td style={S.td}>{s.contactPerson||"--"}</td>
                        <td style={{...S.td,color:"#185FA5",fontSize:12}}>{s.email||"--"}</td>
                        <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontSize:12}}>{s.phone||"--"}</td>
                        <td style={S.td}><Pill t={s.paymentTerms||"--"} c={{bg:"#f0faf5",fg:"#3B6D11"}}/></td>
                        <td style={{...S.td,fontFamily:"'DM Mono',monospace",color:"#8a9ab0"}}>{s.leadTimeDays?`${s.leadTimeDays}d`:"--"}</td>
                        <td style={{...S.td,whiteSpace:"nowrap"}}>
                          <button onClick={()=>{setSuppForm(s);setSuppCatsInput((s.categories||[]).join(", "));}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginRight:4}}>Edit</button>
                          <button onClick={async()=>{if(confirm("Delete this supplier?"))await saveSuppliers("delete",s);}} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>);
        })()}

      </div>

      {/* SLIDE-OVER PANEL */}
      {slideOver&&(slideRFQ||slidePO)&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",justifyContent:"flex-end"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)"}} onClick={()=>setSlideOver(null)}/>
          <div style={{position:"relative",width:480,background:"#fff",height:"100%",overflow:"auto",boxShadow:"-4px 0 24px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column"}}>

            {/* Header */}
            <div style={{padding:"16px 18px",borderBottom:"0.5px solid #e2e6ea",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",position:"sticky",top:0,zIndex:2}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>
                  {slideRFQ?(slideRFQ.rfqNumber||`RFQ-${slideRFQ.id}`):(slidePO?.poNumber||`PO-${slidePO?.id}`)}
                </div>
                <div style={{fontSize:12,color:"#8a9ab0",marginTop:1}}>{slideRFQ?slideRFQ.client:slidePO?.client}</div>
              </div>
              <button onClick={()=>setSlideOver(null)} style={{fontSize:18,color:"#b0bec8",background:"none",border:"none",cursor:"pointer",padding:"4px 8px"}}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",borderBottom:"0.5px solid #e2e6ea"}}>
              {(["details","documents"] as const).map(t=>(
                <button key={t} onClick={()=>setSlideTab(t)}
                  style={{padding:"10px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:slideTab===t?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${slideTab===t?"#185FA5":"transparent"}`,fontWeight:slideTab===t?600:400}}>
                  {t==="details"?"Details":`Documents (${((slideRFQ?.documents||slidePO?.documents)||[]).length})`}
                </button>
              ))}
            </div>

            <div style={{flex:1,overflow:"auto",padding:18}}>
              {slideTab==="details"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {slideRFQ&&<>
                    {[
                      {lbl:"RFQ Number",key:"rfqNumber",type:"text",ph:"RFQ-2026-001"},
                      {lbl:"Client",key:"client",type:"text",ph:"Client name"},
                      {lbl:"Subject",key:"subject",type:"text",ph:"e.g. Supply of LED Lighting"},
                      {lbl:"Date Submitted",key:"dateSubmitted",type:"date",ph:""},
                      {lbl:"Response Deadline",key:"deadline",type:"date",ph:""},
                      {lbl:"Notes",key:"notes",type:"textarea",ph:"Additional notes..."},
                    ].map(f=>(
                      <div key={f.key}>
                        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{f.lbl}</div>
                        {f.type==="textarea"
                          ? <textarea style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%",minHeight:80,resize:"vertical"} as React.CSSProperties} value={((slideRFQ as unknown) as Record<string,string>)[f.key]||""} onChange={e=>updRFQ(slideRFQ.id,{[f.key]:e.target.value})} placeholder={f.ph}/>
                          : <input style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"}} type={f.type} value={((slideRFQ as unknown) as Record<string,string>)[f.key]||""} onChange={e=>updRFQ(slideRFQ.id,{[f.key]:e.target.value})} placeholder={f.ph}/>
                        }
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Status</div>
                      <select style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:`0.5px solid ${RFQ_STATUS_C[slideRFQ.status]?.fg||"#e2e6ea"}44`,background:RFQ_STATUS_C[slideRFQ.status]?.bg||"#f8f9fb",color:RFQ_STATUS_C[slideRFQ.status]?.fg||"#3a4a5a",fontWeight:600,width:"100%"}} value={slideRFQ.status} onChange={e=>updRFQ(slideRFQ.id,{status:e.target.value})}>
                        {RFQ_STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <a href={`/tools/docmaker.html?rfq=${encodeURIComponent(slideRFQ.rfqNumber||"")}&client=${encodeURIComponent(slideRFQ.client||"")}&subject=${encodeURIComponent(slideRFQ.subject||"")}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{display:"block",textAlign:"center",padding:"10px",borderRadius:9,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",fontSize:13,fontWeight:600,textDecoration:"none",marginTop:4}}>
                      📄 Open in Document Maker
                    </a>
                  </>}

                  {slidePO&&<>
                    {[
                      {lbl:"PO Number",key:"poNumber",type:"text",ph:"PO-2026-001"},
                      {lbl:"Client",key:"client",type:"text",ph:"Client name"},
                      {lbl:"Items Summary",key:"items",type:"text",ph:"Items description"},
                      {lbl:"Value",key:"value",type:"text",ph:"₱0.00"},
                      {lbl:"Date Received",key:"dateReceived",type:"date",ph:""},
                      {lbl:"Expected Delivery",key:"expectedDelivery",type:"date",ph:""},
                      {lbl:"Supplier Status",key:"supplierStatus",type:"text",ph:"e.g. Ordered, ETA 2 weeks"},
                      {lbl:"Notes",key:"notes",type:"textarea",ph:"Additional notes..."},
                    ].map(f=>(
                      <div key={f.key}>
                        <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>{f.lbl}</div>
                        {f.type==="textarea"
                          ? <textarea style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%",minHeight:80,resize:"vertical"} as React.CSSProperties} value={((slidePO as unknown) as Record<string,string>)[f.key]||""} onChange={e=>updPO(slidePO.id,{[f.key]:e.target.value})} placeholder={f.ph}/>
                          : <input style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"}} type={f.type} value={((slidePO as unknown) as Record<string,string>)[f.key]||""} onChange={e=>updPO(slidePO.id,{[f.key]:e.target.value})} placeholder={f.ph}/>
                        }
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Status</div>
                      <select style={{fontSize:13,padding:"8px 10px",borderRadius:8,border:`0.5px solid ${PO_STATUS_C[slidePO.status]?.fg||"#e2e6ea"}44`,background:PO_STATUS_C[slidePO.status]?.bg||"#f8f9fb",color:PO_STATUS_C[slidePO.status]?.fg||"#3a4a5a",fontWeight:600,width:"100%"}} value={slidePO.status} onChange={e=>updPO(slidePO.id,{status:e.target.value})}>
                        {PO_STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <a href={`/tools/docmaker.html?po=${encodeURIComponent(slidePO.poNumber||"")}&client=${encodeURIComponent(slidePO.client||"")}&subject=${encodeURIComponent(slidePO.items||"")}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{display:"block",textAlign:"center",padding:"10px",borderRadius:9,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",fontSize:13,fontWeight:600,textDecoration:"none",marginTop:4}}>
                      📄 Open in Document Maker
                    </a>
                  </>}
                </div>
              )}

              {slideTab==="documents"&&(
                <div>
                  <div style={{fontSize:12,color:"#b0bec8",marginBottom:14,lineHeight:1.6}}>
                    Documents saved from Document Maker appear here. Use the Save to CRM button in Document Maker and select this RFQ or PO.
                  </div>
                  {((slideRFQ?.documents||slidePO?.documents)||[]).length===0&&(
                    <div style={{textAlign:"center",padding:"28px 0",color:"#b0bec8",fontSize:13}}>No documents saved yet.</div>
                  )}
                  {((slideRFQ?.documents||slidePO?.documents)||[]).map((doc:CRMDocument)=>(
                    <div key={doc.id} style={{padding:"12px 14px",borderRadius:9,border:"0.5px solid #e2e6ea",marginBottom:8,background:"#fafbfc"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{fontSize:13,fontWeight:500,color:"#1a2332"}}>{doc.type} — {doc.number}</div>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{doc.status||"Saved"}</span>
                      </div>
                      <div style={{fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{doc.date}{doc.amount?` · ${doc.amount}`:""}</div>
                      {doc.html&&(
                        <button onClick={()=>{const w=window.open("","_blank");if(w){w.document.write(doc.html as string);w.document.close();}}}
                          style={{fontSize:11,padding:"4px 9px",borderRadius:6,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginTop:8}}>
                          View Document
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
