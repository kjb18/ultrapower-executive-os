"use client";
import { useState, useRef } from "react";

export default function SocialMedia() {
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const generateTopics = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are a B2B content strategist for Ultra Power Industrial Resources Inc., a Philippine industrial lighting distributor based in Makati. Clients include EDC, NGCP, First Gen, Aboitiz Power, and government entities. You specialize in LinkedIn articles and SEO blog posts for industrial B2B audiences.",
          user: "Generate 8 specific, compelling article topic ideas. Make each topic highly relevant to Philippine industrial procurement, lighting solutions, energy efficiency, or B2B sales. Return ONLY a JSON array of strings, no markdown, no preamble. Example: [\"Topic 1\",\"Topic 2\"]",
          max_tokens: 600,
        }),
      });
      const data = await res.json();
      const raw = data.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      let topics: string[] = [];
      try { topics = JSON.parse(cleaned); } catch {
        const m = cleaned.match(/\[[\s\S]*?\]/);
        if (m) topics = JSON.parse(m[0]);
      }
      // Send topics to iframe via postMessage
      if (topics.length > 0 && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "TOPICS", topics }, "*");
      }
    } catch (e) {
      console.error("Topic generation error:", e);
    }
    setGenerating(false);
  };

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e2e6ea", padding:"0 18px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, height:52 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#1a2332" }}>Social Media OS</div>
          <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>LinkedIn · Facebook · Content Calendar</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button
            onClick={generateTopics}
            disabled={generating}
            style={{ fontSize:12, padding:"5px 12px", borderRadius:8, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", gap:6, opacity:generating?0.7:1 }}>
            {generating ? (
              <><span style={{width:10,height:10,border:"1.5px solid #c5ddf5",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/> Generating...</>
            ) : (
              <>✦ Generate Topics</>
            )}
          </button>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>LI</span>
          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>FB</span>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {/* Iframe */}
      <div style={{ flex:1, position:"relative" }}>
        {!loaded && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#f0f2f5", color:"#b0bec8", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
            Loading Social Media OS...
          </div>
        )}
        <iframe
          ref={iframeRef}
          src="/tools/social.html"
          style={{ width:"100%", height:"100%", border:"none" }}
          onLoad={() => setLoaded(true)}
          title="Social Media OS"
        />
      </div>
    </div>
  );
}
