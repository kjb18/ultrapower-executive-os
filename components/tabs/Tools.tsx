"use client";
import { useState } from "react";
import PhilGEPSHub from "./PhilGEPSHub";
import SourcingModule from "./SourcingModule";

interface Tool {
  id: string; name: string; description: string; category: string;
  icon: string; native?: boolean; src?: string; directLink?: string;
  color: { bg: string; fg: string };
}

const TOOLS: Tool[] = [
  { id:"sourcing", name:"Sourcing Module", description:"AI-powered supplier search with real-time pricing, stock, and delivery information for any item", category:"Procurement", icon:"🔍", native:true, color:{bg:"#f0faf5",fg:"#3B6D11"} },
  { id:"philgeps", name:"PhilGEPS Hub", description:"Live bid monitoring and opportunity tracking from the Philippine Government Electronic Procurement System", category:"Procurement", icon:"🏛️", native:true, color:{bg:"#EBF3FC",fg:"#185FA5"} },
  { id:"leadgen", name:"Lead Gen System", description:"Prospect tracking, scoring, and pipeline management for industrial sales", category:"Sales", icon:"🎯", src:"/tools/leadgen.html", color:{bg:"#f0faf5",fg:"#3B6D11"} },
  { id:"docmaker", name:"Document Maker", description:"Generate Quotations, Purchase Orders, Invoices, RFQ Responses, and Delivery Receipts", category:"Operations", icon:"📄", src:"/tools/docmaker.html", directLink:"/tools/docmaker.html", color:{bg:"#FFF8EC",fg:"#854F0B"} },
];

export default function Tools() {
  const [active, setActive] = useState<Tool|null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const open = (tool:Tool) => { setActive(tool); setIframeLoaded(false); };
  const close = () => { setActive(null); setIframeLoaded(false); };

  return (
    <div style={{flex:1,overflow:"auto"}}>
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 20px",display:"flex",alignItems:"center",height:56,position:"sticky",top:0,zIndex:5}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332"}}>Tools</div>
          <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Ultra Power tool suite · {TOOLS.length} tools</div>
        </div>
      </div>
      <div style={{padding:16}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
          {TOOLS.map(tool=>(
            <div key={tool.id} style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"18px 16px",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                <div style={{fontSize:32,lineHeight:1}}>{tool.icon}</div>
                <span style={{fontSize:10,padding:"2px 9px",borderRadius:20,background:tool.color.bg,color:tool.color.fg,fontWeight:600,fontFamily:"'DM Mono',monospace"}}>{tool.category}</span>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:"#1a2332",marginBottom:5}}>{tool.name}</div>
                <div style={{fontSize:13,color:"#4a6a8a",lineHeight:1.6}}>{tool.description}</div>
              </div>
              <button onClick={()=>open(tool)} style={{marginTop:"auto",width:"100%",padding:"9px",borderRadius:9,border:`0.5px solid ${tool.color.fg}`,background:tool.color.bg,color:tool.color.fg,cursor:"pointer",fontSize:13,fontWeight:600}}>
                Launch {tool.name.split(" ")[0]} →
              </button>
              {tool.directLink&&(
                <a href={tool.directLink} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",textAlign:"center",fontSize:11,color:"#b0bec8",marginTop:-4,textDecoration:"none",fontFamily:"'DM Mono',monospace"}}
                  onMouseEnter={e=>(e.currentTarget.style.color="#185FA5")}
                  onMouseLeave={e=>(e.currentTarget.style.color="#b0bec8")}>
                  ↗ Open as standalone tab
                </a>
              )}
            </div>
          ))}
        </div>
        <div style={{marginTop:14,padding:"12px 16px",borderRadius:10,background:"#f8f9fb",border:"0.5px dashed #d0d8e0",textAlign:"center"}}>
          <div style={{fontSize:12,color:"#b0bec8"}}>To add a new tool: upload HTML to <code style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#f0f2f5",padding:"1px 5px",borderRadius:4}}>public/tools/</code> and register in <code style={{fontFamily:"'DM Mono',monospace",fontSize:11,background:"#f0f2f5",padding:"1px 5px",borderRadius:4}}>Tools.tsx</code></div>
        </div>
      </div>

      {active&&(
        <div style={{position:"fixed",inset:0,background:"#fff",zIndex:50,display:"flex",flexDirection:"column"}}>
          <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 20px",display:"flex",alignItems:"center",gap:12,height:56,flexShrink:0}}>
            <span style={{fontSize:20}}>{active.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>{active.name}</div>
              <div style={{fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>{active.category}</div>
            </div>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:active.color.bg,color:active.color.fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{active.category}</span>
              <button onClick={close} style={{padding:"6px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontSize:13,fontWeight:500}}>✕ Close</button>
            </div>
          </div>
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            {active.native&&active.id==="philgeps" ? <PhilGEPSHub/> :
             active.native&&active.id==="sourcing" ? <SourcingModule/> : (
              <div style={{flex:1,position:"relative"}}>
                {!iframeLoaded&&(
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#f0f2f5",zIndex:1,flexDirection:"column",gap:10}}>
                    <div style={{fontSize:32}}>{active.icon}</div>
                    <div style={{fontSize:13,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Loading {active.name}...</div>
                  </div>
                )}
                <iframe src={active.src} style={{width:"100%",height:"100%",border:"none"}} onLoad={()=>setIframeLoaded(true)} title={active.name}/>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
