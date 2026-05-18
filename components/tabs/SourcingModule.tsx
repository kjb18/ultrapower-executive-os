"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { kvGet, kvSet } from "@/lib/kv";

interface SourcingItem { name: string; quantity: string; specs: string; }
interface Supplier { name:string; type:string; price_range:string; unit:string; stock?:string; lead_time:string; moq:string; certifications?:string; import_notes?:string; notes?:string; url?:string; }
interface ResultItem { name:string; summary:string; local_available:boolean; local_suppliers:Supplier[]; international_suppliers:Supplier[]; recommendation:string; quotation_hint:string; }
interface SourcingReport {
  id: string;
  name: string;
  items: ResultItem[];
  searched_at: string;
  query: SourcingItem[];
  rfqDate?: string;
  rfqDeadline?: string;
  status?: "Sourcing"|"Sent"|"Awarded"|"No Offer";
  rfqFile?: string; // base64 data URL of uploaded RFQ file
  rfqFileName?: string;
}

const STOCK_COLORS: Record<string,{bg:string;fg:string}> = {
  "In Stock":{bg:"#f0faf5",fg:"#3B6D11"},"On Order":{bg:"#FFF8EC",fg:"#854F0B"},
  "Indent":{bg:"#FEF0F0",fg:"#A32D2D"},"Unknown":{bg:"#f0f2f5",fg:"#8a9ab0"},
};
const STATUS_COLORS: Record<string,{bg:string;fg:string}> = {
  "Sourcing":{bg:"#EBF3FC",fg:"#185FA5"},
  "Sent":{bg:"#FFF8EC",fg:"#854F0B"},
  "Awarded":{bg:"#f0faf5",fg:"#3B6D11"},
  "No Offer":{bg:"#f0f2f5",fg:"#8a9ab0"},
};

const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

function exportCSV(report: SourcingReport) {
  const headers = ["Item","Supplier Name","Type","Region","Price Range","Unit","Stock","Lead Time","MOQ","Certifications","Notes","Website"];
  const rows: string[][] = [headers];
  report.items.forEach(item => {
    item.local_suppliers.forEach(s => rows.push([item.name,s.name,s.type,"Philippines",s.price_range,s.unit,s.stock||"",s.lead_time,s.moq,s.certifications||"",s.notes||"",s.url||""]));
    item.international_suppliers.forEach(s => rows.push([item.name,s.name,s.type,"International",s.price_range,s.unit,"",s.lead_time,s.moq,"",s.import_notes||"",s.url||""]));
  });
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`${report.name||"Sourcing"}_${report.searched_at.split("T")[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportDOCX(report: SourcingReport) {
  const date = new Date(report.searched_at).toLocaleDateString("en-PH",{dateStyle:"long"});
  const supplierTable = (suppliers:Supplier[],intl:boolean) => {
    if(!suppliers.length) return "<p style='color:#999;font-size:11pt'>None found.</p>";
    const hdrs = intl?["Supplier","Type","Price Range","Unit","Lead Time","MOQ","Import Notes","Website"]:["Supplier","Type","Price Range","Unit","Stock","Lead Time","MOQ","Certifications","Website"];
    const rows = suppliers.map(s=>intl?`<tr><td>${s.name}</td><td>${s.type}</td><td>${s.price_range}</td><td>${s.unit}</td><td>${s.lead_time}</td><td>${s.moq}</td><td>${s.import_notes||""}</td><td>${s.url?`<a href="${s.url}">${s.url}</a>`:""}</td></tr>`:`<tr><td>${s.name}</td><td>${s.type}</td><td>${s.price_range}</td><td>${s.unit}</td><td>${s.stock||""}</td><td>${s.lead_time}</td><td>${s.moq}</td><td>${s.certifications||""}</td><td>${s.url?`<a href="${s.url}">${s.url}</a>`:""}</td></tr>`).join("");
    return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:10pt;border-color:#e0e0e0"><thead style="background:#0066cc;color:white"><tr>${hdrs.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  };
  const metaRows = [
    report.rfqDate?`<tr><td><strong>RFQ Date:</strong></td><td>${report.rfqDate}</td></tr>`:"",
    report.rfqDeadline?`<tr><td><strong>Response Deadline:</strong></td><td>${report.rfqDeadline}</td></tr>`:"",
    report.status?`<tr><td><strong>Status:</strong></td><td>${report.status}</td></tr>`:"",
  ].filter(Boolean).join("");
  const itemSections = report.items.map(item=>`
    <h2 style="color:#0066cc;font-size:14pt;margin-top:24pt;border-bottom:2px solid #0066cc;padding-bottom:4pt">${item.name}</h2>
    <p style="font-size:11pt;color:#444">${item.summary}</p>
    <h3 style="font-size:12pt;color:#3B6D11;margin-top:14pt">Philippine Suppliers</h3>${supplierTable(item.local_suppliers,false)}
    ${item.international_suppliers.length>0?`<h3 style="font-size:12pt;color:#854F0B;margin-top:14pt">International Options</h3>${supplierTable(item.international_suppliers,true)}`:""}
    <table border="0" cellpadding="8" cellspacing="0" style="width:100%;margin-top:12pt"><tr>
      <td style="background:#EBF3FC;border-left:3px solid #185FA5;width:50%;padding:10pt;font-size:10pt"><strong style="color:#185FA5">Recommendation</strong><br/>${item.recommendation}</td>
      <td style="background:#f0faf5;border-left:3px solid #3B6D11;width:50%;padding:10pt;font-size:10pt"><strong style="color:#3B6D11">Quotation Hint</strong><br/>${item.quotation_hint}</td>
    </tr></table>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;margin:2.5cm;color:#1a1a2e;font-size:11pt} a{color:#0066cc}</style></head><body>
<table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20pt"><tr>
  <td><div style="font-size:20pt;font-weight:bold;color:#0066cc">ULTRA POWER</div><div style="font-size:10pt;color:#666">Ultra Power Industrial Resources, Inc. · Makati City</div></td>
  <td style="text-align:right"><div style="font-size:14pt;font-weight:bold">SOURCING REPORT</div><div style="font-size:10pt;color:#666">${date}</div></td>
</tr></table>
<h1 style="font-size:16pt;border-bottom:2px solid #0066cc;padding-bottom:6pt">${report.name||"Sourcing Report"}</h1>
${metaRows?`<table border="0" cellpadding="4" style="font-size:10pt;color:#444;margin-bottom:12pt">${metaRows}</table>`:""}
<p style="font-size:10pt;color:#666">${report.items.length} item${report.items.length>1?"s":""} sourced · ${date}</p>
${itemSections}
<div style="margin-top:32pt;border-top:1px solid #e0e0e0;padding-top:8pt;font-size:9pt;color:#999">Indicative pricing only — verify with supplier before quoting.</div>
</body></html>`;
  const blob = new Blob([html],{type:"application/msword"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`${report.name||"Sourcing"}_${report.searched_at.split("T")[0]}.doc`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function SourcingModule() {
  const [view, setView] = useState<"search"|"results"|"history">("search");
  const [sessionName, setSessionName] = useState("");
  const [rfqDate, setRfqDate] = useState("");
  const [rfqDeadline, setRfqDeadline] = useState("");
  const [status, setStatus] = useState<SourcingReport["status"]>("Sourcing");
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [items, setItems] = useState<SourcingItem[]>([{name:"",quantity:"",specs:""}]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<SourcingReport|null>(null);
  const [history, setHistory] = useState<SourcingReport[]>([]);
  const [expanded, setExpanded] = useState<Record<number,boolean>>({});
  const [renamingId, setRenamingId] = useState<string|null>(null);
  const [renameText, setRenameText] = useState("");
  const [addingToId, setAddingToId] = useState<string|null>(null);
  const [rfqFile, setRfqFile] = useState<string|null>(null); // base64 data URL
  const [rfqFileName, setRfqFileName] = useState<string>("");
  const [showRfqPane, setShowRfqPane] = useState(false);
  const [rfqPaneWidth, setRfqPaneWidth] = useState(380);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(380);

  useEffect(() => {
    kvGet<SourcingReport[]>("sourcing:history").then(h => {
      if (h) {
        const fixed = h.map(r => ({...r, id: r.id && r.id.includes("-") ? r.id : genId()}));
        setHistory(fixed);
      }
    });
  }, []);

  const handleRfqFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      setRfqFile(e.target?.result as string);
      setRfqFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) { handleRfqFile(file); break; }
      }
    }
  };

  const addItem = () => { if (items.length >= 5) return; setItems(i=>[...i,{name:"",quantity:"",specs:""}]); };
  const removeItem = (idx:number) => setItems(i=>i.filter((_,n)=>n!==idx));
  const updateItem = (idx:number, field:keyof SourcingItem, val:string) => setItems(i=>i.map((it,n)=>n===idx?{...it,[field]:val}:it));

  const updateReportMeta = (id:string, patch: Partial<SourcingReport>) => {
    const updated = history.map(h => h.id===id ? {...h,...patch} : h);
    setHistory(updated);
    kvSet("sourcing:history", updated);
    if (report?.id===id) setReport(r => r ? {...r,...patch} : r);
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = rfqPaneWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      const newWidth = Math.min(600, Math.max(280, dragStartWidth.current + delta));
      setRfqPaneWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rfqPaneWidth]);

  const runSearch = async (searchItems: SourcingItem[], existingReport?: SourcingReport) => {
    const valid = searchItems.filter(i=>i.name.trim());
    if (!valid.length) { setError("Please enter at least one item."); return; }
    if (valid.length > 5) { setError("Maximum 5 items per search."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/sourcing", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({items:valid, useWebSearch}),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error||`Error ${res.status}`); setLoading(false); return; }
      let newReport: SourcingReport;
      if (existingReport) {
        newReport = {...existingReport, items:[...existingReport.items,...data.items], query:[...existingReport.query,...valid], searched_at:new Date().toISOString()};
      } else {
        newReport = {
          ...data,
          id: genId(),
          name: sessionName.trim() || `Search ${new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric"})}`,
          query: valid,
          searched_at: new Date().toISOString(),
          rfqDate: rfqDate||undefined,
          rfqDeadline: rfqDeadline||undefined,
          status: status||"Sourcing",
          rfqFile: rfqFile||undefined,
          rfqFileName: rfqFileName||undefined,
        };
      }
      setReport(newReport);
      const newHist = existingReport
        ? history.map(h=>h.id===existingReport.id?newReport:h)
        : [newReport,...history].slice(0,20);
      setHistory(newHist);
      await kvSet("sourcing:history", newHist);
      setView("results");
      setExpanded(Object.fromEntries(data.items.map((_:ResultItem,i:number)=>[i,true])));
      setAddingToId(null);
      setItems([{name:"",quantity:"",specs:""}]);
      setSessionName(""); setRfqDate(""); setRfqDeadline(""); setStatus("Sourcing");
      setShowRfqPane(!!newReport.rfqFile);
    } catch(e) { setError(String(e)); }
    setLoading(false);
  };

  const search = () => runSearch(items);

  const addToSession = (sessionId:string) => {
    const session = history.find(h=>h.id===sessionId);
    if (!session) return;
    setAddingToId(sessionId);
    setSessionName(session.name);
    setItems([{name:"",quantity:"",specs:""}]);
    setView("search");
  };

  const saveRename = (id:string) => {
    if (!renameText.trim()) { setRenamingId(null); setRenameText(""); return; }
    updateReportMeta(id, {name:renameText.trim()});
    setRenamingId(null); setRenameText("");
  };

  const S = {
    panel:{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,overflow:"hidden"} as React.CSSProperties,
    inp:{fontSize:15,padding:"9px 11px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"} as React.CSSProperties,
    th:{fontSize:12,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" as const,color:"#b0bec8",padding:"9px 13px",textAlign:"left" as const,background:"#fafbfc",borderBottom:"0.5px solid #f0f2f5",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap" as const},
    td:{fontSize:14,color:"#3a4a5a",padding:"10px 13px",borderBottom:"0.5px solid #f0f2f5",verticalAlign:"top" as const} as React.CSSProperties,
    tabBtn:(a:boolean):React.CSSProperties=>({padding:"9px 20px",border:"none",background:"none",cursor:"pointer",fontSize:14,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400}),
    pill:(bg:string,fg:string):React.CSSProperties=>({fontSize:11,padding:"2px 9px",borderRadius:20,background:bg,color:fg,fontFamily:"'DM Mono',monospace",fontWeight:600,whiteSpace:"nowrap" as const,display:"inline-block"}),
    lbl:{fontSize:12,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase" as const,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:6} as React.CSSProperties,
  };

  const SupplierTable = ({suppliers,intl}:{suppliers:Supplier[];intl?:boolean}) => (
    <div style={{overflowX:"auto",marginTop:8}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["Supplier","Type","Price Range","Lead Time","MOQ",intl?"Import Notes":"Stock/Certs","Notes","Website"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {suppliers.length===0&&<tr><td colSpan={8} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:18}}>No suppliers found.</td></tr>}
          {suppliers.map((sup,i)=>(
            <tr key={i} style={{background:i%2===0?"#fff":"#fafbfc"}}>
              <td style={{...S.td,fontWeight:500,minWidth:140}}>{sup.name}</td>
              <td style={{...S.td,color:"#8a9ab0",minWidth:120}}>{sup.type}</td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",color:"#3B6D11",fontWeight:500,minWidth:130}}>{sup.price_range}<div style={{fontSize:12,color:"#b0bec8",fontWeight:400}}>{sup.unit}</div></td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontSize:13,minWidth:100}}>{sup.lead_time}</td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontSize:13,minWidth:80}}>{sup.moq}</td>
              <td style={{...S.td,minWidth:130}}>
                {intl?<span style={{fontSize:13,color:"#854F0B",lineHeight:1.5}}>{sup.import_notes}</span>:(
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {sup.stock&&<span style={S.pill((STOCK_COLORS[sup.stock]||STOCK_COLORS.Unknown).bg,(STOCK_COLORS[sup.stock]||STOCK_COLORS.Unknown).fg)}>{sup.stock}</span>}
                    {sup.certifications&&sup.certifications!=="N/A"&&<span style={{fontSize:12,color:"#534AB7"}}>{sup.certifications}</span>}
                  </div>
                )}
              </td>
              <td style={{...S.td,fontSize:13,color:"#8a9ab0",minWidth:120}}>{sup.notes||"—"}</td>
              <td style={{...S.td,minWidth:140}}>
                {sup.url?<a href={sup.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#185FA5",wordBreak:"break-all",textDecoration:"none"}}>{sup.url.replace(/^https?:\/\//,"").slice(0,30)}{sup.url.length>33?"…":""}</a>:<span style={{color:"#b0bec8",fontSize:13}}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const addingToSession = addingToId ? history.find(h=>h.id===addingToId) : null;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,height:60}}>
        <div>
          <div style={{fontSize:17,fontWeight:600,color:"#1a2332"}}>Sourcing Module</div>
          <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>AI-powered supplier search · Philippines first · Max 5 items</div>
        </div>
        <div style={{display:"flex"}}>
          {(["search","results","history"] as const).map(v=>(
            <button key={v} style={S.tabBtn(view===v)} onClick={()=>setView(v)}>
              {v==="search"?"New Search":v==="results"?"Report":"History"+(history.length>0?` (${history.length})`:"")}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:"auto",padding:18}}>
        <div style={{maxWidth:960,margin:"0 auto"}}>

          {/* SEARCH VIEW */}
          {view==="search"&&(<>
            {addingToSession&&(
              <div style={{padding:"10px 14px",borderRadius:9,background:"#EBF3FC",border:"0.5px solid #c5ddf5",fontSize:13,color:"#185FA5",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span>Adding items to: <strong>{addingToSession.name}</strong></span>
                <button onClick={()=>{setAddingToId(null);setItems([{name:"",quantity:"",specs:""}]);}} style={{fontSize:12,padding:"3px 9px",borderRadius:6,border:"0.5px solid #c5ddf5",background:"#fff",color:"#185FA5",cursor:"pointer"}}>Cancel</button>
              </div>
            )}
            <div style={{...S.panel,padding:"20px 22px",marginBottom:14}}>
              {!addingToSession&&<>
                {/* Session name */}
                <div style={{marginBottom:16}}>
                  <div style={S.lbl}>Session Name</div>
                  <input style={S.inp} placeholder="e.g. EDC Substation Lighting RFQ" value={sessionName} onChange={e=>setSessionName(e.target.value)}/>
                </div>
                {/* RFQ Date, Deadline, Status */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
                  <div>
                    <div style={S.lbl}>RFQ Date</div>
                    <input style={S.inp} type="date" value={rfqDate} onChange={e=>setRfqDate(e.target.value)}/>
                  </div>
                  <div>
                    <div style={S.lbl}>Response Deadline</div>
                    <input style={S.inp} type="date" value={rfqDeadline} onChange={e=>setRfqDeadline(e.target.value)}/>
                  </div>
                  <div>
                    <div style={S.lbl}>Status</div>
                    <select style={{...S.inp,background:STATUS_COLORS[status||"Sourcing"]?.bg,color:STATUS_COLORS[status||"Sourcing"]?.fg,fontWeight:600}} value={status} onChange={e=>setStatus(e.target.value as SourcingReport["status"])}>
                      <option>Sourcing</option><option>Sent</option><option>Awarded</option><option>No Offer</option>
                    </select>
                  </div>
                </div>

                {/* RFQ Document Upload */}
                <div style={{marginBottom:18}}>
                  <div style={S.lbl}>Reference Document (RFQ / Photo) — optional</div>
                  <div onPaste={handlePaste}
                    style={{border:"1.5px dashed #d0d8e0",borderRadius:9,padding:"14px 16px",background:"#fafbfc",display:"flex",alignItems:"center",gap:12,cursor:"pointer",position:"relative"}}
                    onClick={()=>document.getElementById("rfq-upload")?.click()}>
                    <input id="rfq-upload" type="file" accept="image/*,.pdf" style={{display:"none"}}
                      onChange={e=>{const f=e.target.files?.[0];if(f)handleRfqFile(f);e.target.value="";}}/>
                    {rfqFile ? (
                      <>
                        {rfqFile.startsWith("data:image") ? (
                          <img src={rfqFile} style={{height:50,borderRadius:5,objectFit:"cover",flexShrink:0}} alt="RFQ"/>
                        ) : (
                          <div style={{width:40,height:50,background:"#EBF3FC",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📄</div>
                        )}
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:500,color:"#1a2332"}}>{rfqFileName}</div>
                          <div style={{fontSize:11,color:"#8a9ab0",marginTop:2}}>Click to replace · will be visible in split view during results</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();setRfqFile(null);setRfqFileName("");}} style={{fontSize:12,color:"#A32D2D",background:"none",border:"none",cursor:"pointer",flexShrink:0}}>✕ Remove</button>
                      </>
                    ) : (
                      <>
                        <div style={{fontSize:24,flexShrink:0}}>📎</div>
                        <div>
                          <div style={{fontSize:13,color:"#4a6a8a",fontWeight:500}}>Upload PDF or image, or paste screenshot</div>
                          <div style={{fontSize:11,color:"#b0bec8",marginTop:2}}>Ctrl+V to paste · shown alongside results for cross-referencing</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {/* Web search toggle */}
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,padding:"10px 14px",borderRadius:9,background:useWebSearch?"#EBF3FC":"#f8f9fb",border:`0.5px solid ${useWebSearch?"#c5ddf5":"#e2e6ea"}`}}>
                  <div onClick={()=>setUseWebSearch(w=>!w)} style={{width:36,height:20,borderRadius:20,background:useWebSearch?"#185FA5":"#d0d8e0",position:"relative",cursor:"pointer",transition:"background 0.2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:useWebSearch?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:useWebSearch?"#185FA5":"#8a9ab0"}}>Web Search {useWebSearch?"On":"Off"}</div>
                    <div style={{fontSize:11,color:"#b0bec8",marginTop:1}}>
                      {useWebSearch?"Live pricing from the web · max 3 searches per item · higher token cost":"Uses training knowledge only · faster · no token cost for searches"}
                    </div>
                  </div>
                </div>
              </>}

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={S.lbl}>Items to Source</div>
                <span style={{fontSize:12,color:items.length>=5?"#A32D2D":"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{items.length}/5</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 110px 1fr 36px",gap:8,marginBottom:8}}>
                {["Item Name / Description","Quantity","Specifications (optional)",""].map(h=>(
                  <div key={h} style={{fontSize:12,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</div>
                ))}
              </div>
              {items.map((item,idx)=>(
                <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 110px 1fr 36px",gap:8,marginBottom:9,alignItems:"center"}}>
                  <input style={S.inp} placeholder="e.g. LED Flood Light 200W IP65" value={item.name} onChange={e=>updateItem(idx,"name",e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}/>
                  <input style={S.inp} placeholder="e.g. 10 pcs" value={item.quantity} onChange={e=>updateItem(idx,"quantity",e.target.value)}/>
                  <input style={S.inp} placeholder="e.g. 220V, IP65, IEC" value={item.specs} onChange={e=>updateItem(idx,"specs",e.target.value)}/>
                  <button onClick={()=>removeItem(idx)} style={{fontSize:15,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer",padding:"0 6px"}}>✕</button>
                </div>
              ))}
              {items.length<5&&<div style={{marginTop:10}}><button onClick={addItem} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>+ Add Item</button></div>}
              {items.length>=5&&<div style={{marginTop:8,fontSize:12,color:"#854F0B",fontFamily:"'DM Mono',monospace"}}>Maximum 5 items. Add more from History after this search.</div>}
            </div>

            {error&&<div style={{padding:"11px 14px",borderRadius:9,background:"#FEF0F0",border:"0.5px solid #f5c6c6",fontSize:14,color:"#A32D2D",marginBottom:12}}>{error}</div>}

            <button onClick={search} disabled={loading} style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:"#185FA5",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:9,opacity:loading?0.7:1}}>
              {loading?<><Spinner/><span>Searching one item at a time{!useWebSearch?" (no web search)":""}...</span></>:<><span>🔍</span><span>{addingToSession?`Add Items to "${addingToSession.name}"`:"Search Suppliers"}</span></>}
            </button>
            <div style={{marginTop:12,padding:"12px 14px",borderRadius:9,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontSize:13,color:"#8a9ab0",lineHeight:1.7}}>
              {useWebSearch?"Web search enabled — allow 10-15 seconds per item. Max 3 web searches per item to control token usage.":"Web search off — using training knowledge. Faster and cheaper. Toggle on for current pricing."}
            </div>
          </>)}

          {/* RESULTS VIEW */}
          {view==="results"&&(<>
            {!report&&<div style={{textAlign:"center",padding:"40px",color:"#b0bec8",fontSize:14}}>No report yet. Run a search first.</div>}
            {report&&<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
                <div style={{flex:1}}>
                  {renamingId===report.id?(
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      <input style={{...S.inp,fontSize:15,flex:1,border:"1px solid #185FA5",width:280}} value={renameText} onChange={e=>setRenameText(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter")saveRename(report.id);if(e.key==="Escape"){setRenamingId(null);setRenameText("");}}} autoFocus/>
                      <button onClick={()=>saveRename(report.id)} style={{fontSize:13,padding:"6px 12px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
                      <button onClick={()=>{setRenamingId(null);setRenameText("");}} style={{fontSize:13,padding:"6px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>✕</button>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                      <div style={{fontSize:18,fontWeight:600,color:"#1a2332"}}>{report.name}</div>
                      {report.status&&<span style={{...S.pill(STATUS_COLORS[report.status]?.bg||"#f0f2f5",STATUS_COLORS[report.status]?.fg||"#8a9ab0")}}>{report.status}</span>}
                      <button onClick={()=>{setRenamingId(report.id);setRenameText(report.name);}} style={{fontSize:12,padding:"3px 9px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Rename</button>
                    </div>
                  )}
                  <div style={{display:"flex",gap:12,marginTop:5,flexWrap:"wrap"}}>
                    <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{report.items.length} item{report.items.length>1?"s":""} · {new Date(report.searched_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</div>
                    {report.rfqDate&&<div style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>RFQ: {report.rfqDate}</div>}
                    {report.rfqDeadline&&<div style={{fontSize:12,color:new Date(report.rfqDeadline)<new Date()?"#A32D2D":"#854F0B",fontFamily:"'DM Mono',monospace",fontWeight:600}}>Deadline: {report.rfqDeadline}{new Date(report.rfqDeadline)<new Date()?" ⚠ Overdue":""}</div>}
                  </div>
                  {/* Inline status/date editing */}
                  <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap",alignItems:"center"}}>
                    <select style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:`0.5px solid ${STATUS_COLORS[report.status||"Sourcing"]?.fg||"#e2e6ea"}44`,background:STATUS_COLORS[report.status||"Sourcing"]?.bg||"#f0f2f5",color:STATUS_COLORS[report.status||"Sourcing"]?.fg||"#8a9ab0",fontWeight:600,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}
                      value={report.status||"Sourcing"} onChange={e=>updateReportMeta(report.id,{status:e.target.value as SourcingReport["status"]})}>
                      <option>Sourcing</option><option>Sent</option><option>Awarded</option><option>No Offer</option>
                    </select>
                    <input type="date" style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",fontFamily:"'DM Mono',monospace"}}
                      value={report.rfqDate||""} onChange={e=>updateReportMeta(report.id,{rfqDate:e.target.value})} title="RFQ Date"/>
                    <input type="date" style={{fontSize:12,padding:"4px 8px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",fontFamily:"'DM Mono',monospace"}}
                      value={report.rfqDeadline||""} onChange={e=>updateReportMeta(report.id,{rfqDeadline:e.target.value})} title="Response Deadline"/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button onClick={()=>addToSession(report.id)} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #534AB7",background:"#F4F3FE",color:"#534AB7",cursor:"pointer",fontWeight:500}}>+ Add Items</button>
                  {report.rfqFile&&<button onClick={()=>setShowRfqPane(s=>!s)} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:`0.5px solid ${showRfqPane?"#185FA5":"#e2e6ea"}`,background:showRfqPane?"#EBF3FC":"#f8f9fb",color:showRfqPane?"#185FA5":"#4a6a8a",cursor:"pointer",fontWeight:500}}>📎 {showRfqPane?"Hide":"Show"} RFQ</button>}
                  <button onClick={()=>exportCSV(report)} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #3B6D11",background:"#f0faf5",color:"#3B6D11",cursor:"pointer",fontWeight:500}}>📊 CSV</button>
                  <button onClick={()=>exportDOCX(report)} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:500}}>📄 DOCX</button>
                  <button onClick={()=>setView("search")} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>New Search</button>
                </div>
              </div>
              {/* Split layout when RFQ document is present */}
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                {report.items.map((item,i)=>(
                <div key={i} style={{...S.panel,marginBottom:14}}>
                  <div style={{padding:"14px 18px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setExpanded(e=>({...e,[i]:!e[i]}))}>
                    <div style={{display:"flex",alignItems:"center",gap:11}}>
                      <div style={{width:11,height:11,borderRadius:"50%",background:item.local_available?"#3B6D11":"#854F0B",flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>{item.name}</div>
                        <div style={{fontSize:13,color:"#8a9ab0",marginTop:2}}>{item.summary}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={S.pill(item.local_available?"#f0faf5":"#FFF8EC",item.local_available?"#3B6D11":"#854F0B")}>{item.local_available?"PH Available":"Intl Only"}</span>
                      <span style={{fontSize:14,color:"#b0bec8"}}>{expanded[i]?"▲":"▼"}</span>
                    </div>
                  </div>
                  {expanded[i]&&(
                    <div style={{padding:"16px 18px"}}>
                      <div style={{marginBottom:18}}>
                        <div style={{...S.lbl,color:"#3B6D11"}}>Philippine Suppliers <span style={{fontSize:11,padding:"1px 7px",borderRadius:20,background:"#f0faf5",color:"#3B6D11",marginLeft:6}}>{item.local_suppliers.length} found</span></div>
                        <SupplierTable suppliers={item.local_suppliers}/>
                      </div>
                      {item.international_suppliers.length>0&&(
                        <div style={{marginBottom:18}}>
                          <div style={{...S.lbl,color:"#854F0B"}}>International Options <span style={{fontSize:11,padding:"1px 7px",borderRadius:20,background:"#FFF8EC",color:"#854F0B",marginLeft:6}}>{item.international_suppliers.length} found</span></div>
                          <SupplierTable suppliers={item.international_suppliers} intl/>
                        </div>
                      )}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                        <div style={{padding:"13px 15px",borderRadius:9,background:"#EBF3FC",border:"0.5px solid #c5ddf5"}}>
                          <div style={{...S.lbl,color:"#185FA5",marginBottom:6}}>Recommendation</div>
                          <div style={{fontSize:14,color:"#1a2332",lineHeight:1.65}}>{item.recommendation}</div>
                        </div>
                        <div style={{padding:"13px 15px",borderRadius:9,background:"#f0faf5",border:"0.5px solid #c8e6c9"}}>
                          <div style={{...S.lbl,color:"#3B6D11",marginBottom:6}}>Quotation Hint</div>
                          <div style={{fontSize:14,color:"#1a2332",lineHeight:1.65}}>{item.quotation_hint}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
                </div>
                {/* RFQ Document Pane */}
                {showRfqPane&&report.rfqFile&&(
                  <div style={{display:"flex",flexShrink:0,alignItems:"flex-start",position:"sticky",top:0}}>
                    {/* Drag handle */}
                    <div onMouseDown={handleDragStart} style={{width:6,cursor:"col-resize",alignSelf:"stretch",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,userSelect:"none" as const}}>
                      <div style={{width:2,height:32,background:"#d0d8e0",borderRadius:2}}/>
                    </div>
                  <div style={{width:rfqPaneWidth,flexShrink:0}}>
                    <div style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,overflow:"hidden"}}>
                      <div style={{padding:"10px 14px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Reference RFQ</div>
                        <div style={{fontSize:11,color:"#8a9ab0",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{report.rfqFileName}</div>
                      </div>
                      <div style={{maxHeight:"calc(100vh - 200px)",overflow:"auto",padding:8}}>
                        {report.rfqFile.startsWith("data:image") ? (
                          <img src={report.rfqFile} style={{width:"100%",borderRadius:6}} alt="RFQ Reference"/>
                        ) : report.rfqFile.startsWith("data:application/pdf") ? (
                          <iframe src={report.rfqFile} style={{width:"100%",height:600,border:"none",borderRadius:6}} title="RFQ PDF"/>
                        ) : (
                          <div style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:13}}>Preview not available for this file type.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </>}
          </>)}

          {/* HISTORY VIEW */}
          {view==="history"&&(<>
            <div style={{fontSize:18,fontWeight:600,color:"#1a2332",marginBottom:14}}>Search History</div>
            {history.length===0&&<div style={{textAlign:"center",padding:40,color:"#b0bec8",fontSize:14}}>No searches yet.</div>}
            {history.map(h=>{
              const hid = h.id;
              const isOverdue = h.rfqDeadline && new Date(h.rfqDeadline)<new Date() && h.status!=="Awarded";
              return (
                <div key={hid} style={{...S.panel,padding:"14px 18px",marginBottom:10,background:isOverdue?"#FFFBF0":"#fff"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{flex:1}}>
                      {renamingId===hid?(
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <input style={{...S.inp,fontSize:15,flex:1,border:"1px solid #185FA5"}} value={renameText} onChange={e=>setRenameText(e.target.value)}
                            onKeyDown={e=>{if(e.key==="Enter")saveRename(hid);if(e.key==="Escape"){setRenamingId(null);setRenameText("");}}} autoFocus/>
                          <button onClick={()=>saveRename(hid)} style={{fontSize:13,padding:"6px 12px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
                          <button onClick={()=>{setRenamingId(null);setRenameText("");}} style={{fontSize:13,padding:"6px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>✕</button>
                        </div>
                      ):(
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontSize:15,fontWeight:500,color:"#1a2332"}}>{h.name}</div>
                            {h.status&&<span style={S.pill(STATUS_COLORS[h.status]?.bg||"#f0f2f5",STATUS_COLORS[h.status]?.fg||"#8a9ab0")}>{h.status}</span>}
                            {isOverdue&&<span style={S.pill("#FEF0F0","#A32D2D")}>Overdue</span>}
                          </div>
                          <div style={{display:"flex",gap:12,marginTop:3,flexWrap:"wrap"}}>
                            <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{new Date(h.searched_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})} · {h.items.length} item{h.items.length>1?"s":""}</div>
                            {h.rfqDate&&<div style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>RFQ: {h.rfqDate}</div>}
                            {h.rfqDeadline&&<div style={{fontSize:12,color:isOverdue?"#A32D2D":"#854F0B",fontFamily:"'DM Mono',monospace",fontWeight:isOverdue?600:400}}>Deadline: {h.rfqDeadline}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                    {renamingId!==hid&&(
                      <div style={{display:"flex",gap:8,flexShrink:0}}>
                        <button onClick={()=>{setRenamingId(hid);setRenameText(h.name);}} style={{fontSize:12,padding:"5px 11px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Rename</button>
                        <button onClick={()=>addToSession(hid)} style={{fontSize:12,padding:"5px 11px",borderRadius:7,border:"0.5px solid #534AB7",background:"#F4F3FE",color:"#534AB7",cursor:"pointer",fontWeight:500}}>+ Add</button>
                        <button onClick={()=>{setReport(h);setExpanded(Object.fromEntries(h.items.map((_,j)=>[j,true])));setView("results");}} style={{fontSize:12,padding:"5px 11px",borderRadius:7,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:500}}>View →</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>)}

        </div>
      </div>
    </div>
  );
}
