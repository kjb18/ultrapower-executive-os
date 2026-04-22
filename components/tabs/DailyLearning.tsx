"use client";
import { useState, useEffect, useRef } from "react";
import { kvGet, kvSet, kvDel } from "@/lib/kv";

function getTodayKey() {
  const now = new Date();
  const ph = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  if (ph.getHours() < 3) ph.setDate(ph.getDate() - 1);
  return `learning:${ph.getFullYear()}-${String(ph.getMonth()+1).padStart(2,"0")}-${String(ph.getDate()).padStart(2,"0")}`;
}

function formatDate() {
  return new Date().toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}

interface Concept { title: string; description: string; }
interface Module {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  bookTitle: string;
  bookAuthor: string;
  bookIsbn?: string;
  conceptType: string;
  concepts: Concept[];
  pullQuote: string;
  pullQuoteAuthor: string;
  keyTakeaway: string;
  applicationForKhalil: string;
  dateLabel?: string;
}
interface HistItem { spotlight_id: string; category: string; date: string; title: string; }

function BookCover({ title, author }: { title: string; author: string }) {
  const [imgUrl, setImgUrl] = useState<string|null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const colors = ["#185FA5","#3B6D11","#534AB7","#854F0B","#A32D2D"];
  const color = colors[(title.charCodeAt(0)||0)%colors.length];

  useEffect(() => {
    if (!title) return;
    const query = encodeURIComponent(`${title} ${author}`);
    fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`)
      .then(r=>r.json())
      .then(data=>{
        const coverId = data.docs?.[0]?.cover_i;
        if (coverId) setImgUrl(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`);
        else setImgFailed(true);
      })
      .catch(()=>setImgFailed(true));
  }, [title, author]);

  if (imgFailed || !imgUrl) {
    return (
      <div style={{width:90,height:126,borderRadius:7,background:color,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 8px",textAlign:"center",flexShrink:0}}>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5}}>Book</div>
        <div style={{fontSize:10,fontWeight:700,color:"#fff",lineHeight:1.3}}>{(title||"").slice(0,28)}</div>
        {author&&<div style={{fontSize:9,color:"rgba(255,255,255,0.7)",marginTop:5,lineHeight:1.3}}>{author}</div>}
      </div>
    );
  }

  return <img src={imgUrl} alt={title} onError={()=>setImgFailed(true)}
    style={{width:90,height:126,objectFit:"cover",borderRadius:7,flexShrink:0}}/>;
}

function ConceptCards({ concepts, type }: { concepts: Concept[]; type: string }) {
  if (!concepts?.length) return null;
  const colors = ["#EBF3FC","#f0faf5","#FFF8EC","#F4F3FE","#FEF0F0"];
  const texts = ["#185FA5","#3B6D11","#854F0B","#534AB7","#A32D2D"];

  if (type === "steps") {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
        {concepts.map((c,i)=>(
          <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:26,height:26,borderRadius:"50%",background:"#185FA5",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,marginTop:2}}>{i+1}</div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"#1a2332",marginBottom:3}}>{c.title}</div>
              <div style={{fontSize:12,color:"#4a6a8a",lineHeight:1.6}}>{c.description}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "pyramid") {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,marginBottom:14}}>
        {concepts.map((c,i)=>(
          <div key={i} style={{background:colors[i%colors.length],color:texts[i%texts.length],borderRadius:7,padding:"8px 14px",fontSize:12,fontWeight:600,textAlign:"center",width:`${50+i*12}%`,maxWidth:320}}>
            {c.title}
          </div>
        ))}
      </div>
    );
  }

  // Default: cards grid
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:14}}>
      {concepts.map((c,i)=>(
        <div key={i} style={{background:colors[i%colors.length],borderRadius:9,padding:"11px 12px"}}>
          <div style={{fontSize:12,fontWeight:600,color:texts[i%texts.length],marginBottom:4}}>{c.title}</div>
          <div style={{fontSize:11,color:texts[i%texts.length],opacity:0.8,lineHeight:1.5}}>{c.description}</div>
        </div>
      ))}
    </div>
  );
}

export default function DailyLearning() {
  const [view, setView] = useState("Today's module");
  const [module, setModule] = useState<Module|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [history, setHistory] = useState<HistItem[]>([]);
  const [request, setRequest] = useState("");
  const [pendingRequest, setPendingRequest] = useState("");
  const [requestSaved, setRequestSaved] = useState(false);
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
    const usedIds = hist.map(h=>h.spotlight_id).filter(Boolean);
    try {
      const res = await fetch("/api/learning", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({usedIds, topicRequest: pendReq||undefined}),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`Error: ${data.error||res.status}`);
        setLoading(false);
        return;
      }
      // data IS the module -- no nested .module property
      const parsed: Module = data;
      parsed.dateLabel = formatDate();
      await kvSet(getTodayKey(), parsed);
      const newHist = [{spotlight_id:parsed.id, category:parsed.category, date:getTodayKey(), title:parsed.title}, ...hist].slice(0,60);
      await kvSet("learning:history", newHist);
      setHistory(newHist);
      if (pendReq) { await kvDel("learning:request"); setPendingRequest(""); }
      setModule(parsed);
    } catch(e) {
      setError(`Network error: ${String(e)}`);
    }
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

            {/* Header card -- book + title */}
            <div style={card}>
              <div style={{display:"flex",gap:18,alignItems:"flex-start"}}>
                <BookCover title={module.bookTitle||module.title} author={module.bookAuthor}/>
                <div style={{flex:1}}>
                  <span style={badge("#EBF3FC","#185FA5")}>{module.category}</span>
                  <div style={{fontSize:18,fontWeight:600,color:"#1a2332",marginBottom:5,lineHeight:1.3}}>{module.title}</div>
                  {module.bookAuthor&&<p style={{fontSize:12,color:"#b0bec8",margin:"0 0 8px",fontFamily:"'DM Mono',monospace"}}>Source: {module.bookTitle}{module.bookAuthor?` · ${module.bookAuthor}`:""}</p>}
                  <p style={{fontSize:13,lineHeight:1.7,color:"#4a6a8a",margin:0}}>{module.subtitle}</p>
                </div>
              </div>
            </div>

            {/* Pull quote */}
            {module.pullQuote&&(
              <div style={{borderLeft:"3px solid #185FA5",padding:"12px 16px",margin:"4px 0 12px",background:"#EBF3FC",borderRadius:"0 9px 9px 0"}}>
                <div style={{fontSize:15,fontStyle:"italic",color:"#185FA5",lineHeight:1.7,fontFamily:"Georgia,serif"}}>"{module.pullQuote}"</div>
                {module.pullQuoteAuthor&&<div style={{fontSize:12,color:"#185FA5",marginTop:6,fontFamily:"'DM Mono',monospace",opacity:0.7}}>— {module.pullQuoteAuthor}</div>}
              </div>
            )}

            {/* Key concepts */}
            {module.concepts?.length>0&&(
              <div style={card}>
                <span style={lbl}>Key concepts</span>
                <ConceptCards concepts={module.concepts} type={module.conceptType}/>
              </div>
            )}

            {/* Key takeaway */}
            {module.keyTakeaway&&(
              <div style={card}>
                <span style={lbl}>Key takeaway</span>
                <p style={{fontSize:14,lineHeight:1.75,color:"#1a2332",margin:0,fontWeight:500}}>{module.keyTakeaway}</p>
              </div>
            )}

            {/* Application for Khalil */}
            {module.applicationForKhalil&&(
              <div style={{...card,borderColor:"#c5ddf5",background:"#f7fbff"}}>
                <span style={{...lbl,color:"#185FA5"}}>Application for Ultra Power</span>
                <p style={{fontSize:13,lineHeight:1.75,color:"#1a2332",margin:0}}>{module.applicationForKhalil}</p>
              </div>
            )}

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
            <textarea style={{width:"100%",padding:"9px 11px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",fontSize:13,resize:"vertical",minHeight:80,marginBottom:10} as React.CSSProperties}
              placeholder="e.g. The 48 Laws of Power by Robert Greene, or a deep dive on pricing strategy for B2B..."
              value={request} onChange={e=>setRequest(e.target.value)}/>
            <button onClick={saveRequest} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:500}}>Save request</button>
            {requestSaved&&<p style={{fontSize:12,color:"#3B6D11",marginTop:7}}>Saved. Will be used for the next module.</p>}
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
