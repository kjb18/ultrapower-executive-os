"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import {
  MOODS, MOMENTUM, TB_COLORS, PW, PB,
  pad, getTodayKey, getResetMs, fmtCountdown, pctColor,
  DEFAULT_OS, DEFAULT_MFP, OSData, MFPDay,
} from "@/lib/constants";
import Calendar from "@/components/Calendar";

const Spinner = () => (
  <span style={{
    width:12,height:12,border:"2px solid #e2e6ea",
    borderTopColor:"#185FA5",borderRadius:"50%",
    animation:"spin 0.7s linear infinite",display:"inline-block"
  }}/>
);

export default function Dashboard() {
  const tk = getTodayKey();
  const [os, setOSRaw] = useState<OSData>(DEFAULT_OS);
  const [mfp, setMFPRaw] = useState<MFPDay>(DEFAULT_MFP);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());

  // Pomodoro
  const [pomoActive, setPomoActive] = useState(false);
  const [pomoSecs, setPomoSecs] = useState(PW);
  const [pomoMode, setPomoMode] = useState<"work"|"break">("work");
  const [pomoSessions, setPomoSessions] = useState(0);
  const [pomoMIT, setPomoMIT] = useState<number|null>(null);
  const pomoRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // UI state
  const [newMIT, setNewMIT] = useState("");
  const [editOKR, setEditOKR] = useState<number|null>(null);
  const [editKPI, setEditKPI] = useState<number|null>(null);
  const [insight, setInsight] = useState("");
  const [iLoad, setILoad] = useState(false);

  // Load from KV
  useEffect(() => {
    (async () => {
      const [osData, mfpData] = await Promise.all([
        kvGet<OSData>("dashboard"),
        kvGet<MFPDay>(`mfp:${tk}`),
      ]);
      if (osData) setOSRaw(osData);
      if (mfpData) setMFPRaw(mfpData);
      setLoaded(true);
    })();
  }, [tk]);

  // Save OS to KV on change
  const setOS = useCallback((patch: Partial<OSData>) => {
    setOSRaw(prev => {
      const next = { ...prev, ...patch };
      kvSet("dashboard", next);
      return next;
    });
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pomodoro
  useEffect(() => {
    if (pomoActive) {
      pomoRef.current = setInterval(() => {
        setPomoSecs(s => {
          if (s <= 1) {
            clearInterval(pomoRef.current!);
            setPomoActive(false);
            if (pomoMode === "work") { setPomoSessions(n => n+1); setPomoMode("break"); setPomoSecs(PB); }
            else { setPomoMode("work"); setPomoSecs(PW); }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else clearInterval(pomoRef.current!);
    return () => clearInterval(pomoRef.current!);
  }, [pomoActive, pomoMode]);

  const pomoTotal = pomoMode === "work" ? PW : PB;
  const pomoCirc = 2 * Math.PI * 28;
  const pomoDash = pomoCirc - ((pomoTotal - pomoSecs) / pomoTotal) * pomoCirc;

  // Derived
  const mitsDone = os.mits.filter(m => m.done).length;
  const mitsTotal = os.mits.length;
  const mfpScore = [mfp.mood, mfp.mitDone, mfp.winDone, mfp.reflDone].filter(Boolean).length;
  const pts = mitsDone*2 + (mfp.mood?1:0) + (mfp.mitDone?1:0) + (mfp.winDone?1:0) + (mfp.reflDone?1:0) + pomoSessions;
  const mom = [...MOMENTUM].reverse().find(s => pts >= s.min) || MOMENTUM[0];
  const activeMIT = os.mits.find(m => !m.done) || os.mits[0];
  const nowHH = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const curBlock = os.tbs.reduce((c, tb) => tb.time <= nowHH ? tb : c, null as typeof os.tbs[0] | null);
  const timeLeft = fmtCountdown(getResetMs() - now.getTime());
  const dayStr = now.toLocaleDateString("en-PH", { weekday:"short",year:"numeric",month:"short",day:"numeric" }).toUpperCase();
  const timeStr = now.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit" });

  const addMIT = () => {
    if (!newMIT.trim()) return;
    const id = os.nid || 100;
    setOS({ mits: [...os.mits, { id, text: newMIT.trim(), done: false }], nid: id+1 });
    setNewMIT("");
  };

  const callAPI = async (system: string, user: string) => {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, max_tokens: 400 }),
    });
    const d = await res.json();
    return d?.text || null;
  };

  const getInsight = async () => {
    setILoad(true); setInsight("");
    const ctx = `MITs: ${os.mits.map(m=>`${m.done?"[done]":"[open]"} ${m.text}`).join("; ")}. OKRs: ${os.okrs.map(o=>`${o.name} ${o.pct}%`).join(", ")}. KPIs: ${os.kpis.map(k=>`${k.label} ${k.value}`).join(", ")}.`;
    try {
      const txt = await callAPI(`Executive AI advisor for Khalil Banares, Ultra Power Industrial Resources, Makati PH. 2-3 sharp actionable insights. Direct. Under 100 words.`, ctx);
      setInsight(txt || "Could not generate insight.");
    } catch { setInsight("Connection error."); }
    setILoad(false);
  };

  const panel: React.CSSProperties = { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"13px 15px" };
  const plabel: React.CSSProperties = { fontSize:9, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:"#b0bec8", marginBottom:9, fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", justifyContent:"space-between" };
  const inp: React.CSSProperties = { fontSize:11, padding:"6px 8px", borderRadius:7, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#1a2332", fontFamily:"var(--font-sans)" };
  const addBtn: React.CSSProperties = { fontSize:11, padding:"6px 10px", borderRadius:7, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" };

  if (!loaded) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#b0bec8", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
      Loading dashboard...
    </div>
  );

  return (
    <div style={{ flex:1, overflow:"auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .del-btn{font-size:10px;color:#d0d8e0;cursor:pointer;padding:0 2px} .del-btn:hover{color:#A32D2D} .okr-row-item{padding:6px 0;border-bottom:0.5px solid #f0f2f5;cursor:pointer} .okr-row-item:last-child{border-bottom:none} .kpi-c{background:#f8f9fb;border:0.5px solid #eaecef;border-radius:9px;padding:8px 10px;cursor:pointer} .tb-r{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid #f0f2f5} .tb-r:last-child{border-bottom:none} .ai-b{width:100%;padding:9px;border-radius:9px;border:0.5px solid #e2e6ea;background:#f8f9fb;color:#1a2332;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px} .ai-b:hover:not(:disabled){background:#EBF3FC;border-color:#c5ddf5;color:#185FA5} .ai-b:disabled{opacity:0.6;cursor:not-allowed}`}</style>

      {/* Topbar */}
      <div style={{ background:"#fff", borderBottom:"0.5px solid #e2e6ea", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:5 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#1a2332" }}>Executive Dashboard</div>
          <div style={{ fontSize:10, color:"#8a9ab0", fontFamily:"'DM Mono',monospace", marginTop:1 }}>Khalil Joseph Banares · Ultra Power Industrial Resources</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:mom.color, flexShrink:0, boxShadow:`0 0 5px ${mom.color}88` }}/>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:mom.color }}>{mom.label}</div>
              <div style={{ fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace", letterSpacing:"0.06em", textTransform:"uppercase" }}>Daily Momentum</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", fontFamily:"'DM Mono',monospace" }}>{timeStr}</div>
            <div style={{ fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>{dayStr}</div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding:"12px 14px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:10 }}>

        {/* MITs */}
        <div style={panel}>
          <div style={plabel}><span>Most Important Tasks</span><span style={{ color:mitsDone===mitsTotal?"#3B6D11":"#854F0B" }}>{mitsDone}/{mitsTotal}</span></div>
          {os.mits.map((m, i) => (
            <div key={m.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"5px 0", borderBottom: i===os.mits.length-1?"none":"0.5px solid #f0f2f5" }}>
              <div onClick={() => setOS({ mits: os.mits.map(x => x.id===m.id ? {...x,done:!x.done} : x) })}
                style={{ width:14,height:14,borderRadius:3,border:`1.5px solid ${m.done?"#185FA5":"#d0d8e0"}`,background:m.done?"#185FA5":"#fff",flexShrink:0,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9,color:"#fff" }}>
                {m.done ? "✓" : ""}
              </div>
              <div style={{ fontSize:11,color:m.done?"#b0bec8":m.id===activeMIT?.id?"#185FA5":"#3a4a5a",flex:1,lineHeight:1.4,textDecoration:m.done?"line-through":"none",fontWeight:!m.done&&m.id===activeMIT?.id?500:400 }}>{m.text}</div>
              <div className="del-btn" onClick={() => setOS({ mits: os.mits.filter(x => x.id!==m.id) })}>✕</div>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            <input style={{ ...inp, flex:1 }} placeholder="Add a task..." value={newMIT} onChange={e=>setNewMIT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMIT()}/>
            <button style={addBtn} onClick={addMIT}>+ Add</button>
          </div>
        </div>

        {/* Pomodoro */}
        <div style={{ ...panel, display:"flex", flexDirection:"column", alignItems:"center" }}>
          <div style={{ ...plabel, width:"100%" }}><span>Pomodoro</span><span style={{ color:"#8a9ab0" }}>{pomoSessions} sessions</span></div>
          <div style={{ fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:4,alignSelf:"flex-start",textTransform:"uppercase",letterSpacing:"0.08em" }}>Linked to MIT</div>
          <select style={{ width:"100%",fontSize:11,padding:"5px 8px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginBottom:10 }}
            value={pomoMIT||""} onChange={e=>setPomoMIT(e.target.value?Number(e.target.value):null)}>
            <option value="">— Select MIT —</option>
            {os.mits.filter(m=>!m.done).map(m=><option key={m.id} value={m.id}>{m.text.slice(0,40)}{m.text.length>40?"…":""}</option>)}
          </select>
          <svg width="96" height="96" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="28" fill="none" stroke="#f0f2f5" strokeWidth="4"/>
            <circle cx="36" cy="36" r="28" fill="none" stroke={pomoMode==="work"?"#185FA5":"#3B6D11"} strokeWidth="4" strokeDasharray={pomoCirc} strokeDashoffset={pomoDash} strokeLinecap="round" transform="rotate(-90 36 36)"/>
          </svg>
          <div style={{ fontSize:26,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace",marginTop:-74 }}>{pad(Math.floor(pomoSecs/60))}:{pad(pomoSecs%60)}</div>
          <div style={{ marginTop:42,fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10 }}>{pomoMode==="work"?"Deep Work":"Break"}</div>
          <div style={{ display:"flex", gap:6 }}>
            <button style={{ ...addBtn, background:pomoActive?"#FEF0F0":"#EBF3FC", color:pomoActive?"#A32D2D":"#185FA5", borderColor:pomoActive?"#f5c6c6":"#185FA5" }} onClick={()=>setPomoActive(a=>!a)}>{pomoActive?"⏸ Pause":"▶ Start"}</button>
            <button style={{ ...addBtn, background:"#f8f9fb", color:"#6a8aaa", borderColor:"#e2e6ea" }} onClick={()=>{setPomoActive(false);setPomoSecs(PW);setPomoMode("work");}}>↺ Reset</button>
          </div>
        </div>

        {/* OKRs */}
        <div style={panel}>
          <div style={plabel}><span>OKR Tracker</span><span>double-tap to edit</span></div>
          {os.okrs.map(o => (
            <div key={o.id} className="okr-row-item" onDoubleClick={()=>setEditOKR(o.id)}>
              {editOKR===o.id ? (
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <input style={{ ...inp, width:"100%", border:"1px solid #185FA5" }} defaultValue={o.name}
                    onBlur={e=>{setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,name:e.target.value}:x)});setEditOKR(null);}} autoFocus/>
                  <input style={{ ...inp, width:"100%", border:"1px solid #185FA5" }} type="number" min="0" max="100" defaultValue={o.pct}
                    onBlur={e=>{setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,pct:Math.min(100,Math.max(0,Number(e.target.value)))}:x)});setEditOKR(null);}}/>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:11, color:"#3a4a5a" }}>{o.name}</span>
                    <span style={{ fontSize:10, fontWeight:600, fontFamily:"'DM Mono',monospace", color:pctColor(o.pct) }}>{o.pct}%</span>
                  </div>
                  <div style={{ height:3, background:"#f0f2f5", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:2, width:`${o.pct}%`, background:pctColor(o.pct), transition:"width 0.3s" }}/>
                  </div>
                  {o.note && <div style={{ fontSize:9, color:"#b0bec8", marginTop:2 }}>{o.note}</div>}
                </>
              )}
            </div>
          ))}
        </div>

        {/* KPIs */}
        <div style={panel}>
          <div style={plabel}><span>Business KPIs</span><span>double-tap to edit</span></div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {os.kpis.map(k => (
              <div key={k.id} className="kpi-c" onDoubleClick={()=>setEditKPI(k.id)}>
                {editKPI===k.id ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <input style={{ ...inp, width:"100%", border:"1px solid #185FA5", fontSize:12 }} defaultValue={k.value}
                      onBlur={e=>{setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,value:e.target.value}:x)});setEditKPI(null);}} autoFocus/>
                    <input style={{ ...inp, width:"100%", border:"1px solid #185FA5" }} defaultValue={k.delta}
                      onBlur={e=>{setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,delta:e.target.value}:x)});setEditKPI(null);}}/>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize:16, fontWeight:600, color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#1a2332", fontFamily:"'DM Mono',monospace" }}>{k.value}</div>
                    <div style={{ fontSize:9, color:"#b0bec8", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{k.label}</div>
                    <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", marginTop:3, color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#8a9ab0" }}>{k.up===true?"▲ ":k.up===false?"▼ ":"→ "}{k.delta}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Time Blocks */}
        <div style={{ ...panel, gridColumn:"span 2" }}>
          <div style={plabel}>
            <span>Time Blocks — Today</span>
            {curBlock && <span style={{ fontSize:9, background:"#EBF3FC", color:"#185FA5", padding:"2px 8px", borderRadius:20, fontFamily:"'DM Mono',monospace" }}>NOW: {curBlock.label}</span>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2 }}>
            {os.tbs.map(tb => (
              <div key={tb.id} className="tb-r">
                <div style={{ width:3, height:30, borderRadius:2, flexShrink:0, background:TB_COLORS[tb.type]||"#b0bec8" }}/>
                <div style={{ fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace", width:36, flexShrink:0 }}>{tb.time}</div>
                <div>
                  <div style={{ fontSize:11, color:"#3a4a5a", fontWeight:500 }}>
                    {tb.label}
                    {curBlock?.id===tb.id && <span style={{ fontSize:8, padding:"1px 5px", borderRadius:3, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace", marginLeft:4 }}>NOW</span>}
                  </div>
                  <div style={{ fontSize:9, color:"#b0bec8", marginTop:1 }}>{tb.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insight */}
        <div style={{ ...panel, gridColumn:"span 2" }}>
          <div style={plabel}><span>AI Insight</span><span>Powered by Claude</span></div>
          <button className="ai-b" onClick={getInsight} disabled={iLoad}>
            {iLoad ? <Spinner/> : <span>✦</span>}
            <span>{iLoad?"Analyzing your dashboard...":insight?"Refresh insight":"Generate AI insight"}</span>
          </button>
          {insight && <div style={{ marginTop:10, padding:"11px 13px", borderRadius:9, background:"#f8f9fb", border:"0.5px solid #e2e6ea", fontSize:12, color:"#1a2332", lineHeight:1.7, borderLeft:"3px solid #185FA5" }}>{insight}</div>}
        </div>

        {/* ClickUp Calendar */}
        <Calendar timeBlocks={os.tbs} />

      </div>
      <div style={{ textAlign:"center", fontSize:9, color:"#c8d0d8", fontFamily:"'DM Mono',monospace", padding:"8px 0 12px" }}>Ultra Power Executive OS · Resets in {timeLeft}</div>
    </div>
  );
}
