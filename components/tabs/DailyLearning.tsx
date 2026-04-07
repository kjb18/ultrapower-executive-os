"use client";
import { useState, useEffect, useRef } from "react";
import { kvGet, kvSet, kvDel } from "@/lib/kv";

const CATEGORIES = ["Business strategy","Sales & negotiation","Marketing & branding","Personal productivity","Finance & wealth","Mindset & self-help"];

function getTodayKey() {
  const d = new Date();
  return `learning:${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDate() {
  return new Date().toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}

function buildPrompt(category: string, usedIds: string[], request: string) {
  const avoid = usedIds.length > 0 ? `\nAvoid these already-used topics: ${usedIds.slice(-20).join(", ")}.` : "";
  const req = request ? `\nFocus today's module on: "${request}".` : "";
  return `You are a business learning coach generating a daily learning module for Khalil, Engineering Solutions Director at Ultra Power Industrial Resources Inc. in the Philippines — a B2B industrial distributor serving power generation, oil & gas, manufacturing, mining, and government sectors.

Today's category: ${category}${req}${avoid}

Generate a rich daily learning module in JSON format ONLY. No preamble, no markdown fences, just raw JSON.

Format:
{
  "quote": { "text": "...", "author": "..." },
  "spotlight": { "title": "...", "author": "...", "type": "Book|Concept|Framework", "tagline": "..." },
  "lessons": [
    { "heading": "...", "body": "..." },
    { "heading": "...", "body": "..." },
    { "heading": "...", "body": "..." },
    { "heading": "...", "body": "..." },
    { "heading": "...", "body": "..." }
  ],
  "deepdive": { "heading": "...", "body": "..." },
  "action_item": { "heading": "...", "body": "..." },
  "category": "${category}",
  "spotlight_id": "unique-slug"
}`;
}

interface Module {
  quote: { text: string; author: string };
  spotlight: { title: string; author: string; type: string; tagline: string };
  lessons: { heading: string; body: string }[];
  deepdive: { heading: string; body: string };
  action_item: { heading: string; body: string };
  category: string;
  spotlight_id: string;
  dateLabel?: string;
}

interface HistItem { spotlight_id: string; category: string; date: string; title: string; }

export default function DailyLearning() {
  const [view, setView] = useState("Today's module");
  const [module, setModule] = useState<Module|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [request, setRequest] = useState("");
  const [pendingRequest, setPendingRequest] = useState("");
  const [requestSaved, setRequestSaved] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [ready, setReady] = useState(false);
  const generated = useRef(false);

  useEffect(() => {
    (async () => {
      const hist = await kvGet<HistItem[]>("learning:history") || [];
      setHistory(hist);
      const pendReq = await kvGet<string>("learning:request") || "";
      if (pendReq) setPendingRequest(pendReq);
      const todayMod = await kvGet<Module>(getTodayKey());
      if (todayMod) {
        setModule(todayMod);
      } else if (!generated.current) {
        generated.current = true;
        await generateModule(hist, pendReq);
      }
      setReady(true);
    })();
  }, []);

  const generateModule = async (hist: HistItem[], pendReq: string) => {
    setLoading(true); setError(null);
    const usedIds = hist.map(h => h.spotlight_id).filter(Boolean);
    const usedCats = hist.slice(-6).map(h => h.category);
    try {
      const res = await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usedIds, usedCats, pendingRequest: pendReq }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Error: ${data.error || res.status} — please try again.`);
        setLoading(false);
        return;
      }
      const parsed: Module = data.module;
      parsed.dateLabel = formatDate();
      await kvSet(getTodayKey(), parsed);
      const newHist = [{ spotlight_id: parsed.spotlight_id, category: parsed.category, date: getTodayKey(), title: parsed.spotlight.title }, ...hist].slice(0, 60);
      await kvSet("learning:history", newHist);
      setHistory(newHist);
      if (pendReq) { await kvDel("learning:request"); setPendingRequest(""); }
      setModule(parsed);
    } catch (e) {
      setError(`Network error: ${String(e)}`);
    }
    setLoading(false);
  };

  const saveRequest = async () => {
    if (!request.trim()) return;
    await kvSet("learning:request", request.trim());
    setPendingRequest(request.trim()); setRequest(""); setRequestSaved(true);
    setTimeout(() => setRequestSaved(false), 3000);
  };

  const forceRegen = async () => {
    generated.current = true;
    await kvDel(getTodayKey());
    setModule(null);
    const hist = await kvGet<HistItem[]>("learning:history") || [];
    const pendReq = await kvGet<string>("learning:request") || "";
    await generateModule(hist, pendReq);
  };

  const card: React.CSSProperties = { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"16px 18px", marginBottom:10 };
  const label: React.CSSProperties = { fontSize:9, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#b0bec8", marginBottom:8, display:"block", fontFamily:"'DM Mono',monospace" };
  const badge: React.CSSProperties = { display:"inline-block", fontSize:10, fontWeight:500, padding:"2px 9px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", border:"0.5px solid #c5ddf5", marginBottom:10 };
  const navBtn = (active: boolean): React.CSSProperties => ({ padding:"5px 13px", borderRadius:20, border:`0.5px solid ${active?"#185FA5":"#e2e6ea"}`, background:active?"#EBF3FC":"#fff", color:active?"#185FA5":"#8a9ab0", cursor:"pointer", fontSize:11, fontWeight:active?600:400, fontFamily:"'DM Mono',monospace" });
  const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", borderRadius:8, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#1a2332", fontSize:12 };
  const Spinner = () => <span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

  if (!ready) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#b0bec8", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading your learning hub...
    </div>
  );

  return (
    <div style={{ flex:1, overflow:"auto", padding:14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth:680, margin:"0 auto" }}>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:16, fontWeight:600, color:"#1a2332" }}>Daily Learning</div>
          <div style={{ fontSize:10, color:"#b0bec8", fontFamily:"'DM Mono',monospace", marginTop:2 }}>{formatDate()}</div>
        </div>

        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {["Today's module","History","Request a topic"].map(v => (
            <button key={v} style={navBtn(view===v)} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>

        {view === "Today's module" && (
          <>
            {loading && (
              <div style={{ ...card, textAlign:"center", padding:"2.5rem" }}>
                <Spinner/>
                <p style={{ color:"#8a9ab0", fontSize:13, marginTop:12 }}>Generating today's module — this takes about 15 seconds...</p>
              </div>
            )}
            {error && !loading && (
              <div style={{ ...card, borderColor:"#f5c6c6" }}>
                <p style={{ color:"#A32D2D", margin:"0 0 12px", fontSize:13 }}>{error}</p>
                <button onClick={forceRegen} style={{ padding:"7px 14px", borderRadius:8, border:"none", background:"#1a2332", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:500 }}>Try again</button>
              </div>
            )}
            {module && !loading && (
              <>
                <div style={card}>
                  <span style={label}>Quote of the day</span>
                  <p style={{ fontFamily:"Georgia,serif", fontSize:15, lineHeight:1.7, fontStyle:"italic", color:"#1a2332", borderLeft:"3px solid #185FA5", paddingLeft:"1rem" }}>{module.quote?.text}</p>
                  <p style={{ fontSize:12, color:"#b0bec8", marginTop:6, fontFamily:"'DM Mono',monospace" }}>— {module.quote?.author}</p>
                </div>
                <div style={card}>
                  <span style={badge}>{module.category}</span>
                  {module.spotlight?.type && <span style={{ ...badge, marginLeft:6, background:"#f0faf5", color:"#3B6D11", borderColor:"#c8e6c9" }}>{module.spotlight.type}</span>}
                  <div style={{ fontSize:16, fontWeight:600, color:"#1a2332", marginBottom:4 }}>{module.spotlight?.title}</div>
                  {module.spotlight?.author && <p style={{ fontSize:12, color:"#b0bec8", margin:"0 0 10px", fontFamily:"'DM Mono',monospace" }}>by {module.spotlight.author}</p>}
                  <p style={{ fontSize:13, lineHeight:1.7, color:"#4a6a8a" }}>{module.spotlight?.tagline}</p>
                </div>
                <div style={card}>
                  <span style={label}>Key lessons</span>
                  {module.lessons?.map((l, i) => (
                    <div key={i} style={{ marginBottom: i < module.lessons.length-1 ? "1rem" : 0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", marginBottom:4 }}>{l.heading}</div>
                      <p style={{ fontSize:13, lineHeight:1.7, color:"#4a6a8a" }}>{l.body}</p>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <span style={label}>Deep dive</span>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", marginBottom:4 }}>{module.deepdive?.heading}</div>
                  <p style={{ fontSize:13, lineHeight:1.7, color:"#4a6a8a" }}>{module.deepdive?.body}</p>
                </div>
                <div style={{ ...card, borderColor: showAction ? "#c5ddf5" : "#e2e6ea" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:showAction?12:0 }}>
                    <span style={label}>Action item (optional)</span>
                    <button onClick={() => setShowAction(!showAction)} style={{ padding:"4px 10px", borderRadius:7, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#4a6a8a", cursor:"pointer", fontSize:11 }}>{showAction?"Hide":"Show"}</button>
                  </div>
                  {showAction && (
                    <>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", marginBottom:4 }}>{module.action_item?.heading}</div>
                      <p style={{ fontSize:13, lineHeight:1.7, color:"#4a6a8a" }}>{module.action_item?.body}</p>
                    </>
                  )}
                </div>
                <div style={{ textAlign:"right", marginTop:4 }}>
                  <button onClick={forceRegen} style={{ padding:"6px 12px", borderRadius:8, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#6a8aaa", cursor:"pointer", fontSize:11 }}>Regenerate today</button>
                </div>
              </>
            )}
          </>
        )}

        {view === "History" && (
          <div style={card}>
            <span style={label}>Modules read</span>
            {history.length === 0 && <p style={{ fontSize:13, color:"#b0bec8" }}>No history yet.</p>}
            {history.map((h, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i===history.length-1?"none":"0.5px solid #f0f2f5" }}>
                <div>
                  <div style={{ fontWeight:500, fontSize:13, color:"#1a2332" }}>{h.title}</div>
                  <div style={{ fontSize:11, color:"#b0bec8", marginTop:2, fontFamily:"'DM Mono',monospace" }}>{h.category}</div>
                </div>
                <div style={{ fontSize:11, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>{h.date?.replace("learning:","")}</div>
              </div>
            ))}
          </div>
        )}

        {view === "Request a topic" && (
          <>
            <div style={card}>
              <span style={label}>Request tomorrow's topic</span>
              <p style={{ fontSize:13, color:"#4a6a8a", marginBottom:12, lineHeight:1.6 }}>Enter a book title, author, concept, or any topic. Your request will be used to generate the next module.</p>
              <textarea style={{ ...inp, resize:"vertical", minHeight:80, marginBottom:8 } as React.CSSProperties}
                placeholder="e.g. The 48 Laws of Power by Robert Greene, or a deep dive on pricing strategy for B2B..."
                value={request} onChange={e => setRequest(e.target.value)}/>
              <button onClick={saveRequest} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#1a2332", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:500 }}>Save request</button>
              {requestSaved && <p style={{ fontSize:12, color:"#3B6D11", marginTop:6 }}>Request saved for next module.</p>}
            </div>
            {pendingRequest && (
              <div style={{ ...card, borderColor:"#c5ddf5" }}>
                <span style={label}>Pending request</span>
                <p style={{ fontSize:13, color:"#1a2332" }}>"{pendingRequest}"</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
