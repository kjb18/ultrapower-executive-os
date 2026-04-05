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
  const [nid, setNid] = useState(200);

  useEffect(() => {
    (async () => {
      const data = await kvGet<{ items: BrainItem[]; nid: number }>("brain");
      if (data) { setItemsRaw(data.items); setNid(data.nid); }
      setLoaded(true);
    })();
  }, []);

  const setItems = useCallback((next: BrainItem[], nextNid?: number) => {
    setItemsRaw(next);
    kvSet("brain", { items: next, nid: nextNid ?? nid });
    if (nextNid) setNid(nextNid);
  }, [nid]);

  const addItem = () => {
    if (!input.trim()) return;
    const newItem: BrainItem = { id: nid, type, text: input.trim() };
    const next = [newItem, ...items];
    setItems(next, nid + 1);
    setInput("");
  };

  const filtered = filter === "All" ? items : items.filter(b => b.type === filter);

  const panel: React.CSSProperties = { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"13px 15px" };
  const inp: React.CSSProperties = { fontSize:11, padding:"6px 8px", borderRadius:7, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#1a2332" };

  return (
    <div style={{ flex:1, overflow:"auto", padding:14 }}>
      <div style={{ maxWidth:600, margin:"0 auto" }}>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:600, color:"#1a2332" }}>Second Brain</div>
          <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace", marginTop:2 }}>Typed capture — Idea, Decision, Task, Reference, Note</div>
        </div>
        <div style={panel}>
          <div style={{ display:"flex", gap:5, marginBottom:8, flexWrap:"wrap" }}>
            {BRAIN_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid #e2e6ea",
                cursor:"pointer", fontWeight:500, transition:"all 0.1s",
                background: type===t ? BRAIN_COLORS[t].fg : "#fff",
                color: type===t ? "#fff" : "#8a9ab0",
                borderColor: type===t ? BRAIN_COLORS[t].fg : "#e2e6ea",
              }}>{t}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            <input style={{ ...inp, flex:1 }} placeholder="What's on your mind?" value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addItem()}/>
            <button onClick={addItem} style={{ fontSize:11, padding:"6px 10px", borderRadius:7, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>+ Capture</button>
          </div>

          <div style={{ display:"flex", gap:5, marginBottom:12, flexWrap:"wrap" }}>
            {(["All", ...BRAIN_TYPES] as const).map(t => (
              <button key={t} onClick={() => setFilter(t as BrainType|"All")} style={{
                fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid #e2e6ea",
                cursor:"pointer", fontWeight:500,
                background: filter===t ? (t==="All"?"#1a2332":BRAIN_COLORS[t as BrainType].fg) : "#fff",
                color: filter===t ? "#fff" : "#8a9ab0",
                borderColor: filter===t ? (t==="All"?"#1a2332":BRAIN_COLORS[t as BrainType].fg) : "#e2e6ea",
              }}>{t}</button>
            ))}
          </div>

          {!loaded && <div style={{ fontSize:12, color:"#b0bec8", textAlign:"center", padding:"20px 0" }}>Loading...</div>}
          {loaded && filtered.length===0 && <div style={{ fontSize:12, color:"#b0bec8", textAlign:"center", padding:"20px 0" }}>No items. Capture something above.</div>}
          {filtered.map((b, i) => (
            <div key={b.id} style={{ display:"flex", alignItems:"flex-start", gap:7, padding:"6px 0", borderBottom:i===filtered.length-1?"none":"0.5px solid #f0f2f5" }}>
              <span style={{ fontSize:9, padding:"2px 7px", borderRadius:20, fontWeight:600, fontFamily:"'DM Mono',monospace", flexShrink:0, marginTop:1, background:BRAIN_COLORS[b.type]?.bg, color:BRAIN_COLORS[b.type]?.fg }}>{b.type.toUpperCase()}</span>
              <div style={{ fontSize:11, color:"#3a4a5a", lineHeight:1.4, flex:1 }}>{b.text}</div>
              <div onClick={() => setItems(items.filter(x=>x.id!==b.id))} style={{ fontSize:10, color:"#d0d8e0", cursor:"pointer", padding:"0 2px", flexShrink:0 }}>✕</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
