"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import {
  MOMENTUM, TB_COLORS, PW, PB,
  pad, getTodayKey, getResetMs, fmtCountdown, pctColor,
  DEFAULT_OS, DEFAULT_MFP, OSData, MFPDay, TimeBlock, MIT,
  BREWING_CATEGORIES, BREWING_COLORS, CROSSHAIRS_PRIORITY_COLORS,
  BrewingItem, CrosshairsTarget, MITArchiveEntry,
} from "@/lib/constants";
import Calendar from "@/components/Calendar";
import type { TabId } from "@/components/Sidebar";

// ── Pomodoro modes ──────────────────────────────────────────────────────────
const POMO_MODES = [
  { key:"standard", label:"Pomodoro", workMins:25, breakMins:5 },
  { key:"extended", label:"Extended", workMins:50, breakMins:10 },
  { key:"deepwork", label:"Deep Work", workMins:90, breakMins:0 },
] as const;
type PomoModeKey = typeof POMO_MODES[number]["key"];

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

interface PendingPO { id:number;poNumber:string;client:string;items:string;value:string;dateReceived:string;expectedDelivery:string;supplierStatus:string;status:string;notes:string; }
interface PendingRFQ { id:number;rfqNumber:string;client:string;subject:string;dateSubmitted:string;deadline:string;status:string;notes:string; }
interface CRMData { pendingPOs?:PendingPO[]; pendingRFQs?:PendingRFQ[]; [key:string]:unknown; }

const RFQ_STATUS_C: Record<string,{bg:string;fg:string}> = {
  "Draft":{bg:"#f0f2f5",fg:"#8a9ab0"},"Submitted":{bg:"#EBF3FC",fg:"#185FA5"},
  "Followed Up":{bg:"#FFF8EC",fg:"#854F0B"},"Awarded":{bg:"#f0faf5",fg:"#3B6D11"},
  "Lost":{bg:"#FEF0F0",fg:"#A32D2D"},"Cancelled":{bg:"#f0f2f5",fg:"#8a9ab0"},
};
const PO_STATUS_C: Record<string,{bg:string;fg:string}> = {
  "Received":{bg:"#EBF3FC",fg:"#185FA5"},"Processing":{bg:"#FFF8EC",fg:"#854F0B"},
  "Ordered from Supplier":{bg:"#F4F3FE",fg:"#534AB7"},
  "Waiting for Delivery":{bg:"#FFF3CD",fg:"#856404"},
  "Ready for Delivery":{bg:"#f0faf5",fg:"#3B6D11"},
  "Delivered":{bg:"#f0faf5",fg:"#3B6D11"},"Completed":{bg:"#f0f2f5",fg:"#8a9ab0"},
};
const STAGE_C: Record<string,{bg:string;fg:string}> = {
  "RFQ Submitted":{bg:"#EBF3FC",fg:"#185FA5"},"Negotiation":{bg:"#F4F3FE",fg:"#534AB7"},
  "PO Received":{bg:"#FFF8EC",fg:"#854F0B"},"In Fulfillment":{bg:"#FFF3CD",fg:"#856404"},
  "Delivered":{bg:"#f0faf5",fg:"#3B6D11"},"Invoiced":{bg:"#EBF3FC",fg:"#185FA5"},
  "Payment Pending":{bg:"#FFF8EC",fg:"#854F0B"},"Closed":{bg:"#f0f2f5",fg:"#8a9ab0"},
  "Lost":{bg:"#FEF0F0",fg:"#A32D2D"},
};

export default function Dashboard({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const tk = getTodayKey();
  const [os, setOSRaw] = useState<OSData>(DEFAULT_OS);
  const [mfp, setMFPRaw] = useState<MFPDay>(DEFAULT_MFP);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());

  // Pomodoro
  const [pomoModeKey, setPomoModeKey] = useState<PomoModeKey>("standard");
  const [deepWorkMins, setDeepWorkMins] = useState(90);
  const [pomoActive, setPomoActive] = useState(false);
  const [pomoSecs, setPomoSecs] = useState(PW);
  const [pomoMode, setPomoMode] = useState<"work"|"break">("work");
  const [pomoSessions, setPomoSessions] = useState(0);
  const [pomoMIT, setPomoMIT] = useState<number|null>(null);
  const pomoRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const osTbsRef = useRef<TimeBlock[]>([]);
  const pomoActiveRef = useRef(false);
  const touchMITRef = useRef<{mitId:number;mitText:string}|null>(null);

  // MIT drag
  const [dragIdx, setDragIdx] = useState<number|null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number|null>(null);

  const [newMIT, setNewMIT] = useState("");
  const [editOKR, setEditOKR] = useState<number|null>(null);
  const [editKPI, setEditKPI] = useState<number|null>(null);
  const [editTB, setEditTB] = useState<number|null>(null);
  const [editBrewing, setEditBrewing] = useState<number|null>(null);
  const [editCH, setEditCH] = useState<number|null>(null);
  const [insight, setInsight] = useState("");
  const [iLoad, setILoad] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [archiveView, setArchiveView] = useState<"streak"|"feed">("streak");
  const [mitArchive, setMitArchive] = useState<MITArchiveEntry[]>([]);

  // Operations panel
  const [opsTab, setOpsTab] = useState<"projects"|"rfqs"|"pos">("projects");
  const [crmData, setCrmData] = useState<CRMData>({});

  // Brewing / Crosshairs forms
  const [newBrew, setNewBrew] = useState({what:"",who:"",since:"",category:"Client" as BrewingItem["category"]});
  const [showBrewForm, setShowBrewForm] = useState(false);
  const [newCH, setNewCH] = useState({company:"",sector:"",estDeal:"",priority:"Medium" as CrosshairsTarget["priority"],lastAction:"",nextMove:""});
  const [showCHForm, setShowCHForm] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<number|null>(null);
  const [tbDragOverId, setTbDragOverId] = useState<number|null>(null);

  useEffect(() => {
    (async () => {
      const [osData, mfpData, pomoData, archiveData, crmRaw, projectsRaw] = await Promise.all([
        kvGet<OSData>("dashboard"),
        kvGet<MFPDay>(`mfp:${getTodayKey()}`),
        kvGet<{sessions:number}>("pomo:sessions"),
        kvGet<MITArchiveEntry[]>("mit:archive"),
        kvGet<CRMData>("crm"),
        fetch("/api/projects").then(r=>r.json()).catch(()=>({projects:[]})),
      ]);
      if (osData !== null) {
        const mits = (osData.mits || DEFAULT_OS.mits).map((m: MIT) => ({
          ...m, doneAt: m.doneAt ?? (m.done ? Date.now() : undefined),
        }));
        setOSRaw({...DEFAULT_OS,...osData, mits, brewing:osData.brewing||[], crosshairs:osData.crosshairs||[]});
      }
      if (mfpData) setMFPRaw(mfpData);
      if (pomoData) setPomoSessions(pomoData.sessions||0);
      if (archiveData) setMitArchive(archiveData);
      if (crmRaw) setCrmData({...crmRaw, projects: projectsRaw?.projects||[]});
      setLoaded(true);
    })();
  }, [tk]);

  const setOS = useCallback((patch: Partial<OSData>) => {
    setOSRaw(prev => { const next = {...prev,...patch}; kvSet("dashboard",next); return next; });
  }, []);

  const toggleCollapse = (key:string) => setCollapsed(c => ({...c,[key]:!c[key]}));
  const isCollapsed = (key:string) => !!collapsed[key];

  // Current pomo mode config
  const pomoModeConfig = POMO_MODES.find(m=>m.key===pomoModeKey) || POMO_MODES[0];
  const pomoWorkSecs = pomoModeKey==="deepwork" ? deepWorkMins*60 : pomoModeConfig.workMins*60;
  const pomoBreakSecs = pomoModeConfig.breakMins*60;
  const pomoTotal = pomoMode==="work" ? pomoWorkSecs : pomoBreakSecs;
  const pomoCirc = 2*Math.PI*34;
  const pomoDash = pomoCirc - ((pomoTotal-pomoSecs)/pomoTotal)*pomoCirc;

  useEffect(() => { const id = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); }, []);

  useEffect(() => {
    if (pomoActive) {
      pomoRef.current = setInterval(() => {
        setPomoSecs(s => {
          if (s <= 1) {
            clearInterval(pomoRef.current!); setPomoActive(false); playChime("end");
            if (pomoMode==="work") {
              setPomoSessions(n => { const next=n+1; kvSet("pomo:sessions",{sessions:next}); return next; });
              if (pomoModeKey!=="deepwork" && pomoBreakSecs>0) { setPomoMode("break"); setPomoSecs(pomoBreakSecs); }
              else { setPomoMode("work"); setPomoSecs(pomoWorkSecs); }
            } else { setPomoMode("work"); setPomoSecs(pomoWorkSecs); }
            return 0;
          }
          return s-1;
        });
      }, 1000);
    } else clearInterval(pomoRef.current!);
    return () => clearInterval(pomoRef.current!);
  }, [pomoActive, pomoMode, pomoModeKey, deepWorkMins]);

  const switchPomoMode = (key: PomoModeKey) => {
    setPomoModeKey(key); setPomoActive(false); setPomoMode("work");
    const cfg = POMO_MODES.find(m=>m.key===key)!;
    setPomoSecs(key==="deepwork" ? deepWorkMins*60 : cfg.workMins*60);
  };

  const mitsDone = os.mits.filter(m=>m.done).length;
  const mitsTotal = os.mits.length;
  const pts = mitsDone*2+(mfp.mood?1:0)+(mfp.mitDone?1:0)+(mfp.winDone?1:0)+(mfp.reflDone?1:0)+pomoSessions;
  const mom = [...MOMENTUM].reverse().find(s=>pts>=s.min)||MOMENTUM[0];
  const activeMIT = os.mits.find(m=>!m.done)||os.mits[0];
  const nowHH = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const curBlock = os.tbs.reduce((c,tb)=>tb.time<=nowHH?tb:c, null as TimeBlock|null);
  const dayStr = now.toLocaleDateString("en-PH",{weekday:"short",year:"numeric",month:"short",day:"numeric"}).toUpperCase();
  const timeStr = now.toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"});
  osTbsRef.current = os.tbs;
  pomoActiveRef.current = pomoActive;

  // ClickUp MIT sync state
  const [cuEnabled, setCuEnabled] = useState(false);
  const [cuPicker, setCuPicker] = useState(false);
  const [cuTasks, setCuTasks] = useState<{id:string;name:string;dueDate?:string|null;listName?:string}[]>([]);
  const [cuLoading, setCuLoading] = useState(false);

  // Check if ClickUp token is available on mount
  useEffect(() => {
    fetch("/api/clickup-mit", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"fetch"}) })
      .then(r => r.json())
      .then(d => { if (!d.error) setCuEnabled(true); })
      .catch(() => {});
  }, []);

  // Poll ClickUp every 2 minutes to sync completion status
  useEffect(() => {
    if (!cuEnabled) return;
    const poll = async () => {
      const linked = os.mits.filter(m => m.clickupId && !m.done);
      if (!linked.length) return;
      const ids = linked.map(m => m.clickupId).join(",");
      try {
        const res = await fetch(`/api/clickup-mit?ids=${ids}`);
        const data = await res.json();
        const statuses = data.statuses || {};
        const nowDone = linked.filter(m => statuses[m.clickupId!]);
        if (nowDone.length > 0) {
          setOS({ mits: os.mits.map(m => nowDone.find(d => d.id === m.id) ? {...m, done:true, doneAt:Date.now()} : m) });
        }
      } catch {}
    };
    const id = setInterval(poll, 120000);
    return () => clearInterval(id);
  }, [cuEnabled, os.mits]);

  const addMIT = async () => {
    if (!newMIT.trim()) return;
    const id = os.nid || 100;
    const mit: MIT = {id, text:newMIT.trim(), done:false};
    // Create in ClickUp if enabled
    if (cuEnabled) {
      try {
        const res = await fetch("/api/clickup-mit", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"create", name:newMIT.trim()}) });
        const data = await res.json();
        if (data.taskId) mit.clickupId = data.taskId;
      } catch {}
    }
    setOS({mits:[...os.mits, mit], nid:id+1});
    setNewMIT("");
  };

  const openCuPicker = async () => {
    setCuPicker(true); setCuLoading(true);
    try {
      const res = await fetch("/api/clickup-mit", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"fetchAll"}) });
      const data = await res.json();
      // Filter out tasks already in MITs
      const existingIds = new Set(os.mits.map(m => m.clickupId).filter(Boolean));
      setCuTasks((data.tasks||[]).filter((t:{id:string}) => !existingIds.has(t.id)));
    } catch { setCuTasks([]); }
    setCuLoading(false);
  };

  const addFromClickUp = (task: {id:string;name:string;dueDate?:string|null}) => {
    const id = os.nid || 100;
    setOS({mits:[...os.mits, {id, text:task.name, done:false, clickupId:task.id, dueDate:task.dueDate||undefined}], nid:id+1});
    setCuPicker(false);
  };

  const toggleMITDone = async (m: MIT) => {
    const nowDone = !m.done;
    setOS({mits: os.mits.map(x => x.id===m.id ? {...x, done:nowDone, doneAt:nowDone?Date.now():undefined} : x)});
    if (m.clickupId && cuEnabled) {
      try {
        await fetch("/api/clickup-mit", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({action: nowDone?"complete":"reopen", taskId:m.clickupId}) });
      } catch {}
    }
  };

  // MIT drag handlers
  const onDragStart = (e: React.DragEvent, idx: number, mit: MIT) => {
    setDragIdx(idx);
    e.dataTransfer.setData("mitId", String(mit.id));
    e.dataTransfer.setData("mitText", mit.text);
  };
  const onDragOver = (e:React.DragEvent, idx:number) => { e.preventDefault(); setDragOverIdx(idx); };
  const onDrop = (idx:number) => {
    if (dragIdx===null||dragIdx===idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...os.mits];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setOS({mits:reordered});
    setDragIdx(null); setDragOverIdx(null);
  };

  // Time block MIT drop handlers
  const onTBDragOver = (e: React.DragEvent, tbId: number) => { e.preventDefault(); setTbDragOverId(tbId); };
  const onTBDrop = (e: React.DragEvent, tbId: number) => {
    e.preventDefault();
    const mitId = Number(e.dataTransfer.getData("mitId"));
    if (!mitId) { setTbDragOverId(null); return; }
    setOS({ tbs: os.tbs.map(x => x.id === tbId ? {...x, mitId} : x) });
    setTbDragOverId(null);
    setActiveBlockId(tbId);
    if (pomoActive) setPomoMIT(mitId);
  };

  // Touch drag for MIT to Time Block
  useEffect(() => {
    let ghost: HTMLDivElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (!touchMITRef.current) return;
      if (!ghost) {
        ghost = document.createElement("div");
        ghost.style.cssText = "position:fixed;z-index:1000;pointer-events:none;background:#EBF3FC;border:1.5px solid #185FA5;border-radius:8px;padding:6px 10px;font-size:12px;color:#185FA5;font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Plus Jakarta Sans,sans-serif;";
        document.body.appendChild(ghost);
      }
      const t = touchMITRef.current.mitText;
      ghost.textContent = t.length > 30 ? t.slice(0,30)+"..." : t;
      ghost.style.left = (e.clientX + 12) + "px";
      ghost.style.top = (e.clientY - 20) + "px";
    };
    const onUp = (e: PointerEvent) => {
      if (ghost) { document.body.removeChild(ghost); ghost = null; }
      if (!touchMITRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tbEl = el?.closest("[data-tbid]") as HTMLElement | null;
      if (tbEl) {
        const tbId = Number(tbEl.dataset.tbid);
        const mitId = touchMITRef.current.mitId;
        setOS({ tbs: osTbsRef.current.map(x => x.id === tbId ? {...x, mitId} : x) });
        setActiveBlockId(tbId);
        if (pomoActiveRef.current) setPomoMIT(mitId);
      }
      touchMITRef.current = null;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
  }, []);

  const callAPI = async (system:string,user:string) => { const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system,user,max_tokens:400})}); const d=await res.json(); return d?.text||null; };
  const getInsight = async () => { setILoad(true); setInsight(""); const ctx=`MITs: ${os.mits.map(m=>`${m.done?"[done]":"[open]"} ${m.text}`).join("; ")}. OKRs: ${os.okrs.map(o=>`${o.objective}: ${o.current}/${o.target} ${o.unit}`).join(", ")}. Vitals: ${os.kpis.map(k=>`${k.label} ${k.value}`).join(", ")}.`; try { const txt=await callAPI(`Executive AI advisor for Khalil Banares, Ultra Power Industrial Resources, Makati PH. 2-3 sharp actionable insights. Direct. Under 100 words.`,ctx); setInsight(txt||"Could not generate insight."); } catch { setInsight("Connection error."); } setILoad(false); };

  const archiveMIT = async (mit: MIT) => {
    const ph = new Date(new Date().toLocaleString("en-US", {timeZone:"Asia/Manila"}));
    const dayKey = `${ph.getFullYear()}-${String(ph.getMonth()+1).padStart(2,"0")}-${String(ph.getDate()).padStart(2,"0")}`;
    const newEntry: MITArchiveEntry = {text:mit.text, doneAt:mit.doneAt||Date.now(), dayKey};
    const updatedArchive = [newEntry,...mitArchive].slice(0,900);
    setMitArchive(updatedArchive);
    await kvSet("mit:archive", updatedArchive);
    setOS({mits:os.mits.filter(m=>m.id!==mit.id)});
  };

  const addBrew = () => { if(!newBrew.what.trim())return; const id=os.nid||100; setOS({brewing:[...(os.brewing||[]),{...newBrew,id}],nid:id+1}); setNewBrew({what:"",who:"",since:"",category:"Client"}); setShowBrewForm(false); };
  const addCH = () => { if(!newCH.company.trim())return; const id=os.nid||100; setOS({crosshairs:[...(os.crosshairs||[]),{...newCH,id}],nid:id+1}); setNewCH({company:"",sector:"",estDeal:"",priority:"Medium",lastAction:"",nextMove:""}); setShowCHForm(false); };

  const P:React.CSSProperties = {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"16px 18px"};
  const PL:React.CSSProperties = {fontSize:11,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"#b0bec8",marginBottom:10,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",justifyContent:"space-between"};
  const INP:React.CSSProperties = {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332"};
  const ABTN:React.CSSProperties = {fontSize:13,padding:"8px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"};
  const SBTN:React.CSSProperties = {fontSize:11,padding:"3px 9px",borderRadius:20,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontWeight:500};

  if (!loaded) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:14,fontFamily:"'DM Mono',monospace"}}>Loading dashboard...</div>;

  const brewing = os.brewing||[];
  const crosshairs = os.crosshairs||[];
  const rfqs = crmData.pendingRFQs||[];
  const pos = crmData.pendingPOs||[];

  return (
    <div style={{flex:1,overflow:"auto"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .del-btn{font-size:12px;color:#d0d8e0;cursor:pointer;padding:0 3px}
        .del-btn:hover{color:#A32D2D}
        .okr-item{padding:7px 0;border-bottom:0.5px solid #f0f2f5;cursor:pointer}
        .okr-item:last-child{border-bottom:none}
        .kpi-c{background:#f8f9fb;border:0.5px solid #eaecef;border-radius:10px;padding:10px 12px;cursor:pointer}
        .tb-r{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:0.5px solid #f0f2f5}
        .tb-r:last-child{border-bottom:none}
        .ai-b{width:100%;padding:12px;border-radius:10px;border:0.5px solid #e2e6ea;background:#f8f9fb;color:#1a2332;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
        .ai-b:hover:not(:disabled){background:#EBF3FC;border-color:#c5ddf5;color:#185FA5}
        .ai-b:disabled{opacity:0.6;cursor:not-allowed}
        .brew-row:hover{background:#fafbfc}
        .ch-row:hover{background:#fafbfc}
        .mit-drag{cursor:grab;color:#d0d8e0;padding:0 4px;font-size:12px}
        .mit-drag:active{cursor:grabbing}
        .mit-dragging{opacity:0.4}
        .mit-dragover{border-top:2px solid #185FA5}
      `}</style>

      {/* Topbar */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5}}>
        <div>
          <div style={{fontSize:16,fontWeight:600,color:"#1a2332"}}>Executive Dashboard</div>
          <div style={{fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",marginTop:1}}>Khalil Joseph Banares · Ultra Power Industrial Resources</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:11,height:11,borderRadius:"50%",background:mom.color,flexShrink:0,boxShadow:`0 0 7px ${mom.color}99`}}/>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:mom.color}}>{mom.label}</div>
              <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em",textTransform:"uppercase"}}>Daily Momentum</div>
            </div>
          </div>
          {/* Mental Fitness Pulse Dot */}
          {(() => {
            const mfpDone = !!(mfp.mood && mfp.mitDone && mfp.winDone && mfp.reflDone);
            const mfpPartial = !!(mfp.mood || mfp.mitDone || mfp.winDone || mfp.reflDone);
            const dotColor = mfpDone ? "#3B6D11" : mfpPartial ? "#854F0B" : "#d0d8e0";
            const dotLabel = mfpDone ? "Mental check done" : mfpPartial ? "Mental check partial" : "Mental check pending";
            return (
              <div title={dotLabel} onClick={()=>onNavigate?.("mental")}
                style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"4px 8px",borderRadius:20,background:mfpDone?"#f0faf5":mfpPartial?"#FFF8EC":"#f0f2f5",border:`0.5px solid ${dotColor}44`}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:dotColor,flexShrink:0,boxShadow:mfpDone?`0 0 5px ${dotColor}88`:"none"}}/>
                <div style={{fontSize:10,color:dotColor,fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                  {mfpDone?"✓ MFP":mfpPartial?"MFP":"MFP"}
                </div>
              </div>
            );
          })()}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace"}}>{timeStr}</div>
            <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{dayStr}</div>
          </div>
        </div>
      </div>

      <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12}}>

        {/* ── ROW 1: MITs, Pomodoro+TimeBlocks, Operations, OKR ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>

        {/* MITs */}
        <div style={P}>
          <div style={PL}><span>MITs</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:mitsDone===mitsTotal?"#3B6D11":"#854F0B",fontSize:11}}>{mitsDone}/{mitsTotal}</span>
              {cuEnabled&&<button onClick={openCuPicker} style={{...SBTN,color:"#534AB7",borderColor:"#AFA9EC",background:"#F4F3FE",fontSize:10}}>↓ ClickUp</button>}
              <button style={{...SBTN,color:"#534AB7",borderColor:"#534AB744",background:"#F4F3FE"}} onClick={()=>setShowArchive(a=>!a)}>Wins</button>
              <button style={SBTN} onClick={()=>toggleCollapse("mits")}>{isCollapsed("mits")?"▼":"▲"}</button>
            </div>
          </div>
          {!isCollapsed("mits")&&<>
            {os.mits.map((m,i)=>(
              <div key={m.id}
                draggable onDragStart={e=>onDragStart(e,i,m)} onDragOver={e=>onDragOver(e,i)} onDrop={()=>onDrop(i)} onDragEnd={()=>{setDragIdx(null);setDragOverIdx(null);}}
                onPointerDown={e=>{if(e.pointerType!=="mouse")touchMITRef.current={mitId:m.id,mitText:m.text};}}
                className={`${dragIdx===i?"mit-dragging":""} ${dragOverIdx===i&&dragIdx!==i?"mit-dragover":""}`}
                style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 0",borderBottom:i===os.mits.length-1?"none":"0.5px solid #f0f2f5"}}>
                <span className="mit-drag">⠿</span>
                <div onClick={()=>toggleMITDone(m)}
                  style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${m.done?"#185FA5":"#d0d8e0"}`,background:m.done?"#185FA5":"#fff",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:10,color:"#fff"}}>
                  {m.done?"✓":""}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:m.done?"#b0bec8":m.id===activeMIT?.id?"#185FA5":"#3a4a5a",lineHeight:1.4,textDecoration:m.done?"line-through":"none"}}>{m.text}</div>
                  {(m.dueDate||m.clickupId)&&(
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                      {m.clickupId&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"#F4F3FE",color:"#534AB7",fontFamily:"'DM Mono',monospace",fontWeight:600}}>CU</span>}
                      {m.dueDate&&<span style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{m.dueDate}</span>}
                    </div>
                  )}
                </div>
                {m.done&&<button onClick={()=>archiveMIT(m)} style={{fontSize:10,padding:"1px 6px",borderRadius:6,border:"0.5px solid #AFA9EC",background:"#F4F3FE",color:"#534AB7",cursor:"pointer",flexShrink:0}}>Archive</button>}
                <div className="del-btn" onClick={()=>setOS({mits:os.mits.filter(x=>x.id!==m.id)})}>✕</div>
              </div>
            ))}
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <input style={{...INP,flex:1,fontSize:13}} placeholder="Add task..." value={newMIT} onChange={e=>setNewMIT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMIT()}/>
              <button style={{...ABTN,fontSize:12,padding:"6px 10px"}} onClick={addMIT}>+</button>
            </div>
          </>}
        </div>

        {/* ClickUp Task Picker */}
        {cuPicker&&(
          <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.3)"}} onClick={()=>setCuPicker(false)}/>
            <div style={{position:"relative",background:"#fff",borderRadius:14,width:440,maxHeight:"70vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
              <div style={{padding:"14px 18px",borderBottom:"0.5px solid #e2e6ea",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>Pull from ClickUp</div>
                <button onClick={()=>setCuPicker(false)} style={{fontSize:16,color:"#b0bec8",background:"none",border:"none",cursor:"pointer"}}>✕</button>
              </div>
              <div style={{flex:1,overflow:"auto",padding:12}}>
                {cuLoading&&<div style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:13}}>Loading tasks...</div>}
                {!cuLoading&&cuTasks.length===0&&<div style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:13}}>No open tasks found.</div>}
                {!cuLoading&&cuTasks.map(t=>(
                  <div key={t.id} onClick={()=>addFromClickUp(t)}
                    style={{padding:"9px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",marginBottom:6,cursor:"pointer",background:"#fafbfc",display:"flex",alignItems:"center",justifyContent:"space-between"}}
                    onMouseEnter={e=>(e.currentTarget.style.background="#EBF3FC")}
                    onMouseLeave={e=>(e.currentTarget.style.background="#fafbfc")}>
                    <div>
                      <div style={{fontSize:13,color:"#1a2332",fontWeight:500}}>{t.name}</div>
                      {t.listName&&<div style={{fontSize:10,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",marginTop:1}}>{t.listName}</div>}
                    </div>
                    {t.dueDate&&<span style={{fontSize:10,color:"#854F0B",fontFamily:"'DM Mono',monospace",flexShrink:0,marginLeft:8}}>{t.dueDate}</span>}
                  </div>
                ))}
              </div>
              <div style={{padding:"10px 14px",borderTop:"0.5px solid #f0f2f5",fontSize:11,color:"#b0bec8",textAlign:"center"}}>Click any task to add it as an MIT</div>
            </div>
          </div>
        )}

        {/* Pomodoro */}
        <div style={{...P,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{...PL,width:"100%"}}><span>Pomodoro</span><span style={{color:"#8a9ab0",fontSize:11}}>{pomoSessions} sessions</span></div>

          {/* Mode selector */}
          <div style={{display:"flex",gap:4,marginBottom:10,width:"100%"}}>
            {POMO_MODES.map(m=>(
              <button key={m.key} onClick={()=>switchPomoMode(m.key)}
                style={{flex:1,fontSize:10,padding:"4px 0",borderRadius:7,border:`0.5px solid ${pomoModeKey===m.key?"#185FA5":"#e2e6ea"}`,background:pomoModeKey===m.key?"#EBF3FC":"#f8f9fb",color:pomoModeKey===m.key?"#185FA5":"#8a9ab0",cursor:"pointer",fontWeight:pomoModeKey===m.key?600:400}}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Deep work slider */}
          {pomoModeKey==="deepwork"&&(
            <div style={{width:"100%",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",marginBottom:4}}>
                <span>Duration</span><span style={{color:"#185FA5",fontWeight:600}}>{deepWorkMins} min</span>
              </div>
              <input type="range" min={60} max={180} step={15} value={deepWorkMins}
                onChange={e=>{const v=Number(e.target.value);setDeepWorkMins(v);if(!pomoActive){setPomoSecs(v*60);}}}
                style={{width:"100%",accentColor:"#185FA5"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#b0bec8"}}>
                <span>1h</span><span>1.5h</span><span>2h</span><span>2.5h</span><span>3h</span>
              </div>
            </div>
          )}

          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:6,alignSelf:"flex-start",textTransform:"uppercase",letterSpacing:"0.08em"}}>Linked MIT</div>
          <select style={{width:"100%",fontSize:12,padding:"6px 8px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginBottom:12}}
            value={pomoMIT||""} onChange={e=>setPomoMIT(e.target.value?Number(e.target.value):null)}>
            <option value="">— Select MIT —</option>
            {os.mits.filter(m=>!m.done).map(m=><option key={m.id} value={m.id}>{m.text.slice(0,36)}{m.text.length>36?"…":""}</option>)}
          </select>

          <div style={{position:"relative",width:110,height:110,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>
            <svg width="110" height="110" viewBox="0 0 80 80" style={{position:"absolute",top:0,left:0}}>
              <circle cx="40" cy="40" r="34" fill="none" stroke="#f0f2f5" strokeWidth="5"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke={pomoMode==="work"?"#185FA5":"#3B6D11"} strokeWidth="5"
                strokeDasharray={pomoCirc} strokeDashoffset={pomoDash} strokeLinecap="round" transform="rotate(-90 40 40)"/>
            </svg>
            <div style={{position:"relative",textAlign:"center",zIndex:1}}>
              <div style={{fontSize:24,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace",lineHeight:1}}>{pad(Math.floor(pomoSecs/60))}:{pad(pomoSecs%60)}</div>
              <div style={{fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",marginTop:2}}>{pomoMode==="work"?pomoModeKey==="deepwork"?"Deep Work":"Focus":"Break"}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button style={{...ABTN,fontSize:12,padding:"6px 12px",background:pomoActive?"#FEF0F0":"#EBF3FC",color:pomoActive?"#A32D2D":"#185FA5",borderColor:pomoActive?"#f5c6c6":"#185FA5"}}
              onClick={()=>{if(!pomoActive)playChime("start");setPomoActive(a=>!a);}}>
              {pomoActive?"⏸":"▶"}
            </button>
            <button style={{...ABTN,fontSize:12,padding:"6px 12px",background:"#f8f9fb",color:"#6a8aaa",borderColor:"#e2e6ea"}}
              onClick={()=>{setPomoActive(false);setPomoMode("work");setPomoSecs(pomoModeKey==="deepwork"?deepWorkMins*60:pomoModeConfig.workMins*60);}}>↺</button>
          </div>

          {/* Time Blocks section */}
          <div style={{width:"100%",marginTop:12,borderTop:"0.5px solid #e2e6ea",paddingTop:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <div style={{flex:1,fontSize:10,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Time Blocks</div>
              {curBlock&&<span style={{fontSize:9,background:"#EBF3FC",color:"#185FA5",padding:"2px 7px",borderRadius:20,fontFamily:"'DM Mono',monospace",flexShrink:0}}>NOW: {curBlock.label}</span>}
              <button style={{...SBTN,fontSize:10,flexShrink:0}} onClick={()=>{const id=os.nid||100;setOS({tbs:[...os.tbs,{id,time:"09:00",label:"New Block",sub:"",type:"Deep Work"}],nid:id+1});}}>+</button>
            </div>
            <div style={{maxHeight:240,overflowY:"auto"}}>
              {os.tbs.map(tb=>(
                <div key={tb.id}
                  data-tbid={tb.id}
                  onDragOver={e=>onTBDragOver(e,tb.id)}
                  onDrop={e=>onTBDrop(e,tb.id)}
                  onDragLeave={()=>setTbDragOverId(null)}
                  onClick={()=>{setActiveBlockId(tb.id);setPomoMIT(tb.mitId||null);}}
                  style={{display:"flex",alignItems:"flex-start",gap:7,padding:"5px 8px",borderRadius:7,marginBottom:3,cursor:"pointer",background:activeBlockId===tb.id?"#EBF3FC":tbDragOverId===tb.id?"#f0f7ff":"#f8f9fb",border:`0.5px solid ${activeBlockId===tb.id?"#185FA5":tbDragOverId===tb.id?"#c5ddf5":"#e2e6ea"}`,transition:"background 0.12s"}}>
                  {editTB===tb.id?(
                    <div style={{display:"flex",gap:4,flex:1,flexWrap:"wrap"}}>
                      <input style={{...INP,width:52,border:"1px solid #185FA5",fontSize:11}} defaultValue={tb.time} onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,time:e.target.value}:x)})} placeholder="08:00"/>
                      <input style={{...INP,flex:1,border:"1px solid #185FA5",fontSize:11}} defaultValue={tb.label} onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,label:e.target.value}:x)})} placeholder="Label"/>
                      <input style={{...INP,flex:2,border:"1px solid #185FA5",fontSize:11}} defaultValue={tb.sub} onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,sub:e.target.value}:x)})} placeholder="Description"/>
                      <button onClick={e=>{e.stopPropagation();setEditTB(null);}} style={{fontSize:10,padding:"3px 7px",borderRadius:6,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer"}}>Done</button>
                      <button onClick={e=>{e.stopPropagation();setOS({tbs:os.tbs.filter(x=>x.id!==tb.id)});setEditTB(null);}} style={{fontSize:10,padding:"3px 5px",borderRadius:6,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>✕</button>
                    </div>
                  ):(
                    <>
                      <div style={{width:3,minHeight:22,borderRadius:2,flexShrink:0,background:TB_COLORS[tb.type]||"#b0bec8",alignSelf:"stretch"}}/>
                      <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",width:30,flexShrink:0,paddingTop:2}}>{tb.time}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:activeBlockId===tb.id?"#185FA5":"#3a4a5a",fontWeight:500,lineHeight:1.3}}>
                          {tb.label}
                          {curBlock?.id===tb.id&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",marginLeft:4}}>NOW</span>}
                        </div>
                        {tb.sub&&<div style={{fontSize:10,color:"#b0bec8",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tb.sub}</div>}
                        {tb.mitId&&(()=>{
                          const lm=os.mits.find(x=>x.id===tb.mitId);
                          return lm?(<div style={{fontSize:10,color:lm.done?"#3B6D11":"#185FA5",marginTop:2,display:"flex",alignItems:"center",gap:3}}>
                            {lm.done&&<span>✓</span>}
                            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{lm.text.slice(0,26)}{lm.text.length>26?"...":""}</span>
                            <span onClick={e=>{e.stopPropagation();setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,mitId:undefined}:x)});}} style={{cursor:"pointer",color:"#b0bec8",fontSize:11,flexShrink:0}}>×</span>
                          </div>):null;
                        })()}
                      </div>
                      <button onClick={e=>{e.stopPropagation();setEditTB(tb.id);}} style={{fontSize:10,color:"#c0c8d0",background:"none",border:"none",cursor:"pointer",padding:"0 2px",flexShrink:0}}>✎</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Operations Panel */}
        <div style={P}>
          <div style={PL}>
            <span>Operations</span>
            <div style={{display:"flex",gap:4}}>
              {(["projects","rfqs","pos"] as const).map(t=>(
                <button key={t} onClick={()=>setOpsTab(t)} style={{fontSize:10,padding:"3px 8px",borderRadius:20,border:`0.5px solid ${opsTab===t?"#185FA5":"#e2e6ea"}`,background:opsTab===t?"#EBF3FC":"#f8f9fb",color:opsTab===t?"#185FA5":"#8a9ab0",cursor:"pointer",fontWeight:opsTab===t?600:400}}>
                  {t==="projects"?"Projects":t==="rfqs"?`RFQs${rfqs.length>0?` (${rfqs.length})`:""}`:(`POs${pos.length>0?` (${pos.length})`:""}`)}
                </button>
              ))}
            </div>
          </div>

          {opsTab==="projects"&&(
            <>
              {(crmData as any).projects?.length===0&&<div style={{fontSize:12,color:"#b0bec8",textAlign:"center",padding:"16px 0"}}>No projects yet. Go to Projects tab to create one.</div>}
              {!((crmData as any).projects?.length===0)&&(
                <>
                  {/* Mini stats */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
                    {[
                      ["Open Projects",((crmData as any).projects||[]).filter((p:{stage:string})=>!["Closed","Lost"].includes(p.stage)).length,"#185FA5","#EBF3FC"],
                      ["Overdue Pay",((crmData as any).projects||[]).filter((p:{paymentStatus:string})=>p.paymentStatus==="Overdue").length,"#A32D2D","#FEF0F0"],
                      ["Follow Up",((crmData as any).projects||[]).filter((p:{stage:string;rfqDate:string})=>{const d=Math.floor((Date.now()-new Date(p.rfqDate).getTime())/86400000);return p.stage==="RFQ Submitted"&&d>=15&&d<=30;}).length,"#854F0B","#FFF8EC"],
                    ].map(([lbl,val,fg,bg])=>(
                      <div key={lbl as string} style={{background:bg as string,borderRadius:7,padding:"6px 10px",textAlign:"center"}}>
                        <div style={{fontSize:15,fontWeight:600,color:fg as string,fontFamily:"'DM Mono',monospace"}}>{val as number}</div>
                        <div style={{fontSize:9,color:fg as string,opacity:0.7,textTransform:"uppercase",letterSpacing:"0.06em"}}>{lbl as string}</div>
                      </div>
                    ))}
                  </div>
                  {((crmData as any).projects||[]).filter((p:{stage:string})=>!["Closed","Lost"].includes(p.stage)).slice(0,4).map((p:{id:string;name:string;client:string;stage:string;paymentStatus?:string;grossProfit?:number},i:number)=>{
                    const sc = STAGE_C[p.stage]||{bg:"#f0f2f5",fg:"#8a9ab0"};
                    return(
                      <div key={p.id} style={{padding:"6px 0",borderBottom:i===3?"none":"0.5px solid #f0f2f5"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                          <span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:sc.bg,color:sc.fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{p.stage}</span>
                          {p.paymentStatus==="Overdue"&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#FEF0F0",color:"#A32D2D",fontFamily:"'DM Mono',monospace",fontWeight:600}}>Overdue</span>}
                        </div>
                        <div style={{fontSize:12,fontWeight:500,color:"#1a2332",lineHeight:1.3}}>{p.name}</div>
                        <div style={{fontSize:10,color:"#8a9ab0"}}>{p.client}{p.grossProfit!==undefined?` · ₱${p.grossProfit.toLocaleString()}`:""}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {opsTab==="rfqs"&&(
            rfqs.length===0
              ? <div style={{fontSize:12,color:"#b0bec8",textAlign:"center",padding:"16px 0"}}>No pending RFQs.</div>
              : rfqs.slice(0,5).map((r,i)=>{
                  const isOverdue = r.deadline && new Date(r.deadline)<new Date() && r.status==="Submitted";
                  const sc = RFQ_STATUS_C[r.status]||{bg:"#f0f2f5",fg:"#8a9ab0"};
                  return (
                    <div key={r.id} style={{padding:"7px 0",borderBottom:i===Math.min(rfqs.length,5)-1?"none":"0.5px solid #f0f2f5"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{fontSize:11,fontWeight:600,color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{r.rfqNumber||`RFQ-${r.id}`}</span>
                        <span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:sc.bg,color:sc.fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{r.status}</span>
                        {isOverdue&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#FEF0F0",color:"#A32D2D",fontFamily:"'DM Mono',monospace",fontWeight:600}}>Overdue</span>}
                      </div>
                      <div style={{fontSize:12,color:"#3a4a5a",fontWeight:500}}>{r.client}</div>
                      {r.deadline&&<div style={{fontSize:10,color:isOverdue?"#A32D2D":"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:1}}>Due: {r.deadline}</div>}
                    </div>
                  );
                })
          )}

          {opsTab==="pos"&&(
            pos.length===0
              ? <div style={{fontSize:12,color:"#b0bec8",textAlign:"center",padding:"16px 0"}}>No pending POs.</div>
              : pos.slice(0,5).map((p,i)=>{
                  const sc = PO_STATUS_C[p.status]||{bg:"#f0f2f5",fg:"#8a9ab0"};
                  const isLate = p.expectedDelivery && new Date(p.expectedDelivery)<new Date() && p.status!=="Delivered"&&p.status!=="Completed";
                  return (
                    <div key={p.id} style={{padding:"7px 0",borderBottom:i===Math.min(pos.length,5)-1?"none":"0.5px solid #f0f2f5"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <span style={{fontSize:11,fontWeight:600,color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{p.poNumber||`PO-${p.id}`}</span>
                        <span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:sc.bg,color:sc.fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{p.status}</span>
                        {isLate&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#FEF0F0",color:"#A32D2D",fontFamily:"'DM Mono',monospace",fontWeight:600}}>Late</span>}
                      </div>
                      <div style={{fontSize:12,color:"#3a4a5a",fontWeight:500}}>{p.client}</div>
                      {p.value&&<div style={{fontSize:11,color:"#3B6D11",fontFamily:"'DM Mono',monospace",marginTop:1}}>{p.value}</div>}
                    </div>
                  );
                })
          )}
          <div style={{marginTop:8,textAlign:"right"}}>
            <button onClick={()=>onNavigate?.(opsTab==="projects"?"projects":"crm")} style={{fontSize:10,color:"#185FA5",background:"none",border:"none",cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
              → Go to {opsTab==="projects"?"Projects":"CRM"}
            </button>
          </div>
        </div>

        {/* OKR Tracker */}
        <div style={P}>
          <div style={PL}>
            <span>OKR Tracker</span>
            <button onClick={()=>{const id=os.nid||100;setOS({okrs:[...os.okrs,{id,objective:"New Objective",keyResult:"Key result",current:0,target:10,unit:""}],nid:id+1});setEditOKR(id);}} style={SBTN}>+ Add</button>
          </div>
          {os.okrs.map(o=>{
            const pct = o.target>0 ? Math.min(100, Math.round((o.current/o.target)*100)) : 0;
            return (
              <div key={o.id} className="okr-item" onDoubleClick={()=>setEditOKR(o.id)}>
                {editOKR===o.id ? (
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={o.objective} placeholder="Objective" onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,objective:e.target.value}:x)})} autoFocus/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={o.keyResult} placeholder="Key Result" onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,keyResult:e.target.value}:x)})}/>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                      <div>
                        <div style={{fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:2,textTransform:"uppercase"}}>Current</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} type="number" defaultValue={o.current} onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,current:Number(e.target.value)}:x)})}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:2,textTransform:"uppercase"}}>Target</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} type="number" defaultValue={o.target} onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,target:Number(e.target.value)}:x)})}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:2,textTransform:"uppercase"}}>Unit</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={o.unit} placeholder="clients" onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,unit:e.target.value}:x)})}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>setEditOKR(null)} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
                      <button onClick={()=>{setOS({okrs:os.okrs.filter(x=>x.id!==o.id)});setEditOKR(null);}} style={{padding:"6px 8px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:10,color:"#185FA5",fontWeight:600,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>{o.objective}</div>
                    <div style={{fontSize:12,color:"#1a2332",marginBottom:5,lineHeight:1.3}}>{o.keyResult}</div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <div style={{flex:1,height:4,background:"#f0f2f5",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:2,width:`${pct}%`,background:pctColor(pct),transition:"width 0.4s"}}/>
                      </div>
                      <div style={{fontSize:11,fontWeight:600,fontFamily:"'DM Mono',monospace",color:pctColor(pct),flexShrink:0}}>
                        {o.current}<span style={{color:"#b0bec8",fontWeight:400}}>/{o.target}</span> <span style={{fontSize:10,color:"#b0bec8"}}>{o.unit}</span>
                      </div>
                      <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:pctColor(pct),flexShrink:0}}>{pct}%</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        </div>{/* end Row 1 */}

        {/* ── ROW 2: Vitals, Brewing, Crosshairs ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>

        {/* Vitals */}
        <div style={P}>
          <div style={PL}>
            <span>Vitals</span>
            <button onClick={()=>{const id=os.nid||100;setOS({kpis:[...os.kpis,{id,label:"New Vital",value:"--",delta:"0%",up:null}],nid:id+1});setEditKPI(id);}} style={SBTN}>+ Add</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {os.kpis.map(k=>(
              <div key={k.id} className="kpi-c" onDoubleClick={()=>setEditKPI(k.id)}>
                {editKPI===k.id?(
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={k.label} placeholder="Label" onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,label:e.target.value}:x)})} autoFocus/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={k.value} placeholder="Value" onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,value:e.target.value}:x)})}/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:12}} defaultValue={k.delta} placeholder="Delta" onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,delta:e.target.value}:x)})}/>
                    <div style={{display:"flex",gap:4}}>
                      {([["▲",true,"#3B6D11","#f0faf5"],["→",null,"#8a9ab0","#f8f9fb"],["▼",false,"#A32D2D","#FEF0F0"]] as [string,boolean|null,string,string][]).map(([icon,val,fg,bg])=>(
                        <button key={icon} onClick={()=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,up:val}:x)})}
                          style={{flex:1,padding:"4px 0",borderRadius:6,border:`1.5px solid ${k.up===val?fg:"#e2e6ea"}`,background:k.up===val?bg:"#fff",color:k.up===val?fg:"#b0bec8",cursor:"pointer",fontSize:12,fontWeight:600}}>
                          {icon}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>setEditKPI(null)} style={{flex:1,padding:"5px",borderRadius:6,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
                      <button onClick={()=>{setOS({kpis:os.kpis.filter(x=>x.id!==k.id)});setEditKPI(null);}} style={{padding:"5px 8px",borderRadius:6,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>Delete</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:18,fontWeight:600,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#1a2332",fontFamily:"'DM Mono',monospace"}}>{k.value}</div>
                    <div style={{fontSize:10,color:"#b0bec8",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginTop:2}}>{k.label}</div>
                    <div style={{fontSize:10,fontFamily:"'DM Mono',monospace",marginTop:3,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#8a9ab0"}}>{k.up===true?"▲ ":k.up===false?"▼ ":"→ "}{k.delta}</div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:"#b0bec8",marginTop:6,textAlign:"right"}}>double-tap to edit</div>
        </div>

        {/* Crosshairs */}
        <div style={P}>
          <div style={PL}>
            <span>Crosshairs</span>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"#FEF0F0",color:"#A32D2D",fontFamily:"'DM Mono',monospace"}}>{crosshairs.length}</span>
              <button style={SBTN} onClick={()=>setShowCHForm(s=>!s)}>{showCHForm?"Cancel":"+"}</button>
            </div>
          </div>
          {showCHForm&&(
            <div style={{background:"#f8f9fb",borderRadius:9,padding:"10px",marginBottom:10,border:"0.5px solid #e2e6ea"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                {([["Company","company"],["Sector","sector"],["Est. Deal","estDeal"],["Last Action","lastAction"],["Next Move","nextMove"]] as [string,string][]).map(([lbl,k])=>(
                  <div key={k}>
                    <div style={{fontSize:9,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                    <input style={{...INP,width:"100%",fontSize:12}} value={(newCH as Record<string,string>)[k]} onChange={e=>setNewCH(c=>({...c,[k]:e.target.value}))}/>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:9,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2,fontFamily:"'DM Mono',monospace"}}>Priority</div>
                  <select style={{...INP,width:"100%",fontSize:12}} value={newCH.priority} onChange={e=>setNewCH(c=>({...c,priority:e.target.value as CrosshairsTarget["priority"]}))}>
                    <option>High</option><option>Medium</option><option>Watch</option>
                  </select>
                </div>
              </div>
              <button onClick={addCH} style={{...ABTN,fontSize:12,padding:"6px 10px"}}>Save</button>
            </div>
          )}
          {crosshairs.length===0&&!showCHForm&&<div style={{fontSize:12,color:"#b0bec8",textAlign:"center",padding:"12px 0"}}>No targets yet.</div>}
          {crosshairs.map((t,i)=>(
            <div key={t.id} className="ch-row" style={{padding:"7px 0",borderBottom:i===crosshairs.length-1?"none":"0.5px solid #f0f2f5",cursor:"pointer"}} onDoubleClick={()=>setEditCH(t.id)}>
              {editCH===t.id?(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,alignItems:"end"}}>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={t.company} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,company:e.target.value}:x)})} autoFocus/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={t.sector} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,sector:e.target.value}:x)})}/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={t.estDeal} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,estDeal:e.target.value}:x)})}/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={t.lastAction} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,lastAction:e.target.value}:x)})}/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={t.nextMove} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,nextMove:e.target.value}:x)})}/>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setEditCH(null)} style={{flex:1,padding:"5px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
                    <button onClick={()=>{setOS({crosshairs:crosshairs.filter(x=>x.id!==t.id)});setEditCH(null);}} style={{padding:"5px 8px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.fg||"#b0bec8",flexShrink:0,marginTop:3}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:500,color:"#1a2332"}}>{t.company}</div>
                    <div style={{fontSize:10,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{t.sector}{t.estDeal?` · ${t.estDeal}`:""}</div>
                    <div style={{fontSize:11,color:"#185FA5",marginTop:2}}>{t.nextMove}</div>
                  </div>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:20,background:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.bg,color:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.fg,fontFamily:"'DM Mono',monospace",fontWeight:600,flexShrink:0}}>{t.priority}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Brewing */}
        <div style={P}>
          <div style={PL}>
            <span>Brewing</span>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:"#f0f2f5",color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{brewing.length}</span>
              <button style={SBTN} onClick={()=>setShowBrewForm(s=>!s)}>{showBrewForm?"Cancel":"+"}</button>
            </div>
          </div>
          {showBrewForm&&(
            <div style={{background:"#f8f9fb",borderRadius:9,padding:"10px",marginBottom:10,border:"0.5px solid #e2e6ea"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                {([["What","what","What are you waiting on?"],["Who","who","Who is responsible?"],["Since","since","e.g. Apr 3"]] as [string,string,string][]).map(([lbl,k,ph])=>(
                  <div key={k}>
                    <div style={{fontSize:9,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                    <input style={{...INP,width:"100%",fontSize:12}} placeholder={ph} value={(newBrew as Record<string,string>)[k]} onChange={e=>setNewBrew(b=>({...b,[k]:e.target.value}))}/>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:9,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2,fontFamily:"'DM Mono',monospace"}}>Category</div>
                  <select style={{...INP,width:"100%",fontSize:12}} value={newBrew.category} onChange={e=>setNewBrew(b=>({...b,category:e.target.value as BrewingItem["category"]}))}>
                    {BREWING_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addBrew} style={{...ABTN,fontSize:12,padding:"6px 10px"}}>Save</button>
            </div>
          )}
          {brewing.length===0&&!showBrewForm&&<div style={{fontSize:12,color:"#b0bec8",textAlign:"center",padding:"12px 0"}}>Nothing brewing.</div>}
          {brewing.map((b,i)=>(
            <div key={b.id} className="brew-row" style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 0",borderBottom:i===brewing.length-1?"none":"0.5px solid #f0f2f5",cursor:"pointer"}} onDoubleClick={()=>setEditBrewing(b.id)}>
              {editBrewing===b.id?(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,flex:1,alignItems:"end"}}>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={b.what} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,what:e.target.value}:x)})} autoFocus/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={b.who} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,who:e.target.value}:x)})}/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:12}} defaultValue={b.since} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,since:e.target.value}:x)})}/>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setEditBrewing(null)} style={{flex:1,padding:"5px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
                    <button onClick={()=>{setOS({brewing:brewing.filter(x=>x.id!==b.id)});setEditBrewing(null);}} style={{padding:"5px 8px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{width:8,height:8,borderRadius:"50%",background:BREWING_COLORS[b.category]?.fg||"#b0bec8",flexShrink:0,marginTop:4}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:"#1a2332",fontWeight:500,lineHeight:1.3}}>{b.what}</div>
                    <div style={{fontSize:10,color:"#8a9ab0",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{b.who}{b.since?` · Since ${b.since}`:""}</div>
                  </div>
                  <span style={{fontSize:9,padding:"2px 6px",borderRadius:20,background:BREWING_COLORS[b.category]?.bg,color:BREWING_COLORS[b.category]?.fg,fontFamily:"'DM Mono',monospace",fontWeight:600,flexShrink:0}}>{b.category}</span>
                </>
              )}
            </div>
          ))}
        </div>

        </div>{/* end Row 2 */}

        {/* ── ROW 3: Calendar, AI Insight ── */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>

        {/* Calendar */}
        <div>
          <Calendar timeBlocks={os.tbs}/>
        </div>

        {/* AI Insight */}
        <div style={P}>
          <div style={PL}><span>AI Insight</span><span style={{fontSize:10}}>Claude</span></div>
          <button className="ai-b" onClick={getInsight} disabled={iLoad}>
            {iLoad?<Spinner/>:<span>✦</span>}
            <span>{iLoad?"Analyzing...":insight?"Refresh":"Generate Insight"}</span>
          </button>
          {insight&&<div style={{marginTop:10,padding:"12px 14px",borderRadius:9,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontSize:13,color:"#1a2332",lineHeight:1.75,borderLeft:"3px solid #185FA5"}}>{insight}</div>}
        </div>

        </div>{/* end Row 3 */}

      </div>

      {/* Wins Archive */}
      {showArchive&&(()=>{
        const dayMap: Record<string,string[]> = {};
        mitArchive.forEach(e => { if(!dayMap[e.dayKey])dayMap[e.dayKey]=[];dayMap[e.dayKey].push(e.text); });
        const days = Object.keys(dayMap).sort().reverse();
        let longestStreak=0,streak=0,currentStreak=0;
        const allDays=new Set(Object.keys(dayMap));
        const checkDate=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        for(let i=0;i<90;i++){
          const k=`${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,"0")}-${String(checkDate.getDate()).padStart(2,"0")}`;
          if(allDays.has(k)){streak++;if(i===0||currentStreak>0)currentStreak=streak;}
          else{longestStreak=Math.max(longestStreak,streak);streak=0;if(currentStreak>0&&i>0)currentStreak=0;}
          checkDate.setDate(checkDate.getDate()-1);
        }
        longestStreak=Math.max(longestStreak,streak);
        const grid:{key:string;count:number}[]=[];
        const gStart=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Manila"}));
        for(let i=89;i>=0;i--){const d=new Date(gStart);d.setDate(d.getDate()-i);const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;grid.push({key:k,count:(dayMap[k]||[]).length});}
        const dotColor=(n:number)=>n===0?"#f0f2f5":n===1?"#B5D4F4":n===2?"#378ADD":"#185FA5";
        const today=getTodayKey();
        return(
          <div style={{margin:"0 16px 16px",background:"#FAFAFF",border:"0.5px solid #AFA9EC",borderRadius:13,padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#534AB7",fontFamily:"'DM Mono',monospace"}}>Wins Archive</div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>setArchiveView("streak")} style={{fontSize:11,padding:"3px 9px",borderRadius:20,border:`0.5px solid ${archiveView==="streak"?"#534AB7":"#e2e6ea"}`,background:archiveView==="streak"?"#534AB7":"#fff",color:archiveView==="streak"?"#fff":"#8a9ab0",cursor:"pointer"}}>Streak Wall</button>
                <button onClick={()=>setArchiveView("feed")} style={{fontSize:11,padding:"3px 9px",borderRadius:20,border:`0.5px solid ${archiveView==="feed"?"#534AB7":"#e2e6ea"}`,background:archiveView==="feed"?"#534AB7":"#fff",color:archiveView==="feed"?"#fff":"#8a9ab0",cursor:"pointer"}}>Momentum Feed</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {([["Current Streak",`${currentStreak} day${currentStreak!==1?"s":""}`,`#185FA5`],["Longest Streak",`${longestStreak} day${longestStreak!==1?"s":""}`,`#3B6D11`],["Total Wins",`${mitArchive.length} task${mitArchive.length!==1?"s":""}`,`#534AB7`]] as [string,string,string][]).map(([lbl,val,clr])=>(
                <div key={lbl} style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:9,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:600,color:clr,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
            {archiveView==="streak"&&(<>
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:8}}>
                {grid.map(d=><div key={d.key} title={`${d.key}: ${d.count} MITs`} style={{width:13,height:13,borderRadius:3,background:dotColor(d.count),flexShrink:0,border:d.key===today?"1.5px solid #534AB7":"none"}}/>)}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#b0bec8"}}>
                <span>Less</span>{[0,1,2,3].map(n=><div key={n} style={{width:10,height:10,borderRadius:2,background:dotColor(n)}}/>)}<span>More</span>
                <span style={{marginLeft:"auto"}}>Last 90 days</span>
              </div>
            </>)}
            {archiveView==="feed"&&(
              <div style={{maxHeight:280,overflowY:"auto"}}>
                {days.length===0&&<div style={{textAlign:"center",padding:16,color:"#b0bec8",fontSize:12}}>Archive MITs using the Archive button after completing them.</div>}
                {days.slice(0,30).map(day=>{
                  const tasks=dayMap[day];
                  const isStrong=tasks.length>=3;
                  const dateLabel=new Date(day+"T12:00:00").toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric"});
                  return(
                    <div key={day} style={{marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",textTransform:"uppercase"}}>{dateLabel}</div>
                        <span style={{fontSize:9,padding:"1px 6px",borderRadius:20,background:isStrong?"#f0faf5":"#f0f2f5",color:isStrong?"#3B6D11":"#b0bec8",fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                          {tasks.length} MIT{tasks.length!==1?"s":""}{isStrong?" · Strong Day":""}
                        </span>
                      </div>
                      {tasks.map((t,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:7,padding:"4px 0",borderBottom:i===tasks.length-1?"none":"0.5px solid #f0f2f5"}}>
                          <div style={{width:14,height:14,borderRadius:3,background:"#185FA5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",flexShrink:0,marginTop:1}}>✓</div>
                          <div style={{fontSize:12,color:"#3a4a5a",lineHeight:1.4}}>{t}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
      <div style={{height:16}}/>
    </div>
  );
}
