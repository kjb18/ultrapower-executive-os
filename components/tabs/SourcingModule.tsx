"use client";
import { useState, useEffect } from "react";
import { kvGet, kvSet } from "@/lib/kv";

interface SourcingItem { name: string; quantity: string; specs: string; }
interface Supplier { name:string; type:string; price_range:string; unit:string; stock?:string; lead_time:string; moq:string; certifications?:string; import_notes?:string; notes?:string; url?:string; }
interface ResultItem { name:string; summary:string; local_available:boolean; local_suppliers:Supplier[]; international_suppliers:Supplier[]; recommendation:string; quotation_hint:string; }
interface SourcingReport { items:ResultItem[]; searched_at:string; query:SourcingItem[]; }

const STOCK_COLORS: Record<string,{bg:string;fg:string}> = {
  "In Stock":  {bg:"#f0faf5",fg:"#3B6D11"},
  "On Order":  {bg:"#FFF8EC",fg:"#854F0B"},
  "Indent":    {bg:"#FEF0F0",fg:"#A32D2D"},
  "Unknown":   {bg:"#f0f2f5",fg:"#8a9ab0"},
};

const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

export default function SourcingModule() {
  const [view, setView] = useState<"search"|"results"|"history">("search");
  const [items, setItems] = useState<SourcingItem[]>([{name:"",quantity:"",specs:""}]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<SourcingReport|null>(null);
  const [history, setHistory] = useState<SourcingReport[]>([]);
  const [expanded, setExpanded] = useState<Record<number,boolean>>({});

  useEffect(() => {
    kvGet<SourcingReport[]>("sourcing:history").then(h => { if (h) setHistory(h); });
  }, []);

  const addItem = () => setItems(i => [...i, {name:"",quantity:"",specs:""}]);
  const removeItem = (idx:number) => setItems(i => i.filter((_,n) => n!==idx));
  const updateItem = (idx:number, field:keyof SourcingItem, val:string) =>
    setItems(i => i.map((it,n) => n===idx ? {...it,[field]:val} : it));

  const search = async () => {
    const valid = items.filter(i => i.name.trim());
    if (!valid.length) { setError("Please enter at least one item."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/sourcing", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({items:valid}),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error||`Error ${res.status}`); setLoading(false); return; }
      const newReport: SourcingReport = {...data, query:valid, searched_at: new Date().toISOString()};
      setReport(newReport);
      const newHist = [newReport, ...history].slice(0, 20);
      setHistory(newHist);
      await kvSet("sourcing:history", newHist);
      setView("results");
      setExpanded(Object.fromEntries(data.items.map((_:ResultItem,i:number) => [i, true])));
    } catch(e) { setError(String(e)); }
    setLoading(false);
  };

  const S = {
    panel: {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,overflow:"hidden"} as React.CSSProperties,
    inp: {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"} as React.CSSProperties,
    th: {fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase" as const,color:"#b0bec8",padding:"8px 12px",textAlign:"left" as const,background:"#fafbfc",borderBottom:"0.5px solid #f0f2f5",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap" as const},
    td: {fontSize:13,color:"#3a4a5a",padding:"9px 12px",borderBottom:"0.5px solid #f0f2f5",verticalAlign:"top" as const} as React.CSSProperties,
    tabBtn: (a:boolean):React.CSSProperties => ({padding:"8px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400}),
    pill: (bg:string,fg:string):React.CSSProperties => ({fontSize:10,padding:"2px 8px",borderRadius:20,background:bg,color:fg,fontFamily:"'DM Mono',monospace",fontWeight:600,whiteSpace:"nowrap" as const,display:"inline-block"}),
  };

  const SupplierTable = ({suppliers, intl}:{suppliers:Supplier[];intl?:boolean}) => (
    <div style={{overflowX:"auto",marginTop:8}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>
          {["Supplier","Type","Price Range","Lead Time","MOQ",intl?"Import Notes":"Stock/Certs","Notes/URL"].map(h=><th key={h} style={S.th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {suppliers.length===0&&<tr><td colSpan={7} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:16}}>No suppliers found.</td></tr>}
          {suppliers.map((sup,i)=>(
            <tr key={i} style={{background:i%2===0?"#fff":"#fafbfc"}}>
              <td style={{...S.td,fontWeight:500}}>
                {sup.url ? <a href={sup.url} target="_blank" rel="noopener noreferrer" style={{color:"#185FA5",textDecoration:"none"}}>{sup.name}</a> : sup.name}
              </td>
              <td style={{...S.td,color:"#8a9ab0"}}>{sup.type}</td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",color:"#3B6D11",fontWeight:500}}>{sup.price_range}<div style={{fontSize:11,color:"#b0bec8",fontWeight:400}}>{sup.unit}</div></td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontSize:12}}>{sup.lead_time}</td>
              <td style={{...S.td,fontFamily:"'DM Mono',monospace",fontSize:12}}>{sup.moq}</td>
              <td style={S.td}>
                {intl ? <span style={{fontSize:12,color:"#854F0B"}}>{sup.import_notes}</span> : (
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {sup.stock&&<span style={S.pill((STOCK_COLORS[sup.stock]||STOCK_COLORS.Unknown).bg,(STOCK_COLORS[sup.stock]||STOCK_COLORS.Unknown).fg)}>{sup.stock}</span>}
                    {sup.certifications&&sup.certifications!=="N/A"&&<span style={{fontSize:11,color:"#534AB7"}}>{sup.certifications}</span>}
                  </div>
                )}
              </td>
              <td style={{...S.td,fontSize:12,color:"#8a9ab0"}}>{sup.notes||"—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,height:56}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Sourcing Module</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>AI-powered supplier search · Philippines first</div>
        </div>
        <div style={{display:"flex"}}>
          {(["search","results","history"] as const).map(v=>(
            <button key={v} style={S.tabBtn(view===v)} onClick={()=>setView(v)}>
              {v==="search"?"New Search":v==="results"?"Report":"History"+(history.length>0?` (${history.length})`:"")}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:"auto",padding:16}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>

          {/* SEARCH VIEW */}
          {view==="search"&&(
            <>
              <div style={{...S.panel,padding:"18px 20px",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Items to Source</div>

                {/* Column headers */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 100px 1fr 40px",gap:8,marginBottom:8}}>
                  {["Item Name / Description","Quantity","Specifications (optional)",""].map(h=>(
                    <div key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</div>
                  ))}
                </div>

                {items.map((item,idx)=>(
                  <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 100px 1fr 40px",gap:8,marginBottom:8,alignItems:"center"}}>
                    <input style={S.inp} placeholder="e.g. LED Flood Light 200W IP65" value={item.name} onChange={e=>updateItem(idx,"name",e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addItem()}/>
                    <input style={S.inp} placeholder="e.g. 10 pcs" value={item.quantity} onChange={e=>updateItem(idx,"quantity",e.target.value)}/>
                    <input style={S.inp} placeholder="e.g. 220V, IEC standard, waterproof" value={item.specs} onChange={e=>updateItem(idx,"specs",e.target.value)}/>
                    <button onClick={()=>removeItem(idx)} style={{fontSize:13,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer",padding:"0 6px"}} title="Remove">✕</button>
                  </div>
                ))}

                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <button onClick={addItem} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>+ Add Item</button>
                </div>
              </div>

              {error&&<div style={{padding:"10px 14px",borderRadius:9,background:"#FEF0F0",border:"0.5px solid #f5c6c6",fontSize:13,color:"#A32D2D",marginBottom:12}}>{error}</div>}

              <button onClick={search} disabled={loading} style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"#185FA5",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.7:1}}>
                {loading?<><Spinner/><span>Searching suppliers... this takes 15-30 seconds</span></>:<><span>🔍</span><span>Search Suppliers</span></>}
              </button>

              <div style={{marginTop:12,padding:"12px 14px",borderRadius:9,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontSize:12,color:"#8a9ab0",lineHeight:1.7}}>
                The search uses Claude AI with real-time web search to find current Philippine suppliers, pricing, and international options. Results are indicative -- verify pricing with suppliers before quoting.
              </div>
            </>
          )}

          {/* RESULTS VIEW */}
          {view==="results"&&(
            <>
              {!report&&<div style={{textAlign:"center",padding:"40px",color:"#b0bec8",fontSize:13}}>No report yet. Run a search first.</div>}
              {report&&<>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>{report.items.length} item{report.items.length>1?"s":""} sourced</div>
                    <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>{new Date(report.searched_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}</div>
                  </div>
                  <button onClick={()=>setView("search")} style={{fontSize:13,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>New Search</button>
                </div>

                {report.items.map((item,i)=>(
                  <div key={i} style={{...S.panel,marginBottom:14}}>
                    {/* Item header */}
                    <div style={{padding:"14px 18px",borderBottom:"0.5px solid #f0f2f5",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
                      onClick={()=>setExpanded(e=>({...e,[i]:!e[i]}))}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:item.local_available?"#3B6D11":"#854F0B",flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>{item.name}</div>
                          <div style={{fontSize:12,color:"#8a9ab0",marginTop:2}}>{item.summary}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:item.local_available?"#f0faf5":"#FFF8EC",color:item.local_available?"#3B6D11":"#854F0B",fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                          {item.local_available?"PH Available":"Intl Only"}
                        </span>
                        <span style={{fontSize:13,color:"#b0bec8"}}>{expanded[i]?"▲":"▼"}</span>
                      </div>
                    </div>

                    {expanded[i]&&(
                      <div style={{padding:"16px 18px"}}>
                        {/* Local suppliers */}
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#3B6D11",marginBottom:6,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
                            Philippine Suppliers
                            <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#f0faf5",color:"#3B6D11"}}>{item.local_suppliers.length} found</span>
                          </div>
                          <SupplierTable suppliers={item.local_suppliers}/>
                        </div>

                        {/* International suppliers */}
                        {item.international_suppliers.length>0&&(
                          <div style={{marginBottom:16}}>
                            <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#854F0B",marginBottom:6,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:8}}>
                              International Options
                              <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#FFF8EC",color:"#854F0B"}}>{item.international_suppliers.length} found</span>
                            </div>
                            <SupplierTable suppliers={item.international_suppliers} intl/>
                          </div>
                        )}

                        {/* Recommendation */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                          <div style={{padding:"12px 14px",borderRadius:9,background:"#EBF3FC",border:"0.5px solid #c5ddf5"}}>
                            <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"#185FA5",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Recommendation</div>
                            <div style={{fontSize:13,color:"#1a2332",lineHeight:1.6}}>{item.recommendation}</div>
                          </div>
                          <div style={{padding:"12px 14px",borderRadius:9,background:"#f0faf5",border:"0.5px solid #c8e6c9"}}>
                            <div style={{fontSize:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"#3B6D11",marginBottom:5,fontFamily:"'DM Mono',monospace"}}>Quotation Hint</div>
                            <div style={{fontSize:13,color:"#1a2332",lineHeight:1.6}}>{item.quotation_hint}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>}
            </>
          )}

          {/* HISTORY VIEW */}
          {view==="history"&&(
            <>
              <div style={{fontSize:15,fontWeight:600,color:"#1a2332",marginBottom:14}}>Search History</div>
              {history.length===0&&<div style={{textAlign:"center",padding:40,color:"#b0bec8",fontSize:13}}>No searches yet.</div>}
              {history.map((h,i)=>(
                <div key={i} style={{...S.panel,padding:"14px 18px",marginBottom:10,cursor:"pointer"}}
                  onClick={()=>{setReport(h);setExpanded(Object.fromEntries(h.items.map((_,j)=>[j,true])));setView("results");}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:500,color:"#1a2332"}}>{h.query.map(q=>q.name).filter(Boolean).join(", ")}</div>
                      <div style={{fontSize:11,color:"#b0bec8",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{new Date(h.searched_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})} · {h.items.length} item{h.items.length>1?"s":""}</div>
                    </div>
                    <span style={{fontSize:12,color:"#185FA5"}}>View →</span>
                  </div>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
