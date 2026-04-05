"use client";
import { useState, useEffect } from "react";

interface Bid {
  id: string;
  title: string;
  entity: string;
  category: string;
  amount: string;
  deadline: string;
  published: string;
  url: string;
  status: string;
}

interface Results {
  results: Bid[];
  total: number;
  page: number;
  totalPages: number;
  _mock?: boolean;
}

const SAVED_KEY = "philgeps-saved";

export default function PhilGEPSHub() {
  const [keyword, setKeyword] = useState("LED lighting");
  const [searchInput, setSearchInput] = useState("LED lighting");
  const [results, setResults] = useState<Results|null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<string[]>([]);
  const [view, setView] = useState<"search"|"saved">("search");

  useEffect(() => {
    try {
      const s = localStorage.getItem(SAVED_KEY);
      if (s) setSaved(JSON.parse(s));
    } catch {}
    search("LED lighting", 1);
  }, []);

  const search = async (kw: string, pg: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/philgeps?keyword=${encodeURIComponent(kw)}&page=${pg}`);
      const data = await res.json();
      setResults(data);
      setPage(pg);
    } catch {
      setResults({ results:[], total:0, page:1, totalPages:1 });
    }
    setLoading(false);
  };

  const handleSearch = () => {
    setKeyword(searchInput);
    search(searchInput, 1);
  };

  const toggleSave = (id: string) => {
    const next = saved.includes(id) ? saved.filter(s=>s!==id) : [...saved, id];
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
  };

  const savedBids = results?.results.filter(b => saved.includes(b.id)) || [];

  const S = {
    panel: { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, overflow:"hidden" } as React.CSSProperties,
    th: { fontSize:9, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase" as const, color:"#b0bec8", padding:"8px 12px", textAlign:"left" as const, borderBottom:"0.5px solid #f0f2f5", background:"#fafbfc", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" as const },
    td: { fontSize:11, color:"#3a4a5a", padding:"8px 12px", borderBottom:"0.5px solid #f0f2f5", verticalAlign:"top" as const } as React.CSSProperties,
    inp: { fontSize:12, padding:"7px 10px", borderRadius:8, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#1a2332" } as React.CSSProperties,
    tabBtn: (a:boolean):React.CSSProperties => ({ padding:"8px 16px", border:"none", background:"none", cursor:"pointer", fontSize:12, color:a?"#185FA5":"#8a9ab0", borderBottom:`2px solid ${a?"#185FA5":"transparent"}`, fontWeight:a?600:400 }),
  };

  const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

  return (
    <div style={{ flex:1, overflow:"auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e2e6ea", padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:5, height:52 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#1a2332" }}>PhilGEPS Hub</div>
          <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>Philippine Government Electronic Procurement System</div>
        </div>
        <div style={{ display:"flex" }}>
          <button style={S.tabBtn(view==="search")} onClick={()=>setView("search")}>Search</button>
          <button style={S.tabBtn(view==="saved")} onClick={()=>setView("saved")}>
            Saved {saved.length>0&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",marginLeft:4}}>{saved.length}</span>}
          </button>
        </div>
      </div>

      <div style={{ padding:14 }}>

        {view==="search" && <>
          {/* Search bar */}
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            <input style={{ ...S.inp, flex:1, minWidth:200 }} placeholder="Search keyword e.g. LED lighting, industrial fixtures..."
              value={searchInput} onChange={e=>setSearchInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSearch()}/>
            <button onClick={handleSearch} disabled={loading} style={{ padding:"7px 16px", borderRadius:8, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
              {loading?<Spinner/>:<span>🔍</span>}
              {loading?"Searching...":"Search PhilGEPS"}
            </button>
          </div>

          {/* Quick filter chips */}
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {["LED lighting","industrial lighting","Goodlite","Philips","lighting fixtures","substation","power plant"].map(kw=>(
              <button key={kw} onClick={()=>{setSearchInput(kw);setKeyword(kw);search(kw,1);}}
                style={{ fontSize:10, padding:"3px 9px", borderRadius:20, border:`0.5px solid ${keyword===kw?"#185FA5":"#e2e6ea"}`, background:keyword===kw?"#EBF3FC":"#fff", color:keyword===kw?"#185FA5":"#8a9ab0", cursor:"pointer", fontWeight:keyword===kw?600:400 }}>
                {kw}
              </button>
            ))}
          </div>

          {/* Stats row */}
          {results && !loading && (
            <div style={{ display:"flex", gap:12, marginBottom:12, flexWrap:"wrap" }}>
              <div style={{ fontSize:11, color:"#8a9ab0" }}>
                <span style={{ fontWeight:600, color:"#1a2332", fontFamily:"'DM Mono',monospace" }}>{results.total}</span> results for "{keyword}"
                {results._mock && <span style={{ fontSize:9, padding:"1px 7px", borderRadius:20, background:"#FFF8EC", color:"#854F0B", fontFamily:"'DM Mono',monospace", marginLeft:8 }}>Sample data · PhilGEPS offline</span>}
              </div>
            </div>
          )}

          {/* Results table */}
          {loading && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40, gap:10, color:"#b0bec8", fontSize:12 }}>
              <Spinner/> Searching PhilGEPS...
            </div>
          )}

          {!loading && results && (
            <>
              <div style={S.panel}>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>
                      {["#","Bid Title","Procuring Entity","Category","ABC","Deadline","Published",""].map(h=><th key={h} style={S.th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {results.results.length===0 && (
                        <tr><td colSpan={8} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>No results found. Try a different keyword.</td></tr>
                      )}
                      {results.results.map((bid,i)=>(
                        <tr key={bid.id} style={{ background:i%2===0?"#fff":"#fafbfc" }}>
                          <td style={{...S.td,color:"#b0bec8",fontSize:10,whiteSpace:"nowrap"}}>{bid.id}</td>
                          <td style={{ ...S.td, maxWidth:280 }}>
                            <a href={bid.url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize:12, color:"#185FA5", fontWeight:500, lineHeight:1.4, textDecoration:"none", display:"block" }}
                              onMouseEnter={e=>(e.currentTarget.style.textDecoration="underline")}
                              onMouseLeave={e=>(e.currentTarget.style.textDecoration="none")}>
                              {bid.title}
                            </a>
                            <span style={{ fontSize:10, padding:"1px 6px", borderRadius:20, background:"#f0faf5", color:"#3B6D11", fontFamily:"'DM Mono',monospace", marginTop:4, display:"inline-block" }}>{bid.status}</span>
                          </td>
                          <td style={{ ...S.td, fontSize:11, color:"#4a6a8a", maxWidth:180 }}>{bid.entity}</td>
                          <td style={{ ...S.td, whiteSpace:"nowrap" as const }}>
                            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>{bid.category}</span>
                          </td>
                          <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, whiteSpace:"nowrap" as const, color:"#3B6D11", fontWeight:500 }}>{bid.amount}</td>
                          <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10, whiteSpace:"nowrap" as const, color: new Date(bid.deadline) < new Date() ? "#A32D2D" : "#1a2332" }}>{bid.deadline}</td>
                          <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10, whiteSpace:"nowrap" as const, color:"#b0bec8" }}>{bid.published}</td>
                          <td style={S.td}>
                            <button onClick={()=>toggleSave(bid.id)} title={saved.includes(bid.id)?"Remove from saved":"Save bid"}
                              style={{ fontSize:14, background:"none", border:"none", cursor:"pointer", color:saved.includes(bid.id)?"#185FA5":"#d0d8e0", transition:"color 0.1s" }}>
                              {saved.includes(bid.id)?"★":"☆"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {results.totalPages > 1 && (
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderTop:"0.5px solid #f0f2f5" }}>
                    <button onClick={()=>search(keyword,page-1)} disabled={page<=1||loading}
                      style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:"0.5px solid #e2e6ea", background:"#f8f9fb", cursor:"pointer", color:"#4a6a8a" }}>← Prev</button>
                    <span style={{ fontSize:11, color:"#8a9ab0", fontFamily:"'DM Mono',monospace" }}>Page {results.page} of {results.totalPages} · {results.total} results</span>
                    <button onClick={()=>search(keyword,page+1)} disabled={page>=results.totalPages||loading}
                      style={{ fontSize:11, padding:"4px 10px", borderRadius:7, border:"0.5px solid #e2e6ea", background:"#f8f9fb", cursor:"pointer", color:"#4a6a8a" }}>Next →</button>
                  </div>
                )}
              </div>
            </>
          )}
        </>}

        {view==="saved" && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:11, fontWeight:600, color:"#1a2332" }}>Saved Bids</span>
              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>{saved.length}</span>
            </div>
            <div style={S.panel}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>{["#","Bid Title","Entity","Amount","Deadline",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {saved.length===0&&<tr><td colSpan={6} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"32px"}}>No saved bids yet. Star a bid from Search to save it here.</td></tr>}
                    {results?.results.filter(b=>saved.includes(b.id)).map((bid,i)=>(
                      <tr key={bid.id}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:10}}>{i+1}</td>
                        <td style={{ ...S.td, maxWidth:280 }}>
                          <a href={bid.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:"#185FA5", fontWeight:500, textDecoration:"none" }}>{bid.title}</a>
                        </td>
                        <td style={{ ...S.td, fontSize:11, color:"#4a6a8a" }}>{bid.entity}</td>
                        <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:11, color:"#3B6D11", fontWeight:500 }}>{bid.amount}</td>
                        <td style={{ ...S.td, fontFamily:"'DM Mono',monospace", fontSize:10 }}>{bid.deadline}</td>
                        <td style={S.td}><button onClick={()=>toggleSave(bid.id)} style={{ fontSize:14, background:"none", border:"none", cursor:"pointer", color:"#185FA5" }}>★</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
