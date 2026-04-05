"use client";
import { useState, useEffect, useCallback } from "react";
import { kvGet, kvSet } from "@/lib/kv";
import { MOODS, getTodayKey, getResetMs, fmtCountdown, MFPDay, DEFAULT_MFP, DEFAULT_OS } from "@/lib/constants";

export default function MentalFitness() {
  const tk = getTodayKey();
  const [mfp, setMFPRaw] = useState<MFPDay>(DEFAULT_MFP);
  const [activeMIT, setActiveMIT] = useState("No active MIT");
  const [streak, setStreak] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [quote, setQuote] = useState<{quote:string;author:string;role:string;relevance:string}|null>(null);
  const [qLoad, setQLoad] = useState(false);
  const [qErr, setQErr] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      const [mfpData, osData] = await Promise.all([
        kvGet<MFPDay>(`mfp:${tk}`),
        kvGet<typeof DEFAULT_OS>("dashboard"),
      ]);
      if (mfpData) setMFPRaw(mfpData);
      if (osData) {
        const active = osData.mits.find(m => !m.done);
        if (active) setActiveMIT(active.text);
      }
      // Streak calc
      let s = 0;
      const d = new Date();
      for (let i = 1; i <= 30; i++) {
        const b = new Date(d); b.setDate(b.getDate()-i); b.setHours(3,0,0,0);
        const k = b.toISOString().split("T")[0];
        const e = await kvGet<MFPDay>(`mfp:${k}`);
        if (e && e.mood && e.mitDone && e.winDone && e.reflDone) s++;
        else break;
      }
      setStreak(s);
      setLoaded(true);
    })();
  }, [tk]);

  const setMFP = useCallback((patch: Partial<MFPDay>) => {
    setMFPRaw(prev => {
      const next = { ...prev, ...patch };
      kvSet(`mfp:${tk}`, next);
      return next;
    });
  }, [tk]);

  const mfpScore = [mfp.mood, mfp.mitDone, mfp.winDone, mfp.reflDone].filter(Boolean).length;
  const timeLeft = fmtCountdown(getResetMs() - now.getTime());
  const moodObj = MOODS.find(m => m.id === mfp.mood);

  const getQuote = async () => {
    setQLoad(true); setQuote(null); setQErr("");
    const mood = moodObj?.label || "not specified";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:500,
          system:`Quote curator like Criminal Minds — surgical precision for this exact moment. Real quote, real person. Respond ONLY valid JSON no markdown: {"quote":"...","author":"...","role":"...","relevance":"..."}`,
          messages:[{role:"user",content:`Khalil Banares, Engineering Solutions Director, Ultra Power Industrial Resources, Makati PH. Industrial lighting B2B. Clients: EDC NGCP First Gen Aboitiz. Mood: ${mood}. Score: ${mfpScore}/4.`}]
        })
      });
      const d = await res.json();
      const txt = d?.content?.[0]?.text?.trim();
      if (txt) setQuote(JSON.parse(txt.replace(/```json|```/g,"")));
      else setQErr("Could not get quote. Try again.");
    } catch { setQErr("Connection error."); }
    setQLoad(false);
  };

  const panel: React.CSSProperties = { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"13px 15px", marginBottom:10 };
  const cb = (done: boolean): React.CSSProperties => ({ width:16,height:16,borderRadius:4,border:`1.5px solid ${done?"#185FA5":"#d0d8e0"}`,background:done?"#185FA5":"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:1,fontSize:9,color:"#fff" });
  const ta: React.CSSProperties = { width:"100%",fontSize:11,padding:"6px 8px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",resize:"none",lineHeight:1.5 };

  const Spinner = () => <span style={{width:12,height:12,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

  return (
    <div style={{ flex:1, overflow:"auto", padding:14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth:540, margin:"0 auto" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:600, color:"#1a2332" }}>Mental Fitness</div>
            <div style={{ fontSize:10, color:"#8a9ab0", fontFamily:"'DM Mono',monospace", marginTop:1 }}>Resets in {timeLeft}</div>
          </div>
          {streak > 0 && <div style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"#f0faf5", color:"#3B6D11", border:"0.5px solid #c8e6c9", fontFamily:"'DM Mono',monospace", fontWeight:500 }}>🔥 {streak}-day streak</div>}
        </div>

        {/* Progress */}
        <div style={{ ...panel, padding:"10px 14px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:11, fontWeight:600, color:"#1a2332" }}>Today's Progress</span>
            <span style={{ fontSize:11, fontWeight:600, fontFamily:"'DM Mono',monospace", color:mfpScore===4?"#3B6D11":mfpScore>=2?"#185FA5":"#854F0B" }}>
              {mfpScore}/4 · {["Not started","Getting started","In progress","Almost there","Complete"][mfpScore]}
            </span>
          </div>
          <div style={{ height:3, background:"#f0f2f5", borderRadius:2, overflow:"hidden", marginTop:6 }}>
            <div style={{ height:"100%", borderRadius:2, width:`${(mfpScore/4)*100}%`, background:mfpScore===4?"#3B6D11":mfpScore>=2?"#185FA5":"#854F0B", transition:"width 0.3s" }}/>
          </div>
        </div>

        {/* Mood */}
        <div style={panel}>
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:"#b0bec8", marginBottom:9, fontFamily:"'DM Mono',monospace" }}>01 — Mood Check-In</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
            {MOODS.map(m => (
              <button key={m.id} onClick={() => setMFP({ mood:mfp.mood===m.id?null:m.id, moodTime:mfp.mood===m.id?null:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) })}
                style={{ border:`${mfp.mood===m.id?"1.5px solid #185FA5":"0.5px solid #e2e6ea"}`, borderRadius:9, padding:"8px 4px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:"pointer", background:mfp.mood===m.id?"#EBF3FC":"#fff" }}>
                <span style={{ fontSize:18, lineHeight:1 }}>{m.emoji}</span>
                <span style={{ fontSize:9, fontWeight:500, color:mfp.mood===m.id?"#185FA5":"#6a8aaa", textAlign:"center" }}>{m.label}</span>
              </button>
            ))}
          </div>
          {mfp.mood && moodObj && (
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:9, padding:"7px 10px", background:"#EBF3FC", borderRadius:8, border:"0.5px solid #c5ddf5" }}>
              <span style={{ fontSize:18 }}>{moodObj.emoji}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:"#185FA5" }}>{moodObj.label} logged</div>
                <div style={{ fontSize:9, color:"#6a9ac8", fontFamily:"'DM Mono',monospace" }}>{mfp.moodTime}</div>
              </div>
              <span style={{ marginLeft:"auto", fontSize:10, padding:"2px 8px", borderRadius:20, background:"#185FA5", color:"#fff", fontFamily:"'DM Mono',monospace" }}>✓</span>
            </div>
          )}
        </div>

        {/* Discipline */}
        <div style={panel}>
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:"#b0bec8", marginBottom:9, fontFamily:"'DM Mono',monospace" }}>02 — Discipline Tracker</div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"8px 0", borderBottom:"0.5px solid #f0f2f5" }}>
            <div style={cb(mfp.mitDone)} onClick={() => setMFP({ mitDone:!mfp.mitDone })}>{mfp.mitDone?"✓":""}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:"#1a2332", marginBottom:4 }}>Today's MIT confirmed</div>
              <div style={{ fontSize:11, padding:"6px 9px", borderRadius:7, background:"#EBF3FC", color:"#185FA5", border:"0.5px solid #c5ddf5", fontWeight:500 }}>📋 {activeMIT}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"8px 0", borderBottom:"0.5px solid #f0f2f5" }}>
            <div style={cb(mfp.winDone)} onClick={() => { if (mfp.win?.trim()) setMFP({ winDone:!mfp.winDone }); }}>{mfp.winDone?"✓":""}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:"#1a2332", marginBottom:4 }}>One small win</div>
              <textarea style={ta} rows={2} placeholder="What is one thing you got done today, no matter how small?" value={mfp.win||""} onChange={e=>setMFP({win:e.target.value,winDone:e.target.value.trim()?mfp.winDone:false})}/>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"8px 0" }}>
            <div style={cb(mfp.reflDone)} onClick={() => { if (mfp.refl?.trim()) setMFP({ reflDone:!mfp.reflDone }); }}>{mfp.reflDone?"✓":""}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:"#1a2332", marginBottom:4 }}>End-of-day reflection</div>
              <textarea style={ta} rows={2} placeholder="One honest thought about today. No judgment." value={mfp.refl||""} onChange={e=>setMFP({refl:e.target.value,reflDone:e.target.value.trim()?mfp.reflDone:false})}/>
            </div>
          </div>
          <div style={{ marginTop:8, textAlign:"right", fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>Resets at 3:00 AM · {timeLeft} remaining</div>
        </div>

        {/* Quote */}
        <div style={panel}>
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:"#b0bec8", marginBottom:9, fontFamily:"'DM Mono',monospace" }}>03 — Today's Quote</div>
          <div style={{ fontSize:11, color:"#8a9ab0", marginBottom:10, lineHeight:1.5 }}>A quote chosen for your exact situation — mood, context, what the day demands.</div>
          <button onClick={getQuote} disabled={qLoad} style={{ width:"100%", padding:9, borderRadius:9, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#1a2332", fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            {qLoad ? <Spinner/> : <span style={{ fontSize:13 }}>❝</span>}
            <span>{qLoad?"Finding the right quote...":quote?"Get another quote":"Get today's quote"}</span>
          </button>
          {qErr && <div style={{ marginTop:8, padding:"8px 10px", borderRadius:7, background:"#FEF0F0", border:"0.5px solid #f5c6c6", fontSize:11, color:"#A32D2D" }}>{qErr}</div>}
          {quote && !qLoad && (
            <div style={{ marginTop:12 }}>
              <div style={{ padding:"14px 16px", borderRadius:10, background:"#f8f9fb", borderLeft:"3px solid #185FA5" }}>
                <div style={{ fontSize:26, color:"#c5ddf5", fontFamily:"Georgia,serif", lineHeight:1, marginBottom:4, userSelect:"none" }}>"</div>
                <div style={{ fontSize:13, color:"#1a2332", lineHeight:1.7, fontStyle:"italic", fontFamily:"Georgia,serif", marginTop:-8 }}>{quote.quote}</div>
                <div style={{ fontSize:11, fontWeight:600, color:"#185FA5", marginTop:10 }}>— {quote.author}</div>
                <div style={{ fontSize:9, color:"#8a9ab0", fontFamily:"'DM Mono',monospace", marginTop:1 }}>{quote.role}</div>
              </div>
              {quote.relevance && (
                <div style={{ marginTop:7, padding:"8px 11px", borderRadius:8, background:"#EBF3FC", border:"0.5px solid #c5ddf5", fontSize:11, color:"#2a5a8a", lineHeight:1.5 }}>
                  <span style={{ fontWeight:600, fontFamily:"'DM Mono',monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.08em", color:"#5a8ab0" }}>Why this, why now · </span>{quote.relevance}
                </div>
              )}
            </div>
          )}
        </div>

        {mfpScore === 4 && (
          <div style={{ textAlign:"center", padding:14, background:"#f0faf5", border:"0.5px solid #c8e6c9", borderRadius:10, marginBottom:10 }}>
            <div style={{ fontSize:18 }}>✅</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#3B6D11", marginTop:4 }}>Panel complete for today</div>
            <div style={{ fontSize:10, color:"#6aaa6a", marginTop:2 }}>Streak extended. See you tomorrow.</div>
          </div>
        )}
      </div>
    </div>
  );
}
