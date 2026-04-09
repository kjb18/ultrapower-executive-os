"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import {
  MOMENTUM, TB_COLORS, PW, PB,
  pad, getTodayKey, getResetMs, fmtCountdown, pctColor,
  DEFAULT_OS, DEFAULT_MFP, OSData, MFPDay, TimeBlock,
} from "@/lib/constants";
import Calendar from "@/components/Calendar";

function playChime(type: "start"|"end") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    if (type === "start") {
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now+i*0.15);
        gain.gain.linearRampToValueAtTime(0.35, now+i*0.15+0.05);
        gain.gain.linearRampToValueAtTime(0, now+i*0.15+0.3);
        osc.start(now+i*0.15); osc.stop(now+i*0.15+0.35);
      });
    } else {
      [880, 698.46, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "triangle"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now+i*0.22);
        gain.gain.linearRampToValueAtTime(0.45, now+i*0.22+0.04);
        gain.gain.linearRampToValueAtTime(0, now+i*0.22+0.45);
        osc.start(now+i*0.22); osc.stop(now+i*0.22+0.5);
      });
    }
  } catch {}
}

const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

export default function Dashboard() {
  const tk = getTodayKey();
  const [os, setOSRaw] = useState<OSData>(DEFAULT_OS);
  const [mfp, setMFPRaw] = useState<MFPDay>(DEFAULT_MFP);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pomoActive, setPomoActive] = useState(false);
  const [pomoSecs, setPomoSecs] = useState(PW);
  const [pomoMode, setPomoMode] = useState<"work"|"break">("work");
  const [pomoSessions, setPomoSessions] = useState(0);
  const [pomoMIT, setPomoMIT] = useState<number|null>(null);
  const pomoRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [newMIT, setNewMIT] = useState("");
  const [editOKR, setEditOKR] = useState<number|null>(null);
  const [editKPI, setEditKPI] = useState<number|null>(null);
  const [editTB, setEditTB] = useState<number|null>(null);
  const [insight, setInsight] = useState("");
  const [iLoad, setILoad] = useState(false);

  useEffect(() => {
    (async () => {
      const [osData, mfpData] = await Promise.all([kvGet<OSData>("dashboard"), kvGet<MFPDay>(`mfp:${tk}`)]);
      if (osData) setOSRaw(osData);
      if (mfpData) setMFPRaw(mfpData);
      setLoaded(true);
    })();
  }, [tk]);

  const setOS = useCallback((patch: Partial<OSData>) => {
    setOSRaw(prev => { const next = {...prev,...patch}; kvSet("dashboard",next); return next; });
  }, []);

  useEffect(() => { const id = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); }, []);

  useEffect(() => {
    if (pomoActive) {
      pomoRef.current = setInterval(() => {
        setPomoSecs(s => {
          if (s <= 1) {
            clearInterval(pomoRef.current!); setPomoActive(false); playChime("end");
            if (pomoMode==="work") { setPomoSessions(n=>n+1); setPomoMode("break"); setPomoSecs(PB); }
            else { setPomoMode("work"); setPomoSecs(PW); }
            return 0;
          }
          return s-1;
        });
      }, 1000);
    } else clearInterval(pomoRef.current!);
    return () => clearInterval(pomoRef.current!);
  }, [pomoActive, pomoMode]);

  const pomoTotal = pomoMode==="work"?PW:PB;
  const pomoCirc = 2*Math.PI*34;
  const pomoDash = pomoCirc - ((pomoTotal-pomoSecs)/pomoTotal)*pomoCirc;
  const mitsDone = os.mits.filter(m=>m.done).length;
  const mitsTotal = os.mits.length;
  const pts = mitsDone*2+(mfp.mood?1:0)+(mfp.mitDone?1:0)+(mfp.winDone?1:0)+(mfp.reflDone?1:0)+pomoSessions;
  const mom = [...MOMENTUM].reverse().find(s=>pts>=s.min)||MOMENTUM[0];
  const activeMIT = os.mits.find(m=>!m.done)||os.mits[0];
  const nowHH = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const curBlock = os.tbs.reduce((c,tb)=>tb.time<=nowHH?tb:c, null as TimeBlock|null);
  const timeLeft = fmtCountdown(getResetMs()-now.getTime());
  const dayStr = now.toLocaleDateString("en-PH",{weekday:"short",year:"numeric",month:"short",day:"numeric"}).toUpperCase();
  const timeStr = now.toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"});

  const addMIT = () => { if(!newMIT.trim())return; const id=os.nid||100; setOS({mits:[...os.mits,{id,text:newMIT.trim(),done:false}],nid:id+1}); setNewMIT(""); };
  const callAPI = async (system:string,user:string) => { const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system,user,max_tokens:400})}); const d=await res.json(); return d?.text||null; };
  const getInsight = async () => { setILoad(true); setInsight(""); const ctx=`MITs: ${os.mits.map(m=>`${m.done?"[done]":"[open]"} ${m.text}`).join("; ")}. OKRs: ${os.okrs.map(o=>`${o.name} ${o.pct}%`).join(", ")}. KPIs: ${os.kpis.map(k=>`${k.label} ${k.value}`).join(", ")}.`; try { const txt=await callAPI(`Executive AI advisor for Khalil Banares, Ultra Power Industrial Resources, Makati PH. 2-3 sharp actionable insights. Direct. Under 100 words.`,ctx); setInsight(txt||"Could not generate insight."); } catch { setInsight("Connection error."); } setILoad(false); };

  const P:React.CSSProperties = {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"18px 20px"};
  const PL:React.CSSProperties = {fontSize:11,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"#b0bec8",marginBottom:12,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",justifyContent:"space-between"};
  const INP:React.CSSProperties = {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332"};
  const ABTN:React.CSSProperties = {fontSize:13,padding:"8px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"};

  if (!loaded) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:14,fontFamily:"'DM Mono',monospace"}}>Loading dashboard...</div>;

  return (
    <div style={{flex:1,overflow:"auto"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .del-btn{font-size:12px;color:#d0d8e0;cursor:pointer;padding:0 3px} .del-btn:hover{color:#A32D2D} .okr-item{padding:8px 0;border-bottom:0.5px solid #f0f2f5;cursor:pointer} .okr-item:last-child{border-bottom:none} .kpi-c{background:#f8f9fb;border:0.5px solid #eaecef;border-radius:10px;padding:12px 14px;cursor:pointer} .tb-r{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid #f0f2f5} .tb-r:last-child{border-bottom:none} .ai-b{width:100%;padding:12px;border-radius:10px;border:0.5px solid #e2e6ea;background:#f8f9fb;color:#1a2332;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px} .ai-b:hover:not(:disabled){background:#EBF3FC;border-color:#c5ddf5;color:#185FA5} .ai-b:disabled{opacity:0.6;cursor:not-allowed}`}</style>

      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5}}>
        <div>
          <div style={{fontSize:17,fontWeight:600,color:"#1a2332"}}>Executive Dashboard</div>
          <div style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",marginTop:2}}>Khalil Joseph Banares · Ultra Power Industrial Resources</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:12,height:12,bord
