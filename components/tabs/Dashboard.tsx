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
          <div style={PL}><span>Most Important Tasks</span><span style={{color:mitsDone===mitsTotal?"#3B6D11":"#854F0B"}}>{mitsDone}/{mitsTotal}</span></div>
          {os.mits.map((m,i)=>(
            <div key={m.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:i===os.mits.length-1?"none":"0.5px solid #f0f2f5"}}>
              <div onClick={()=>setOS({mits:os.mits.map(x=>x.id===m.id?{...x,done:!x.done}:x)})}
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
        </div>

        {/* Pomodoro */}
        <div style={{...P,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{...PL,width:"100%"}}><span>Pomodoro</span><span style={{color:"#8a9ab0"}}>{pomoSessions} sessions</span></div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginBottom:6,alignSelf:"flex-start",textTransform:"uppercase",letterSpacing:"0.08em"}}>Linked to MIT</div>
          <select style={{width:"100%",fontSize:13,padding:"7px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",marginBottom:16}}
            value={pomoMIT||""} onChange={e=>setPomoMIT(e.target.value?Number(e.target.value):null)}>
            <option value="">— Select MIT —</option>
            {os.mits.filter(m=>!m.done).map(m=><option key={m.id} value={m.id}>{m.text.slice(0,44)}{m.text.length>44?"…":""}</option>)}
          </select>
          {/* Timer ring - properly centered */}
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

        {/* OKRs */}
        <div style={P}>
          <div style={PL}><span>OKR Tracker</span><span>double-tap to edit</span></div>
          {os.okrs.map(o=>(
            <div key={o.id} className="okr-item" onDoubleClick={()=>setEditOKR(o.id)}>
              {editOKR===o.id?(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <input style={{...INP,width:"100%",border:"1px solid #185FA5"}} defaultValue={o.name}
                    onBlur={e=>{setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,name:e.target.value}:x)});setEditOKR(null);}} autoFocus/>
                  <input style={{...INP,width:"100%",border:"1px solid #185FA5"}} type="number" min="0" max="100" defaultValue={o.pct}
                    onBlur={e=>{setOS({okrs:os.okrs.map(x=>x.id===o.id?{...x,pct:Math.min(100,Math.max(0,Number(e.target.value)))}:x)});setEditOKR(null);}}/>
                </div>
              ):(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:14,color:"#3a4a5a"}}>{o.name}</span>
                    <span style={{fontSize:12,fontWeight:600,fontFamily:"'DM Mono',monospace",color:pctColor(o.pct)}}>{o.pct}%</span>
                  </div>
                  <div style={{height:4,background:"#f0f2f5",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:2,width:`${o.pct}%`,background:pctColor(o.pct),transition:"width 0.3s"}}/>
                  </div>
                  {o.note&&<div style={{fontSize:11,color:"#b0bec8",marginTop:3}}>{o.note}</div>}
                </>
              )}
            </div>
          ))}
        </div>

        {/* KPIs */}
        <div style={P}>
          <div style={PL}>
            <span>Business KPIs</span>
            <button onClick={()=>{const id=os.nid||100;setOS({kpis:[...os.kpis,{id,label:"New KPI",value:"—",delta:"0%",up:null}],nid:id+1});setEditKPI(id);}}
              style={{fontSize:11,padding:"3px 9px",borderRadius:20,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontWeight:500}}>
              + Add KPI
            </button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {os.kpis.map(k=>(
              <div key={k.id} className="kpi-c" onDoubleClick={()=>setEditKPI(k.id)} style={{position:"relative"}}>
                {editKPI===k.id?(
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.label} placeholder="Label"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,label:e.target.value}:x)})} autoFocus/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.value} placeholder="Value e.g. ₱2.4M"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,value:e.target.value}:x)})}/>
                    <input style={{...INP,width:"100%",border:"1px solid #185FA5",fontSize:13}} defaultValue={k.delta} placeholder="Delta e.g. +12%"
                      onBlur={e=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,delta:e.target.value}:x)})}/>
                    {/* Up/down/neutral toggle */}
                    <div style={{display:"flex",gap:6}}>
                      {([["▲","up",true,"#3B6D11","#f0faf5"],["→","neutral",null,"#8a9ab0","#f8f9fb"],["▼","down",false,"#A32D2D","#FEF0F0"]] as [string,string,boolean|null,string,string][]).map(([icon,lbl,val,fg,bg])=>(
                        <button key={lbl} onClick={()=>setOS({kpis:os.kpis.map(x=>x.id===k.id?{...x,up:val}:x)})}
                          style={{flex:1,padding:"5px 0",borderRadius:7,border:`1.5px solid ${k.up===val?fg:"#e2e6ea"}`,background:k.up===val?bg:"#fff",color:k.up===val?fg:"#b0bec8",cursor:"pointer",fontSize:13,fontWeight:600}}>
                          {icon}
                        </button>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setEditKPI(null)}
                        style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>
                        Done
                      </button>
                      <button onClick={()=>{setOS({kpis:os.kpis.filter(x=>x.id!==k.id)});setEditKPI(null);}}
                        style={{padding:"6px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer",fontSize:12}}>
                        Delete
                      </button>
                    </div>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:22,fontWeight:600,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#1a2332",fontFamily:"'DM Mono',monospace"}}>{k.value}</div>
                    <div style={{fontSize:11,color:"#b0bec8",letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginTop:3}}>{k.label}</div>
                    <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",marginTop:4,color:k.up===true?"#3B6D11":k.up===false?"#A32D2D":"#8a9ab0"}}>
                      {k.up===true?"▲ ":k.up===false?"▼ ":"→ "}{k.delta}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"#b0bec8",marginTop:8,textAlign:"right"}}>double-tap any card to edit</div>
        </div>

        {/* Time Blocks — with inline double-tap editing */}
        <div style={{...P,gridColumn:"span 2"}}>
          <div style={PL}>
            <span>Time Blocks — Today</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {curBlock&&<span style={{fontSize:11,background:"#EBF3FC",color:"#185FA5",padding:"3px 10px",borderRadius:20,fontFamily:"'DM Mono',monospace"}}>NOW: {curBlock.label}</span>}
              <span style={{fontSize:11,color:"#b0bec8"}}>double-tap to edit</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
            {os.tbs.map(tb=>(
              <div key={tb.id} className="tb-r" onDoubleClick={()=>setEditTB(tb.id)}>
                {editTB===tb.id?(
                  <div style={{display:"flex",gap:6,flex:1,alignItems:"center",flexWrap:"wrap"}}>
                    <input style={{...INP,width:70,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.time}
                      onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,time:e.target.value}:x)})} placeholder="08:00"/>
                    <input style={{...INP,flex:1,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.label}
                      onBlur={e=>setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,label:e.target.value}:x)})} placeholder="Label"/>
                    <input style={{...INP,flex:2,border:"1px solid #185FA5",fontSize:13}} defaultValue={tb.sub}
                      onBlur={e=>{setOS({tbs:os.tbs.map(x=>x.id===tb.id?{...x,sub:e.target.value}:x)});setEditTB(null);}} placeholder="Description · duration"/>
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
          </div>
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
      <div style={{textAlign:"center",fontSize:11,color:"#c8d0d8",fontFamily:"'DM Mono',monospace",padding:"8px 0 16px"}}>Ultra Power Executive OS · Resets in {timeLeft}</div>
    </div>
  );
}
