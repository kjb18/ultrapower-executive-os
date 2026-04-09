"use client";
import { useState, useEffect, useCallback } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import { BRAIN_TYPES, BRAIN_COLORS, BrainItem, BrainType } from "@/lib/constants";

export default function SecondBrain() {
  const [items, setItemsRaw] = useState<BrainItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [type, setType] = useState<BrainType>("Idea");
  const [filter, setFilter] = useState<BrainType|"All">("All");
  const [search, setSearch] = useState("");
  const [nid, setNid] = useState(200);

  useEffect(() => {
    (async () => {
      const data = await kvGet<{items:BrainItem[];nid:number}>("brain");
      if (data) { setItemsRaw(data.items); setNid(data.nid); }
      setLoaded(true);
    })();
  }, []);

  const setItems = useCallback((next:BrainItem[], nextNid?:number) => {
    setItemsRaw(next);
    kvSet("brain", {items:next, nid:nextNid??nid});
    if (nextNid) setNid(nextNid);
  }, [nid]);

  const addItem = () => {
    if (!input.trim()) return;
    const newItem:BrainItem = {id:nid, type, text:input.trim()};
    setItems([newItem,...items], nid+1);
    setInput("");
  };

  const filtered = items
    .filter(b => filter==="All" || b.type===filter)
    .filter(b => !search || b.text.toLowerCase().includes(search.toLowerCase()));

  const P:React.CSSProperties = {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"18px 20px"};
  const INP:React.CSSProperties = {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332"};

  return (
    <div style={{flex:1,overflow:"auto",padding:16}}>
      <div style={{maxWidth:640,margin:"0 auto"}}>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:600,color:"#1a2332"}}>Second Brain</div>
          <div style={{fontSize:12,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>Typed capture — Idea, Decision, Task, Reference, Note</div>
        </div>
        <div style={P}>
          {/* Type selector */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {BRAIN_TYPES.map(t=>(
              <button key={t} onClick={()=>setType(t)} style={{fontSize:12,padding:"4px 11px",borderRadius:20,border:"0.5px solid #e2e6ea",cursor:"pointer",fontWeight:500,background:type===t?BRAIN_COLORS[t].fg:"#fff",color:type===t?"#fff":"#8a9ab0",borderColor:type===t?BRAIN_COLORS[t].fg:"#e2e6ea"}}>
                {t}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input style={{...INP,flex:1}} placeholder="What's on your mind?" value={input}
              onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}/>
            <button onClick={addItem} style={{fontSize:13,padding:"8px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>+ Capture</button>
          </div>

          {/* Search bar */}
          <div style={{marginBottom:12}}>
            <input style={{...INP,width:"100%"}} placeholder="Search your brain..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>

          {/* Filter pills */}
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {(["All",...BRAIN_TYPES] as const).map(t=>(
              <button key={t} onClick={()=>setFilter(t as BrainType|"All")} style={{fontSize:12,padding:"4px 11px",borderRadius:20,border:"0.5px solid #e2e6ea",cursor:"pointer",fontWeight:500,background:filter===t?(t==="All"?"#1a2332":BRAIN_COLORS[t as BrainType].fg):"#fff",color:filter===t?"#fff":"#8a9ab0",borderColor:filter===t?(t==="All"?"#1a2332":BRAIN_COLORS[t as BrainType].fg):"#e2e6ea"}}>
                {t}
              </button>
            ))}
          </div>

          {/* Items */}
          {!loaded&&<div style={{fontSize:13,color:"#b0bec8",textAlign:"center",padding:"24px 0"}}>Loading...</div>}
          {loaded&&filtered.length===0&&<div style={{fontSize:13,color:"#b0bec8",textAlign:"center",padding:"24px 0"}}>{search?"No results found.":"Nothing captured yet."}</div>}
          {filtered.map((b,i)=>(
            <div key={b.id} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"8px 0",borderBottom:i===filtered.length-1?"none":"0.5px solid #f0f2f5"}}>
              <span style={{fontSize:10,padding:"3px 8px",borderRadius:20,fontWeight:600,fontFamily:"'DM Mono',monospace",flexShrink:0,marginTop:2,background:BRAIN_COLORS[b.type]?.bg,color:BRAIN_COLORS[b.type]?.fg}}>
                {b.type.toUpperCase()}
              </span>
              <div style={{fontSize:14,color:"#3a4a5a",lineHeight:1.5,flex:1}}>{b.text}</div>
              <div onClick={()=>setItems(items.filter(x=>x.id!==b.id))} style={{fontSize:11,color:"#d0d8e0",cursor:"pointer",padding:"0 3px",flexShrink:0}}>✕</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
