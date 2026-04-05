"use client";
import { useState } from "react";

export default function SocialMedia() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e2e6ea", padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, height:52 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#1a2332" }}>Social Media OS</div>
          <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>LinkedIn · Facebook · Content Calendar</div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>LI</span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>FB</span>
        </div>
      </div>
      {/* Iframe */}
      <div style={{ flex:1, position:"relative" }}>
        {!loaded && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f2f5", color:"#b0bec8", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
            Loading Social Media OS...
          </div>
        )}
        <iframe
          src="/tools/social.html"
          style={{ width:"100%", height:"100%", border:"none", display:loaded?"block":"block" }}
          onLoad={() => setLoaded(true)}
          title="Social Media OS"
        />
      </div>
    </div>
  );
}
