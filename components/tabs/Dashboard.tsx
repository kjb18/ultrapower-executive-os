"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import {
  MOMENTUM, TB_COLORS, PW, PB,
  pad, getTodayKey, getResetMs, fmtCountdown, pctColor,
  DEFAULT_OS, DEFAULT_MFP, OSData, MFPDay, TimeBlock,
  BREWING_CATEGORIES, BREWING_COLORS, CROSSHAIRS_PRIORITY_COLORS,
  BrewingItem, CrosshairsTarget, MITArchiveEntry,
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
  const [editBrewing, setEditBrewing] = useState<number|null>(null);
  const [editCH, setEditCH] = useState<number|null>(null);
  const [insight, setInsight] = useState("");
  const [iLoad, setILoad] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({});
  const [showArchive, setShowArchive] = useState(false);
  const [archiveView, setArchiveView] = useState<"streak"|"feed">("streak");
  const [mitArchive, setMitArchive] = useState<MITArchiveEntry[]>([]);

  // Brewing form state
  const [newBrew, setNewBrew] = useState({what:"",who:"",since:"",category:"Client" as BrewingItem["category"]});
  const [showBrewForm, setShowBrewForm] = useState(false);

  // Crosshairs form state
  const [newCH, setNewCH] = useState({company:"",sector:"",estDeal:"",priority:"Medium" as CrosshairsTarget["priority"],lastAction:"",nextMove:""});
  const [showCHForm, setShowCHForm] = useState(false);

  useEffect(() => {
    (async () => {
      const [osData, mfpData, pomoData, archiveData] = await Promise.all([
        kvGet<OSData>("dashboard"),
        kvGet<MFPDay>(`mfp:${getTodayKey()}`),
        kvGet<{sessions:number}>("pomo:sessions"),
        kvGet<MITArchiveEntry[]>("mit:archive"),
      ]);
      if (osData !== null) {
        setOSRaw({...DEFAULT_OS,...osData, brewing:osData.brewing||[], crosshairs:osData.crosshairs||[]});
      }
      if (mfpData) setMFPRaw(mfpData);
      if (pomoData) setPomoSessions(pomoData.sessions||0);
      if (archiveData) setMitArchive(archiveData);
      setLoaded(true);
    })();
  }, [tk]);

  // 12-hour auto-archive: check every minute for done tasks older than 12 hours
  useEffect(() => {
    const archiveOldDone = async () => {
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const now = Date.now();
      const toArchive = os.mits.filter(m => m.done && m.doneAt && (now - m.doneAt) >= TWELVE_HOURS);
      if (toArchive.length === 0) return;
      const ph = new Date(new Date().toLocaleString("en-US", {timeZone:"Asia/Manila"}));
      const dayKey = `${ph.getFullYear()}-${String(ph.getMonth()+1).padStart(2,"0")}-${String(ph.getDate()).padStart(2,"0")}`;
      const newEntries: MITArchiveEntry[] = toArchive.map(m => ({text:m.text, doneAt:m.doneAt!, dayKey}));
      const updated = [...newEntries, ...mitArchive].slice(0, 90 * 10); // cap at ~90 days
      setMitArchive(updated);
      await kvSet("mit:archive", updated);
      setOS({mits: os.mits.filter(m => !toArchive.some(a => a.id === m.id))});
    };
    const id = setInterval(archiveOldDone, 60000);
    archiveOldDone();
    return () => clearInterval(id);
  }, [os.mits, mitArchive]);

  const setOS = useCallback((patch: Partial<OSData>) => {
    setOSRaw(prev => { const next = {...prev,...patch}; kvSet("dashboard",next); return next; });
  }, []);

  const toggleCollapse = (key:string) => setCollapsed(c => ({...c,[key]:!c[key]}));
  const isCollapsed = (key:string) => !!collapsed[key];

  useEffect(() => { const id = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); }, []);

  useEffect(() => {
    if (pomoActive) {
      pomoRef.current = setInterval(() => {
        setPomoSecs(s => {
          if (s <= 1) {
            clearInterval(pomoRef.current!); setPomoActive(false); playChime("end");
            if (pomoMode==="work") {
              setPomoSessions(n => { const next=n+1; kvSet("pomo:sessions",{sessions:next}); return next; });
              setPomoMode("break"); setPomoSecs(PB);
            } else { setPomoMode("work"); setPomoSecs(PW); }
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

  const addBrew = () => {
    if (!newBrew.what.trim()) return;
    const id = os.nid||100;
    setOS({brewing:[...( os.brewing||[]),{...newBrew,id}],nid:id+1});
    setNewBrew({what:"",who:"",since:"",category:"Client"});
    setShowBrewForm(false);
  };

  const addCH = () => {
    if (!newCH.company.trim()) return;
    const id = os.nid||100;
    setOS({crosshairs:[...(os.crosshairs||[]),{...newCH,id}],nid:id+1});
    setNewCH({company:"",sector:"",estDeal:"",priority:"Medium",lastAction:"",nextMove:""});
    setShowCHForm(false);
  };

  const P:React.CSSProperties = {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"18px 20px"};
  const PL:React.CSSProperties = {fontSize:11,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"#b0bec8",marginBottom:12,fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",justifyContent:"space-between"};
  const INP:React.CSSProperties = {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332"};
  const ABTN:React.CSSProperties = {fontSize:13,padding:"8px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"};
  const SBTN:React.CSSProperties = {fontSize:11,padding:"3px 9px",borderRadius:20,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontWeight:500};

  if (!loaded) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:14,fontFamily:"'DM Mono',monospace"}}>Loading dashboard...</div>;

  const brewing = os.brewing||[];
  const crosshairs = os.crosshairs||[];

  return (
    <div style={{flex:1,overflow:"auto"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .del-btn{font-size:12px;color:#d0d8e0;cursor:pointer;padding:0 3px} .del-btn:hover{color:#A32D2D} .okr-item{padding:8px 0;border-bottom:0.5px solid #f0f2f5;cursor:pointer} .okr-item:last-child{border-bottom:none} .kpi-c{background:#f8f9fb;border:0.5px solid #eaecef;border-radius:10px;padding:12px 14px;cursor:pointer} .tb-r{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:0.5px solid #f0f2f5} .tb-r:last-child{border-bottom:none} .ai-b{width:100%;padding:12px;border-radius:10px;border:0.5px solid #e2e6ea;background:#f8f9fb;color:#1a2332;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px} .ai-b:hover:not(:disabled){background:#EBF3FC;border-color:#c5ddf5;color:#185FA5} .ai-b:disabled{opacity:0.6;cursor:not-allowed} .brew-row:hover{background:#fafbfc} .ch-row:hover{background:#fafbfc}`}</style>

      {/* Topbar */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5}}>
        <div>
          <div style={{fontSize:17,fontWeight:600,color:"#1a2332"}}>Executive Dashboard</div>
          <div style={{fontSize:12,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",marginTop:2}}>Khalil Joseph Banares · Ultra Power Industrial Resources</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:mom.color,flexShrink:0,boxShadow:`0 0 7px ${mom.color}99`}}/>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:mom.color}}>{mom.label}</div>
              <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em",textTransform:"uppercase"}}>Daily Momentum</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:15,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace"}}>{timeStr}</div>
            <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{dayStr}</div>
          </div>
        </div>
      </div>

      <div style={{padding:"16px 18px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>

        {/* MITs */}
        <div style={P}>
          <div style={PL}><span>Most Important Tasks</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:mitsDone===mitsTotal?"#3B6D11":"#854F0B"}}>{mitsDone}/{mitsTotal}</span>
              <button style={{...SBTN,color:"#534AB7",borderColor:"#534AB744",background:"#F4F3FE"}} onClick={()=>setShowArchive(a=>!a)}>
                {showArchive?"Hide Wins":"Wins Archive"}
              </button>
              <button style={SBTN} onClick={()=>toggleCollapse("mits")}>{isCollapsed("mits")?"Show":"Hide"}</button>
            </div>
          </div>
          {!isCollapsed("mits")&&<>
          {os.mits.map((m,i)=>(
            <div key={m.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:i===os.mits.length-1?"none":"0.5px solid #f0f2f5"}}>
              <div onClick={()=>setOS({mits:os.mits.map(x=>x.id===m.id?{...x,done:!x.done,doneAt:!x.done?Date.now():undefined}:x)})}
                style={{width:17,height:17,borderRadius:4,border:`1.5px solid ${m.done?"#185FA5":"#d0d8e0"}`,background:m.done?"#185FA5":"#fff",flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,color:"#fff"}}>
                {m.done?"✓":""}
              </div>
              <div style={{fontSize:14,color:m.done?"#b0bec8":m.id===activeMIT?.id?"#185FA5":"#3a4a5a",flex:1,lineHeight:1.5,textDecoration:m.done?"line-through":"none",fontWeight:!m.done&&m.id===activeMIT?.id?500:400}}>{m.text}</div>
              <div className="del-btn" onClick={()=>setOS({mits:os.mits.filter(x=>x.id!==m.id)})}>✕</div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <input style={{...INP,flex:1}} placeholder="Add a task..." value={newMIT} onChange={e=>setNewMIT(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addMIT()}/>
            <button style={ABTN} onClick={addMIT}>+ Add</button>
          </div>
          </>}
        </div>

        {/* MIT WINS ARCHIVE */}
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
          const totalArchived=mitArchive.length;
          return(
            <div style={{...P,gridColumn:"span 2",border:"0.5px solid #AFA9EC",background:"#FAFAFF"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#534AB7",fontFamily:"'DM Mono',monospace"}}>Wins Archive</div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setArchiveView("streak")} style={{fontSize:11,padding:"3px 10px",borderRadius:20,border:`0.5px solid ${archiveView==="streak"?"#534AB7":"#e2e6ea"}`,background:archiveView==="streak"?"#534AB7":"#fff",color:archiveView==="streak"?"#fff":"#8a9ab0",cursor:"pointer",fontWeight:500}}>Streak Wall</button>
                  <button onClick={()=>setArchiveView("feed")} style={{fontSize:11,padding:"3px 10px",borderRadius:20,border:`0.5px solid ${archiveView==="feed"?"#534AB7":"#e2e6ea"}`,background:archiveView==="feed"?"#534AB7":"#fff",color:archiveView==="feed"?"#fff":"#8a9ab0",cursor:"pointer",fontWeight:500}}>Momentum Feed</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {([["Current Streak",`${currentStreak} day${currentStreak!==1?"s":""}`,"#185FA5"],["Longest Streak",`${longestStreak} day${longestStreak!==1?"s":""}`,"#3B6D11"],["Total Wins",`${totalArchived} task${totalArchived!==1?"s":""}`,"#534AB7"]] as [string,string,string][]).map(([lbl,val,clr])=>(
                  <div key={lbl} style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:9,padding:"10px 12px",textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:600,color:clr,fontFamily:"'DM Mono',monospace"}}>{val}</div>
                    <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{lbl}</div>
                  </div>
                ))}
              </div>
              {archiveView==="streak"&&(<>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:10}}>
                  {grid.map(d=>(
                    <div key={d.key} title={`${d.key}: ${d.count} MIT${d.count!==1?"s":""} completed`}
                      style={{width:14,height:14,borderRadius:3,background:dotColor(d.count),cursor:d.count>0?"pointer":"default",flexShrink:0,border:d.key===today?"1.5px solid #534AB7":"none"}}/>
                  ))}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#b0bec8"}}>
                  <span>Less</span>{[0,1,2,3].map(n=><div key={n} style={{width:10,height:10,borderRadius:2,background:dotColor(n)}}/>)}<span>More</span>
                  <span style={{marginLeft:"auto"}}>Last 90 days</span>
                </div>
              </>)}
              {archiveView==="feed"&&(
                <div style={{maxHeight:320,overflowY:"auto"}}>
                  {days.length===0&&<div style={{textAlign:"center",padding:20,color:"#b0bec8",fontSize:13}}>No archived tasks yet. Completed tasks archive automatically after 12 hours.</div>}
                  {days.slice(0,30).map(day=>{
                    const tasks=dayMap[day];
                    const isStrong=tasks.length>=3;
                    const dateLabel=new Date(day+"T12:00:00").toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric"});
                    return(
                      <div key={day} style={{marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                          <div style={{fontSize:11,fontWeight:600,color:"#8a9ab0",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>{dateLabel}</div>
                          <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:isStrong?"#f0faf5":"#f0f2f5",color:isStrong?"#3B6D11":"#b0bec8",fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                            {tasks.length} MIT{tasks.length!==1?"s":""}{isStrong?" · Strong Day":""}
                          </span>
                        </div>
                        {tasks.map((t,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"5px 0",borderBottom:i===tasks.length-1?"none":"0.5px solid #f0f2f5"}}>
                            <div style={{width:16,height:16,borderRadius:4,background:"#185FA5",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",flexShrink:0,marginTop:1}}>✓</div>
                            <div style={{fontSize:13,color:"#3a4a5a",lineHeight:1.4}}>{t}</div>
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
        <div style={{...P,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{...PL,width:"100%"}}><span>Pomodoro</span><span style={{color:"#8a9ab0"}}>{pomoSessions} sessions</span></div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:6,alignSelf:"flex-start",textTransform:"uppercase",letterSpacing:"0.08em"}}>Linked to MIT</div>
          <select style={{width:"100%",fontSize:13,padding:"7px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginBottom:16}}
            value={pomoMIT||""} onChange={e=>setPomoMIT(e.target.value?Number(e.target.value):null)}>
            <option value="">— Select MIT —</option>
            {os.mits.filter(m=>!m.done).map(m=><option key={m.id} value={m.id}>{m.text.slice(0,44)}{m.text.length>44?"…":""}</option>)}
          </select>
          <div style={{position:"relative",width:130,height:130,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12}}>
            <svg width="130" height="130" viewBox="0 0 80 80" style={{position:"absolute",top:0,left:0}}>
              <circle cx="40" cy="40" r="34" fill="none" stroke="#f0f2f5" strokeWidth="5"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke={pomoMode==="work"?"#185FA5":"#3B6D11"} strokeWidth="5"
                strokeDasharray={pomoCirc} strokeDashoffset={pomoDash} strokeLinecap="round" transform="rotate(-90 40 40)"/>
            </svg>
            <div style={{position:"relative",textAlign:"center",zIndex:1}}>
              <div style={{fontSize:30,fontWeight:600,color:"#1a2332",fontFamily:"'DM Mono',monospace",lineHeight:1}}>{pad(Math.floor(pomoSecs/60))}:{pad(pomoSecs%60)}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={{...ABTN,background:pomoActive?"#FEF0F0":"#EBF3FC",color:pomoActive?"#A32D2D":"#185FA5",borderColor:pomoActive?"#f5c6c6":"#185FA5"}}
              onClick={()=>{if(!pomoActive)playChime("start");setPomoActive(a=>!a);}}>
              {pomoActive?"⏸ Pause":"▶ Start"}
            </button>
            <button style={{...ABTN,background:"#f8f9fb",color:"#6a8aaa",borderColor:"#e2e6ea"}}
              onClick={()=>{setPomoActive(false);setPomoSecs(PW);setPomoMode("work");}}>↺ Reset</button>
          </div>
        </div>

        {/* OKRs — Objectives & Key Results */}
        <div style={P}>
          <div style={PL}>
            <span>OKR Tracker</span>
            <button onClick={()=>{const id=os.nid||100;setOS({okrs:[...os.okrs,{id,objective:"New Objective",keyResult:"Describe the key result",current:0,target:10,unit:""}],nid:id+1});setEditOKR(id);}} style={SBTN}>+ Add</button>
          </div>
          {os.okrs.map(o=>{
            const pct = o.target>0 ? Math.min(100, Math.round((o.current/o.target)*100)) : 0;
            return (
              <div key={o.id} style={{padding:"9px 0",borderBottom:"0.5px solid #f0f2f5",cursor:"pointer"}} className="okr-item" onDoubleClick={()=>setEditOKR(o.id)}>
                {editOKR===o.id ? (
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={o.objective} placeholder="Objective"
                      onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,objective:e.target.value}:x)})} autoFocus/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={o.keyResult} placeholder="Key Result description"
                      onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,keyResult:e.target.value}:x)})}/>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
                      <div>
                        <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.08em"}}>Current</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} type="number" defaultValue={o.current}
                          onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,current:Number(e.target.value)}:x)})}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.08em"}}>Target</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} type="number" defaultValue={o.target}
                          onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,target:Number(e.target.value)}:x)})}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.08em"}}>Unit</div>
                        <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={o.unit} placeholder="clients, bids..."
                          onBlur={e=>setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,unit:e.target.value}:x)})}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setEditOKR(null)} style={{flex:1,padding:"7px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Done</button>
                      <button onClick={()=>{setOS({okrs:os.okrs.filter(x=>x.id!==o.id)});setEditOKR(null);}} style={{padding:"7px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:13}}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:11,color:"#185FA5",fontWeight:600,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>{o.objective}</div>
                    <div style={{fontSize:14,color:"#1a2332",marginBottom:6,lineHeight:1.4}}>{o.keyResult}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}>
                      <div style={{flex:1,height:5,background:"#f0f2f5",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:3,width:`${pct}%`,background:pctColor(pct),transition:"width 0.4s"}}/>
                      </div>
                      <div style={{fontSize:13,fontWeight:600,fontFamily:"'DM Mono',monospace",color:pctColor(pct),flexShrink:0}}>
                        {o.current} <span style={{color:"#b0bec8",fontWeight:400}}>/ {o.target}</span> <span style={{fontSize:11,color:"#b0bec8",fontWeight:400}}>{o.unit}</span>
                      </div>
                      <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:pctColor(pct),flexShrink:0,minWidth:32,textAlign:"right"}}>{pct}%</div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Vitals (formerly KPIs) */}
        <div style={P}>
          <div style={PL}>
            <span>Vitals</span>
            <button onClick={()=>{const id=os.nid||100;setOS({kpis:[...os.kpis,{id,label:"New Vital",value:"—",delta:"0%",up:null}],nid:id+1});setEditKPI(id);}} style={SBTN}>+ Add</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {os.kpis.map(k=>(
              <div key={k.id} className="kpi-c" onDoubleClick={()=>setEditKPI(k.id)}>
                {editKPI===k.id?(
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.label} placeholder="Label"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,label:e.target.value}:x)})} autoFocus/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.value} placeholder="Value e.g. ₱2.4M"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,value:e.target.value}:x)})}/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.delta} placeholder="Delta e.g. +12%"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,delta:e.target.value}:x)})}/>
                    <div style={{display:"flex",gap:6}}>
                      {([["▲","up",true,"#3B6D11","#f0faf5"],["→","neutral",null,"#8a9ab0","#f8f9fb"],["▼","down",false,"#A32D2D","#FEF0F0"]] as [string,string,boolean|null,string,string][]).map(([icon,lbl,val,fg,bg])=>(
                        <button key={lbl} onClick={()=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,up:val}:x)})}
                          style={{flex:1,padding:"5px 0",borderRadius:7,border:`1.5px solid ${k.up===val?fg:"#e2e6ea"}`,background:k.up===val?bg:"#fff",color:k.up===val?fg:"#b0bec8",cursor:"pointer",fontSize:13,fontWeight:600}}>
                          {icon}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setEditKPI(null)} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
                      <button onClick={()=>{setOS({kpis:os.kpis.filter(x=>x.id!==k.id)});setEditKPI(null);}} style={{padding:"6px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>Delete</button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:22,fontWeight:600,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#1a2332",fontFamily:"'DM Mono',monospace"}}>{k.value}</div>
                    <div style={{fontSize:11,color:"#b0bec8",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginTop:3}}>{k.label}</div>
                    <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",marginTop:4,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#8a9ab0"}}>{k.up===true?"▲ ":k.up===false?"▼ ":"→ "}{k.delta}</div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"#b0bec8",marginTop:8,textAlign:"right"}}>double-tap any card to edit</div>
        </div>

        {/* Time Blocks */}
        <div style={{...P,gridColumn:"span 2"}}>
          <div style={PL}>
            <span>Time Blocks — Today</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {curBlock&&!isCollapsed("tbs")&&<span style={{fontSize:11,background:"#EBF3FC",color:"#185FA5",padding:"3px 10px",borderRadius:20,fontFamily:"'DM Mono',monospace"}}>NOW: {curBlock.label}</span>}
              <button style={SBTN} onClick={()=>{const id=os.nid||100;setOS({tbs:[...os.tbs,{id,time:"09:00",label:"New Block",sub:"",type:"Deep Work"}],nid:id+1});}}>+ Add</button>
              <button style={SBTN} onClick={()=>toggleCollapse("tbs")}>{isCollapsed("tbs")?"Show":"Hide"}</button>
              <span style={{fontSize:11,color:"#b0bec8"}}>double-tap to edit</span>
            </div>
          </div>
          {!isCollapsed("tbs")&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
            {os.tbs.map(tb=>(
              <div key={tb.id} className="tb-r" onDoubleClick={()=>setEditTB(tb.id)}>
                {editTB===tb.id?(
                  <div style={{display:"flex",gap:6,flex:1,alignItems:"center",flexWrap:"wrap"}}>
                    <input style={{...INP,width:70,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.time}
                      onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,time:e.target.value}:x)})} placeholder="08:00"/>
                    <input style={{...INP,flex:1,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.label}
                      onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,label:e.target.value}:x)})} placeholder="Label"/>
                    <input style={{...INP,flex:2,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.sub}
                      onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,sub:e.target.value}:x)})} placeholder="Description"/>
                    <button onClick={()=>setEditTB(null)} style={{fontSize:12,padding:"5px 10px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontWeight:600}}>Done</button>
                    <button onClick={()=>{setOS({tbs:os.tbs.filter(x=>x.id!==tb.id)});setEditTB(null);}} style={{fontSize:12,padding:"5px 8px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>✕</button>
                  </div>
                ):(
                  <>
                    <div style={{width:4,height:34,borderRadius:2,flexShrink:0,background:TB_COLORS[tb.type]||"#b0bec8"}}/>
                    <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",width:40,flexShrink:0}}>{tb.time}</div>
                    <div>
                      <div style={{fontSize:14,color:"#3a4a5a",fontWeight:500}}>
                        {tb.label}
                        {curBlock?.id===tb.id&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:3,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",marginLeft:5}}>NOW</span>}
                      </div>
                      <div style={{fontSize:11,color:"#b0bec8",marginTop:1}}>{tb.sub}</div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>}
        </div>

        {/* BREWING */}
        <div style={{...P,gridColumn:"span 2"}}>
          <div style={PL}>
            <span>Brewing</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#f0f2f5",color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>{brewing.length} pending</span>
              <button style={SBTN} onClick={()=>setShowBrewForm(s=>!s)}>{showBrewForm?"Cancel":"+ Add"}</button>
            </div>
          </div>

          {showBrewForm&&(
            <div style={{background:"#f8f9fb",borderRadius:10,padding:"14px",marginBottom:14,border:"0.5px solid #e2e6ea"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>What</div>
                  <input style={{...INP,width:"100%"}} placeholder="What are you waiting on?" value={newBrew.what} onChange={e=>setNewBrew(b=>({...b,what:e.target.value}))}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Who</div>
                  <input style={{...INP,width:"100%"}} placeholder="Who is responsible?" value={newBrew.who} onChange={e=>setNewBrew(b=>({...b,who:e.target.value}))}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Since</div>
                  <input style={{...INP,width:"100%"}} placeholder="e.g. Apr 3" value={newBrew.since} onChange={e=>setNewBrew(b=>({...b,since:e.target.value}))}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Category</div>
                  <select style={{...INP,width:"100%"}} value={newBrew.category} onChange={e=>setNewBrew(b=>({...b,category:e.target.value as BrewingItem["category"]}))}>
                    {BREWING_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addBrew} style={{...ABTN,fontSize:13}}>Save</button>
            </div>
          )}

          {brewing.length===0&&!showBrewForm&&(
            <div style={{textAlign:"center",padding:"20px 0",fontSize:13,color:"#b0bec8"}}>Nothing brewing. Add items that are out of your hands but need tracking.</div>
          )}

          {brewing.map((b,i)=>(
            <div key={b.id} className="brew-row" style={{display:"flex",alignItems:"flex-start",gap:10,padding:"9px 0",borderBottom:i===brewing.length-1?"none":"0.5px solid #f0f2f5",cursor:"pointer"}}
              onDoubleClick={()=>setEditBrewing(b.id)}>
              {editBrewing===b.id?(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,flex:1,alignItems:"end"}}>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={b.what} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,what:e.target.value}:x)})} placeholder="What" autoFocus/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={b.who} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,who:e.target.value}:x)})} placeholder="Who"/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={b.since} onBlur={e=>setOS({brewing:brewing.map(x=>x.id===b.id?{...x,since:e.target.value}:x)})} placeholder="Since"/>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditBrewing(null)} style={{flex:1,padding:"7px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Done</button>
                    <button onClick={()=>{setOS({brewing:brewing.filter(x=>x.id!==b.id)});setEditBrewing(null);}} style={{padding:"7px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:13}}>✕</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{width:9,height:9,borderRadius:"50%",background:BREWING_COLORS[b.category]?.fg||"#b0bec8",flexShrink:0,marginTop:5}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:"#1a2332",fontWeight:500,lineHeight:1.4}}>{b.what}</div>
                    <div style={{fontSize:11,color:"#8a9ab0",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{b.who}{b.since?` · Since ${b.since}`:""}</div>
                  </div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:BREWING_COLORS[b.category]?.bg,color:BREWING_COLORS[b.category]?.fg,fontFamily:"'DM Mono',monospace",fontWeight:600,flexShrink:0}}>{b.category}</span>
                </>
              )}
            </div>
          ))}
          {brewing.length>0&&<div style={{fontSize:11,color:"#b0bec8",marginTop:6,textAlign:"right"}}>double-tap to edit</div>}
        </div>

        {/* CROSSHAIRS */}
        <div style={{...P,gridColumn:"span 2"}}>
          <div style={PL}>
            <span>Crosshairs</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#FEF0F0",color:"#A32D2D",fontFamily:"'DM Mono',monospace"}}>{crosshairs.length} targets</span>
              <button style={SBTN} onClick={()=>setShowCHForm(s=>!s)}>{showCHForm?"Cancel":"+ Add Target"}</button>
            </div>
          </div>

          {showCHForm&&(
            <div style={{background:"#f8f9fb",borderRadius:10,padding:"14px",marginBottom:14,border:"0.5px solid #e2e6ea"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginBottom:10}}>
                {([["Company","company","Company name"],["Sector","sector","e.g. Power Generation"],["Est. Deal","estDeal","e.g. ₱2–4M"],["Last Action","lastAction","What happened last?"],["Next Move","nextMove","What will you do next?"]] as [string,string,string][]).map(([lbl,k,ph])=>(
                  <div key={k}>
                    <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                    <input style={{...INP,width:"100%"}} placeholder={ph} value={(newCH as Record<string,string>)[k]} onChange={e=>setNewCH(c=>({...c,[k]:e.target.value}))}/>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:10,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Priority</div>
                  <select style={{...INP,width:"100%"}} value={newCH.priority} onChange={e=>setNewCH(c=>({...c,priority:e.target.value as CrosshairsTarget["priority"]}))}>
                    <option>High</option><option>Medium</option><option>Watch</option>
                  </select>
                </div>
              </div>
              <button onClick={addCH} style={{...ABTN,fontSize:13}}>Save Target</button>
            </div>
          )}

          {crosshairs.length===0&&!showCHForm&&(
            <div style={{textAlign:"center",padding:"20px 0",fontSize:13,color:"#b0bec8"}}>No targets yet. Add companies you are actively pursuing.</div>
          )}

          {/* Table header */}
          {crosshairs.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"10px 1fr 90px 1fr 1fr",gap:12,padding:"6px 0 8px",borderBottom:"0.5px solid #f0f2f5",marginBottom:2}}>
              {["","Company","Priority","Last Action","Next Move"].map(h=>(
                <div key={h} style={{fontSize:10,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'DM Mono',monospace"}}>{h}</div>
              ))}
            </div>
          )}

          {crosshairs.map((t,i)=>(
            <div key={t.id} className="ch-row" style={{display:"grid",gridTemplateColumns:"10px 1fr 90px 1fr 1fr",gap:12,padding:"10px 0",borderBottom:i===crosshairs.length-1?"none":"0.5px solid #f0f2f5",alignItems:"start",cursor:"pointer"}}
              onDoubleClick={()=>setEditCH(t.id)}>
              {editCH===t.id?(
                <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,alignItems:"end"}}>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={t.company} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,company:e.target.value}:x)})} placeholder="Company" autoFocus/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={t.sector} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,sector:e.target.value}:x)})} placeholder="Sector"/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={t.estDeal} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,estDeal:e.target.value}:x)})} placeholder="Est. Deal"/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={t.lastAction} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,lastAction:e.target.value}:x)})} placeholder="Last Action"/>
                  <input style={{...INP,border:"1px solid #185FA5",fontSize:13}} defaultValue={t.nextMove} onBlur={e=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,nextMove:e.target.value}:x)})} placeholder="Next Move"/>
                  <div style={{display:"flex",gap:6}}>
                    {(["High","Medium","Watch"] as const).map(p=>(
                      <button key={p} onClick={()=>setOS({crosshairs:crosshairs.map(x=>x.id===t.id?{...x,priority:p}:x)})}
                        style={{flex:1,padding:"6px 0",borderRadius:7,border:`1.5px solid ${t.priority===p?CROSSHAIRS_PRIORITY_COLORS[p].fg:"#e2e6ea"}`,background:t.priority===p?CROSSHAIRS_PRIORITY_COLORS[p].bg:"#fff",color:t.priority===p?CROSSHAIRS_PRIORITY_COLORS[p].fg:"#b0bec8",cursor:"pointer",fontSize:11,fontWeight:600}}>
                        {p}
                      </button>
                    ))}
                    <button onClick={()=>setEditCH(null)} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600}}>Done</button>
                    <button onClick={()=>{setOS({crosshairs:crosshairs.filter(x=>x.id!==t.id)});setEditCH(null);}} style={{padding:"6px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:13}}>✕</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{width:10,height:10,borderRadius:"50%",background:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.fg||"#b0bec8",marginTop:4}}/>
                  <div>
                    <div style={{fontSize:14,fontWeight:500,color:"#1a2332"}}>{t.company}</div>
                    <div style={{fontSize:11,color:"#8a9ab0",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{t.sector}{t.estDeal?` · ${t.estDeal}`:""}</div>
                  </div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.bg,color:CROSSHAIRS_PRIORITY_COLORS[t.priority]?.fg,fontFamily:"'DM Mono',monospace",fontWeight:600,display:"inline-block"}}>{t.priority}</span>
                  <div style={{fontSize:13,color:"#4a6a8a",lineHeight:1.5}}>{t.lastAction}</div>
                  <div style={{fontSize:13,color:"#185FA5",lineHeight:1.5,fontWeight:500}}>{t.nextMove}</div>
                </>
              )}
            </div>
          ))}
          {crosshairs.length>0&&<div style={{fontSize:11,color:"#b0bec8",marginTop:6,textAlign:"right"}}>double-tap any row to edit</div>}
        </div>

        {/* Calendar */}
        <Calendar timeBlocks={os.tbs}/>

        {/* AI Insight */}
        <div style={{...P,gridColumn:"span 2"}}>
          <div style={PL}><span>AI Insight</span><span>Powered by Claude</span></div>
          <button className="ai-b" onClick={getInsight} disabled={iLoad}>
            {iLoad?<Spinner/>:<span>✦</span>}
            <span>{iLoad?"Analyzing your dashboard...":insight?"Refresh insight":"Generate AI insight"}</span>
          </button>
          {insight&&<div style={{marginTop:12,padding:"14px 16px",borderRadius:10,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontSize:14,color:"#1a2332",lineHeight:1.75,borderLeft:"3px solid #185FA5"}}>{insight}</div>}
        </div>

      </div>
      <div style={{height:16}}/>
    </div>
  );
}
