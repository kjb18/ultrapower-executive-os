"use client";
import { useState, useEffect } from "react";

export type TabId = "dashboard"|"brain"|"mental"|"crm"|"social"|"learning"|"tools"|"generate";

const TABS: {id:TabId;label:string;icon:React.ReactNode}[] = [
  { id:"dashboard", label:"Dashboard", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg> },
  { id:"brain", label:"Second Brain", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg> },
  { id:"mental", label:"Mental Fitness", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17s-7-4.5-7-9a5 5 0 0 1 7-4.58A5 5 0 0 1 17 8c0 4.5-7 9-7 9z"/></svg> },
  { id:"crm", label:"CRM", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><path d="M1 17c0-3.3 2.7-6 6-6"/><circle cx="14" cy="8" r="2.5"/><path d="M10.5 17c0-2.5 1.6-4.5 3.5-4.5S17.5 14.5 17.5 17"/></svg> },
  { id:"social", label:"Social Media", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="M7 9l6-3M7 11l6 3"/></svg> },
  { id:"learning", label:"Daily Learning", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h16v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/><path d="M6 4V2M14 4V2M10 4v12M2 8h16"/></svg> },
  { id:"tools", label:"Tools", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14.5 2a3.5 3.5 0 0 0-3.4 4.2L3.3 14a1.5 1.5 0 0 0 2.1 2.1l8-7.8A3.5 3.5 0 1 0 14.5 2z"/><path d="M5 5l2 2"/></svg> },
]; { id: "generate", label: "Generate Topics", icon: "💡" }

interface SidebarProps { active: TabId; onChange: (t: TabId) => void; }

export default function Sidebar({ active, onChange }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem("sidebar-expanded"); if (s !== null) setExpanded(s==="true"); } catch {}
  }, []);

  const toggle = () => setExpanded(e => { try { localStorage.setItem("sidebar-expanded", String(!e)); } catch {} return !e; });
  const w = expanded ? 196 : 54;

  return (
    <aside style={{ width:w, minWidth:w, height:"100vh", background:"#fff", borderRight:"0.5px solid #e2e6ea", display:"flex", flexDirection:"column", transition:"width 0.2s ease, min-width 0.2s ease", overflow:"hidden", flexShrink:0, position:"relative", zIndex:5 }}>
      {/* Logo */}
      <div style={{ height:56, display:"flex", alignItems:"center", padding:"0 15px", gap:10, borderBottom:"0.5px solid #e2e6ea", flexShrink:0 }}>
        <div style={{ width:26, height:26, borderRadius:7, background:"#185FA5", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="#fff"/><rect x="8" y="1" width="5" height="5" rx="1" fill="#fff" opacity=".7"/><rect x="1" y="8" width="5" height="5" rx="1" fill="#fff" opacity=".7"/><rect x="8" y="8" width="5" height="5" rx="1" fill="#fff" opacity=".4"/></svg>
        </div>
        {expanded && (
          <div style={{ overflow:"hidden", whiteSpace:"nowrap" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a2332" }}>Executive OS</div>
            <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace", marginTop:1 }}>Ultra Power</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:"8px 0", overflowY:"auto" }}>
        {TABS.map(t => {
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} title={!expanded?t.label:undefined}
              style={{ width:"100%", display:"flex", alignItems:"center", gap:11, padding:expanded?"10px 15px":"10px 15px", border:"none", background:isActive?"#EBF3FC":"transparent", color:isActive?"#185FA5":"#6a8aaa", cursor:"pointer", borderRadius:0, borderLeft:`3px solid ${isActive?"#185FA5":"transparent"}`, transition:"all 0.1s" }}>
              <span style={{ flexShrink:0, display:"flex" }}>{t.icon}</span>
              {expanded && <span style={{ fontSize:13, fontWeight:isActive?600:400, whiteSpace:"nowrap", overflow:"hidden" }}>{t.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Toggle */}
      <button onClick={toggle} style={{ width:"100%", padding:"12px 15px", border:"none", borderTop:"0.5px solid #e2e6ea", background:"transparent", color:"#b0bec8", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {expanded ? <path d="M10 3L5 8l5 5"/> : <path d="M6 3l5 5-5 5"/>}
        </svg>
        {expanded && <span style={{ fontSize:12, whiteSpace:"nowrap" }}>Collapse</span>}
      </button>
    </aside>
  );
}
