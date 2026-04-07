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

interface Lesson { heading: string; body: string; }
interface Module {
  quote: { text: string; author: string };
  spotlight: { title: string; author: string; type: string; tagline: string };
  lessons: Lesson[];
  deepdive: { heading: string; body: string };
  action_item: { heading: string; body: string };
  category: string;
  spotlight_id: string;
  dateLabel?: string;
  diagram?: { type: string; data: DiagramData };
}
interface DiagramData {
  labels?: string[];
  items?: { label: string; desc?: string }[];
  axes?: { x: string; y: string; quadrants: string[] };
  steps?: string[];
}
interface HistItem { spotlight_id: string; category: string; date: string; title: string; }

// ── Diagram renderer ────────────────────────────────────────────────────────────
function ConceptDiagram({ diagram }: { diagram: { type: string; data: DiagramData } }) {
  const { type, data } = diagram;
  if (!data) return null;

  const S = {
    wrap: { background:"#f8f9fb", border:"0.5px solid #e2e6ea", borderRadius:12, padding:"20px", marginBottom:16 } as React.CSSProperties,
    title: { fontSize:10, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase" as const, color:"#b0bec8", marginBottom:14, fontFamily:"'DM Mono',monospace" },
  };

  // Pyramid
  if (type === "pyramid" && data.labels) {
    const colors = ["#185FA5","#2478AA","#4A8AC0","#7AAAD4","#A8C8E8"];
    return (
      <div style={S.wrap}>
        <div style={S.title}>Framework Hierarchy</div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
          {data.labels.map((lbl,i)=>(
            <div key={i} style={{background:colors[i]||"#b0bec8",color:"#fff",borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:500,textAlign:"center",width:`${60+i*10}%`,maxWidth:320}}>
              {lbl}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2x2 Matrix
  if (type === "matrix" && data.axes && data.axes.quadrants) {
    const [q1,q2,q3,q4] = data.axes.quadrants;
    const qColors = ["#EBF3FC","#f0faf5","#FFF8EC","#FEF0F0"];
    const qText = ["#185FA5","#3B6D11","#854F0B","#A32D2D"];
    return (
      <div style={S.wrap}>
        <div style={S.title}>Strategic Matrix</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:10,color:"#b0bec8",writingMode:"vertical-rl",transform:"rotate(180deg)",fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase"}}>{data.axes.y}</div>
          <div style={{flex:1}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[q1,q2,q3,q4].map((q,i)=>(
                <div key={i} style={{background:qColors[i],borderRadius:8,padding:"12px 10px",textAlign:"center",fontSize:12,fontWeight:600,color:qText[i],minHeight:60,display:"flex",alignItems:"center",justifyContent:"center"}}>{q}</div>
              ))}
            </div>
            <div style={{textAlign:"center",fontSize:10,color:"#b0bec8",marginTop:6,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase"}}>{data.axes.x}</div>
          </div>
        </div>
      </div>
    );
  }

  // Process steps / cycle
  if (type === "steps" && data.steps) {
    const colors = ["#185FA5","#2478AA","#3B6D11","#854F0B","#534AB7","#A32D2D"];
    return (
      <div style={S.wrap}>
        <div style={S.title}>Process Flow</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
          {data.steps.map((step,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{background:colors[i%colors.length],color:"#fff",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:500}}>
                <span style={{fontSize:10,opacity:0.8,marginRight:5}}>{i+1}.</span>{step}
              </div>
              {i<data.steps!.length-1&&<span style={{color:"#b0bec8",fontSize:16}}>→</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // List cards
  if (type === "cards" && data.items) {
    const colors = ["#EBF3FC","#f0faf5","#FFF8EC","#F4F3FE","#FEF0F0"];
    const text = ["#185FA5","#3B6D11","#854F0B","#534AB7","#A32D2D"];
    return (
      <div style={S.wrap}>
        <div style={S.title}>Key Concepts</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
          {data.items.map((item,i)=>(
            <div key={i} style={{background:colors[i%colors.length],borderRadius:9,padding:"11px 12px"}}>
              <div style={{fontSize:12,fontWeight:600,color:text[i%text.length],marginBottom:item.desc?4:0}}>{item.label}</div>
              {item.desc&&<div style={{fontSize:11,color:text[i%text.length],opacity:0.75,lineHeight:1.4}}>{item.desc}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ── Book cover ───────────────────────────────────────────────────────────────────
function BookCover({ title, author, type }: { title: string; author: string; type: string }) {
  const [imgUrl, setImgUrl] = useState<string|null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (type !== "Book") return;
    const query = encodeURIComponent(`${title} ${author}`);
    fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`)
      .then(r=>r.json())
      .then(data=>{
        const coverId = data.docs?.[0]?.cover_i;
        if (coverId) setImgUrl(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
        else setImgFailed(true);
      })
      .catch(()=>setImgFailed(true));
  }, [title, author, type]);

  const colors = ["#185FA5","#3B6D11","#534AB7","#854F0B","#A32D2D"];
  const color = colors[title.charCodeAt(0)%colors.length];

  if (type !== "Book" || imgFailed || (!imgUrl)) {
    // Styled typographic card fallback
    return (
      <div style={{width:100,height:140,borderRadius:8,background:color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"12px 10px",textAlign:"center",flexShrink:0,boxShadow:"2px 3px 8px rgba(0,0,0,0.15)"}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>{type}</div>
        <div style={{fontSize:11,fontWeight:700,color:"#fff",lineHeight:1.3}}>{title.slice(0,30)}</div>
        {author&&<div style={{fontSize:9,color:"rgba(255,255,255,0.7)",marginTop:6,lineHeight:1.3}}>{author}</div>}
      </div>
    );
  }

  return (
    <img src={imgUrl} alt={title} onError={()=>setImgFailed(true)}
      style={{width:100,height:140,objectFit:"cover",borderRadius:8,flexShrink:0,boxShadow:"2px 3px 8px rgba(0,0,0,0.15)"}}/>
  );
}

// ── Pull quote ───────────────────────────────────────────────────────────────────
function PullQuote({ text }: { text: string }) {
  // Extract a punchy sentence from lesson body
  const sentences = text.split(/\.\s+/);
  const best = sentences.reduce((a,b)=>b.length>20&&b.length<120?b:a,"");
  if (!best) return null;
  return (
    <div style={{borderLeft:"3px solid #185FA5",padding:"10px 16px",margin:"16px 0",background:"#EBF3FC",borderRadius:"0 8px 8px 0"}}>
      <div style={{fontSize:15,fontStyle:"italic",color:"#185FA5",lineHeight:1.6,fontFamily:"Georgia,serif"}}>{best}.</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────
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
      if (todayMod) { setModule(todayMod); }
      else if (!generated.current) {
        generated.current = true;
        await generateModule(hist, pendReq);
      }
      setReady(true);
    })();
  }, []);

  const generateModule = async (hist: HistItem[], pendReq: string) => {
    setLoading(true); setError(null);
    const usedIds = hist.map(h=>h.spotlight_id).filter(Boolean);
    const usedCats = hist.slice(-6).map(h=>h.category);
    try {
      const res = await fetch("/api/learning", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({usedIds,usedCats,pendingRequest:pendReq}),
      });
      const data = await res.json();
      if (!res.ok||data.error) { setError(`Error: ${data.error||res.status}`); setLoading(false); return; }
      const parsed: Module = data.module;
      parsed.dateLabel = formatDate();
      await kvSet(getTodayKey(), parsed);
      const newHist = [{spotlight_id:parsed.spotlight_id,category:parsed.category,date:getTodayKey(),title:parsed.spotlight.title},...hist].slice(0,60);
      await kvSet("learning:history", newHist);
      setHistory(newHist);
      if (pendReq) { await kvDel("learning:request"); setPendingRequest(""); }
      setModule(parsed);
    } catch(e) { setError(`Network error: ${String(e)}`); }
    setLoading(false);
  };

  const saveRequest = async () => {
    if (!request.trim()) return;
    await kvSet("learning:request", request.trim());
    setPendingRequest(request.trim()); setRequest(""); setRequestSaved(true);
    setTimeout(()=>setRequestSaved(false), 3000);
  };

  const forceRegen = async () => {
    generated.current = true;
    await kvDel(getTodayKey());
    setModule(null);
    const hist = await kvGet<HistItem[]>("learning:history")||[];
    const pendReq = await kvGet<string>("learning:request")||"";
    await generateModule(hist, pendReq);
  };

  const card: React.CSSProperties = {background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:12,padding:"18px 20px",marginBottom:12};
  const lbl: React.CSSProperties = {fontSize:10,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:8,display:"block",fontFamily:"'DM Mono',monospace"};
  const badge = (bg:string,fg:string): React.CSSProperties => ({display:"inline-block",fontSize:11,fontWeight:500,padding:"2px 10px",borderRadius:20,background:bg,color:fg,border:`0.5px solid ${fg}33`,marginBottom:10,marginRight:6});
  const navBtn = (a:boolean): React.CSSProperties => ({padding:"6px 14px",borderRadius:20,border:`0.5px solid ${a?"#185FA5":"#e2e6ea"}`,background:a?"#EBF3FC":"#fff",color:a?"#185FA5":"#8a9ab0",cursor:"pointer",fontSize:12,fontWeight:a?600:400,fontFamily:"'DM Mono',monospace"});
  const Spinner = ()=><span style={{width:14,height:14,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>;

  if (!ready) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:13,fontFamily:"'DM Mono',monospace"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading your learning hub...
    </div>
  );

  return (
    <div style={{flex:1,overflow:"auto",padding:14}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{maxWidth:700,margin:"0 auto"}}>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:17,fontWeight:600,color:"#1a2332"}}>Daily Learning</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",marginTop:2}}>{formatDate()}</div>
        </div>

        <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
          {["Today's module","History","Request a topic"].map(v=>(
            <button key={v} style={navBtn(view===v)} onClick={()=>setView(v)}>{v}</button>
          ))}
        </div>

        {view==="Today's module"&&<>
          {loading&&(
            <div style={{...card,textAlign:"center",padding:"2.5rem"}}>
              <Spinner/>
              <p style={{color:"#8a9ab0",fontSize:13,marginTop:12}}>Generating today's module, this takes about 15 seconds...</p>
            </div>
          )}
          {error&&!loading&&(
            <div style={{...card,borderColor:"#f5c6c6"}}>
              <p style={{color:"#A32D2D",margin:"0 0 12px",fontSize:13}}>{error}</p>
              <button onClick={forceRegen} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Try again</button>
            </div>
          )}
          {module&&!loading&&<>

            {/* Quote */}
            <div style={card}>
              <span style={lbl}>Quote of the day</span>
              <p style={{fontFamily:"Georgia,serif",fontSize:16,lineHeight:1.7,fontStyle:"italic",color:"#1a2332",borderLeft:"3px solid #185FA5",paddingLeft:"1rem",margin:0}}>{module.quote?.text}</p>
              <p style={{fontSize:12,color:"#b0bec8",marginTop:8,fontFamily:"'DM Mono',monospace"}}>— {module.quote?.author}</p>
            </div>

            {/* Spotlight with book cover */}
            <div style={card}>
              <div style={{display:"flex",gap:18,alignItems:"flex-start"}}>
                <BookCover title={module.spotlight?.title||""} author={module.spotlight?.author||""} type={module.spotlight?.type||""}/>
                <div style={{flex:1}}>
                  <span style={badge("#EBF3FC","#185FA5")}>{module.category}</span>
                  <span style={badge("#f0faf5","#3B6D11")}>{module.spotlight?.type}</span>
                  <div style={{fontSize:17,fontWeight:600,color:"#1a2332",marginBottom:5,lineHeight:1.3}}>{module.spotlight?.title}</div>
                  {module.spotlight?.author&&<p style={{fontSize:12,color:"#b0bec8",margin:"0 0 10px",fontFamily:"'DM Mono',monospace"}}>by {module.spotlight.author}</p>}
                  <p style={{fontSize:13,lineHeight:1.75,color:"#4a6a8a",margin:0}}>{module.spotlight?.tagline}</p>
                </div>
              </div>
            </div>

            {/* Concept diagram */}
            {module.diagram&&<ConceptDiagram diagram={module.diagram}/>}

            {/* Key lessons with pull quotes */}
            <div style={card}>
              <span style={lbl}>Key lessons</span>
              {module.lessons?.map((l,i)=>(
                <div key={i} style={{marginBottom:i<module.lessons.length-1?20:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:6}}>{l.heading}</div>
                  <p style={{fontSize:13,lineHeight:1.75,color:"#4a6a8a",margin:0}}>{l.body}</p>
                  {i===1&&<PullQuote text={l.body}/>}
                  {i===3&&<PullQuote text={l.body}/>}
                </div>
              ))}
            </div>

            {/* Deep dive */}
            <div style={card}>
              <span style={lbl}>Deep dive</span>
              <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:6}}>{module.deepdive?.heading}</div>
              <p style={{fontSize:13,lineHeight:1.75,color:"#4a6a8a",margin:0}}>{module.deepdive?.body}</p>
            </div>

            {/* Action item */}
            <div style={{...card,borderColor:showAction?"#c5ddf5":"#e2e6ea"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showAction?12:0}}>
                <span style={lbl}>Action item (optional)</span>
                <button onClick={()=>setShowAction(!showAction)} style={{padding:"5px 11px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontSize:12}}>{showAction?"Hide":"Show"}</button>
              </div>
              {showAction&&<>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:6}}>{module.action_item?.heading}</div>
                <p style={{fontSize:13,lineHeight:1.75,color:"#4a6a8a",margin:0}}>{module.action_item?.body}</p>
              </>}
            </div>

            <div style={{textAlign:"right",marginTop:4}}>
              <button onClick={forceRegen} style={{padding:"6px 13px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#6a8aaa",cursor:"pointer",fontSize:12}}>Regenerate today</button>
            </div>
          </>}
        </>}

        {view==="History"&&(
          <div style={card}>
            <span style={lbl}>Modules read</span>
            {history.length===0&&<p style={{fontSize:13,color:"#b0bec8"}}>No history yet.</p>}
            {history.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i===history.length-1?"none":"0.5px solid #f0f2f5"}}>
                <div>
                  <div style={{fontWeight:500,fontSize:13,color:"#1a2332"}}>{h.title}</div>
                  <div style={{fontSize:11,color:"#b0bec8",marginTop:2,fontFamily:"'DM Mono',monospace"}}>{h.category}</div>
                </div>
                <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{h.date?.replace("learning:","")}</div>
              </div>
            ))}
          </div>
        )}

        {view==="Request a topic"&&<>
          <div style={card}>
            <span style={lbl}>Request tomorrow's topic</span>
            <p style={{fontSize:13,color:"#4a6a8a",marginBottom:14,lineHeight:1.6}}>Enter a book title, author, concept, or any topic. Your request will be used to generate the next module.</p>
            <textarea style={{width:"100%",padding:"9px 11px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",fontSize:13,resize:"vertical",minHeight:80,marginBottom:10,fontFamily:"var(--font-sans)"} as React.CSSProperties}
              placeholder="e.g. The 48 Laws of Power by Robert Greene, or a deep dive on pricing strategy for B2B..."
              value={request} onChange={e=>setRequest(e.target.value)}/>
            <button onClick={saveRequest} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Save request</button>
            {requestSaved&&<p style={{fontSize:12,color:"#3B6D11",marginTop:7}}>Request saved for next module.</p>}
          </div>
          {pendingRequest&&(
            <div style={{...card,borderColor:"#c5ddf5"}}>
              <span style={lbl}>Pending request</span>
              <p style={{fontSize:13,color:"#1a2332"}}>"{pendingRequest}"</p>
            </div>
          )}
        </>}

      </div>
    </div>
  );
}
