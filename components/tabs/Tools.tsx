"use client";
import { useState } from "react";
import { TOOLS } from "@/lib/constants";

export default function Tools() {
  const [active, setActive] = useState<string|null>(null);
  const activeTool = TOOLS.find(t => t.id === active);

  const categoryColor: Record<string,{bg:string;fg:string}> = {
    Procurement: { bg:"#EBF3FC", fg:"#185FA5" },
    Sales:       { bg:"#f0faf5", fg:"#3B6D11" },
    Operations:  { bg:"#FFF8EC", fg:"#854F0B" },
  };

  return (
    <div style={{ flex:1, overflow:"auto", padding:14 }}>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:16, fontWeight:600, color:"#1a2332" }}>Tools</div>
        <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace", marginTop:2 }}>Your Ultra Power tool suite — all in one place</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
        {TOOLS.map(tool => {
          const cc = categoryColor[tool.category] || { bg:"#f0f2f5", fg:"#4a6a8a" };
          return (
            <div key={tool.id} style={{ background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"18px 16px", display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                <div style={{ fontSize:28, lineHeight:1 }}>{tool.icon}</div>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:cc.bg, color:cc.fg, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{tool.category}</span>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#1a2332", marginBottom:4 }}>{tool.name}</div>
                <div style={{ fontSize:12, color:"#4a6a8a", lineHeight:1.5 }}>{tool.description}</div>
              </div>
              <button onClick={() => setActive(tool.id)} style={{ marginTop:"auto", width:"100%", padding:"8px", borderRadius:8, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                Launch →
              </button>
            </div>
          );
        })}
      </div>

      {/* Tool modal overlay */}
      {active && activeTool && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:100, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#fff", borderBottom:"0.5px solid #e2e6ea", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:18 }}>{activeTool.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#1a2332" }}>{activeTool.name}</div>
                <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>{activeTool.category}</div>
              </div>
            </div>
            <button onClick={() => setActive(null)} style={{ padding:"6px 14px", borderRadius:8, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#4a6a8a", cursor:"pointer", fontSize:12, fontWeight:500 }}>
              ✕ Close
            </button>
          </div>
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:"#b0bec8" }}>
            <div style={{ fontSize:40 }}>{activeTool.icon}</div>
            <div style={{ fontSize:14, fontWeight:600, color:"#1a2332" }}>{activeTool.name}</div>
            <div style={{ fontSize:12, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>Rebuilt version coming in Sprint 3</div>
          </div>
        </div>
      )}
    </div>
  );
}
