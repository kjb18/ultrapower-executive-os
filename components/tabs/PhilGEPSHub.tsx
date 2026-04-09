"use client";
import { useState, useEffect } from "react";

interface SavedBid { id: string; title: string; entity: string; amount: string; deadline: string; url: string; notes: string; savedAt: string; }
const STORAGE_KEY = "philgeps-saved-bids";

export default function PhilGEPSHub() {
  const [view, setView] = useState<"browse"|"saved">("browse");
  const [saved, setSaved] = useState<SavedBid[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({title:"",entity:"",amount:"",deadline:"",url:"",notes:""});
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    try { const s=localStorage.getItem(STORAGE_KEY); if(s) setSaved(JSON.parse(s)); } catch {}
  }, []);

  const saveBids = (bids: SavedBid[]) => {
    setSaved(bids);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bids)); } catch {}
  };

  const addBid = () => {
    if (!form.title.trim()) return;
    const bid: SavedBid = { ...form, id: Date.now().toString(), savedAt: new Date().toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"}) };
    saveBids([bid,...saved]);
    setForm({title:"",entity:"",amount:"",deadline:"",url:"",notes:""});
    setShowAdd(false);
  };

  const removeBid = (id:string) => saveBids(saved.filter(b=>b.id!==id));

  const INP:React.CSSProperties = {fontSize:14,padding:"8px 10px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"};
  const tabBtn=(a:boolean):React.CSSProperties=>({padding:"8px 18px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400});

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,height:56}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>PhilGEPS Hub</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Philippine Government Electronic Procurement System</div>
        </div>
        <div style={{display:"flex"}}>
          <button style={tabBtn(view==="browse")} onClick={()=>setView("browse")}>Browse Live</button>
          <button style={tabBtn(view==="saved")} onClick={()=>setView("saved")}>
            Saved Bids
            {saved.length>0&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",marginLeft:6}}>{saved.length}</span>}
          </button>
        </div>
      </div>

      {view==="browse"&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"10px 20px",background:"#f8f9fb",borderBottom:"0.5px solid #e2e6ea",fontSize:13,color:"#4a6a8a",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <span>🔍</span>
            <span>Search for bids below. Found a relevant bid? Switch to <strong>Saved Bids</strong> and add it manually.</span>
            <a href="https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpenOpportunitiesUI.aspx?ClickFrom=OpenOpp&menuIndex=3"
              target="_blank" rel="noopener noreferrer"
              style={{marginLeft:"auto",fontSize:12,color:"#185FA5",textDecoration:"none",padding:"5px 12px",borderRadius:7,border:"0.5px solid #185FA5",background:"#EBF3FC",fontWeight:500,whiteSpace:"nowrap"}}>
              Open in new tab ↗
            </a>
          </div>
          <div style={{flex:1,position:"relative"}}>
            {!iframeLoaded&&(
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f2f5",zIndex:1,flexDirection:"column",gap:10}}>
                <div style={{fontSize:28}}>🏛️</div>
                <div style={{fontSize:13,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Loading PhilGEPS...</div>
              </div>
            )}
            <iframe
              src="https://notices.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpenOpportunitiesUI.aspx?ClickFrom=OpenOpp&menuIndex=3"
              style={{width:"100%",height:"100%",border:"none"}}
              onLoad={()=>setIframeLoaded(true)}
              title="PhilGEPS Open Opportunities"
            />
          </div>
        </div>
      )}

      {view==="saved"&&(
        <div style={{flex:1,overflow:"auto",padding:16}}>
          <div style={{maxWidth:800,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Saved Bids</span>
                <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{saved.length}</span>
              </div>
              <button onClick={()=>setShowAdd(!showAdd)} style={{fontSize:13,padding:"8px 14px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600}}>
                {showAdd?"Cancel":"+ Add Bid"}
              </button>
            </div>

            {showAdd&&(
              <div style={{background:"#fff",border:"0.5px solid #c5ddf5",borderRadius:13,padding:"18px 20px",marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:14,fontFamily:"'DM Mono',monospace"}}>Add Saved Bid</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10,marginBottom:12}}>
                  {([["Bid Title *","title","text","e.g. Supply of LED Fixtures"],["Procuring Entity","entity","text","e.g. EDC"],["Amount (ABC)","amount","text","e.g. ₱2,450,000"],["Deadline","deadline","date",""],["PhilGEPS URL","url","url","https://..."],["Notes","notes","text","Optional notes"]] as [string,string,string,string][]).map(([lbl,k,t,ph])=>(
                    <div key={k}>
                      <div style={{fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                      <input style={INP} type={t} placeholder={ph} value={(form as Record<string,string>)[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
                    </div>
                  ))}
                </div>
                <button onClick={addBid} style={{fontSize:13,padding:"9px 18px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Bid</button>
              </div>
            )}

            {saved.length===0&&!showAdd&&(
              <div style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"40px 24px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:10}}>🏛️</div>
                <div style={{fontSize:15,fontWeight:600,color:"#1a2332",marginBottom:6}}>No saved bids yet</div>
                <div style={{fontSize:13,color:"#8a9ab0",lineHeight:1.6}}>Browse PhilGEPS in the Live tab, then add bids here to track them.</div>
              </div>
            )}

            {saved.map((bid,i)=>(
              <div key={bid.id} style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"16px 18px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,color:"#1a2332",marginBottom:5,lineHeight:1.4}}>{bid.title}</div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:12,color:"#4a6a8a",marginBottom:bid.notes?8:0}}>
                      {bid.entity&&<span>🏢 {bid.entity}</span>}
                      {bid.amount&&<span style={{color:"#3B6D11",fontWeight:500}}>₱ {bid.amount.replace("₱","")}</span>}
                      {bid.deadline&&<span style={{color:"#854F0B"}}>📅 {bid.deadline}</span>}
                      <span style={{color:"#b0bec8",fontFamily:"'DM Mono',monospace",fontSize:11}}>Saved {bid.savedAt}</span>
                    </div>
                    {bid.notes&&<div style={{fontSize:13,color:"#8a9ab0",lineHeight:1.5}}>{bid.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    {bid.url&&<a href={bid.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,padding:"6px 12px",borderRadius:7,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",textDecoration:"none",fontWeight:500}}>View ↗</a>}
                    <button onClick={()=>removeBid(bid.id)} style={{fontSize:12,padding:"6px 10px",borderRadius:7,border:"0.5px solid #f5c6c6",background:"#FEF0F0",color:"#A32D2D",cursor:"pointer"}}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
