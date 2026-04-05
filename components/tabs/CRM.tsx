"use client";
import { useState, useEffect, useCallback } from "react";
import { kvGet, kvSet } from "@/lib/kv";

const STAGES = ["Prospecting","Qualified","Proposal","Follow-Up","Negotiation","Closed-Won","Closed-Lost"];
const LABELS = ["Unlabeled","To Reactivate","Key Account","Refer to Alex","Dead Lead","Watch List","Needs Follow-Up"];
const SECTORS = ["Power Generation","Oil & Gas","Manufacturing","Mining","Government / B2G","Food & Beverage","Other"];
const SOURCES = ["Referral","LinkedIn","PhilGEPS","Cold Outreach","Inbound","Event","Other"];
const PAGE_SIZE = 50;

const STAGE_C: Record<string,{bg:string;fg:string}> = {
  "Prospecting":{bg:"#EBF3FC",fg:"#185FA5"},"Qualified":{bg:"#f0faf5",fg:"#3B6D11"},
  "Proposal":{bg:"#FFF8EC",fg:"#854F0B"},"Follow-Up":{bg:"#F4F3FE",fg:"#534AB7"},
  "Negotiation":{bg:"#FEF0F0",fg:"#A32D2D"},"Closed-Won":{bg:"#f0faf5",fg:"#3B6D11"},
  "Closed-Lost":{bg:"#FEF0F0",fg:"#A32D2D"},
};
const LABEL_C: Record<string,{bg:string;fg:string}> = {
  "Unlabeled":{bg:"#f0f2f5",fg:"#b0bec8"},"To Reactivate":{bg:"#FFF8EC",fg:"#854F0B"},
  "Key Account":{bg:"#f0faf5",fg:"#3B6D11"},"Refer to Alex":{bg:"#EBF3FC",fg:"#185FA5"},
  "Dead Lead":{bg:"#FEF0F0",fg:"#A32D2D"},"Watch List":{bg:"#F4F3FE",fg:"#534AB7"},
  "Needs Follow-Up":{bg:"#FEF3FF",fg:"#7B1FA2"},
};

interface Prospect { id:number;company:string;contact:string;stage:string;lastAction:string;nextStep:string;nextUpdate:string;notes:string; }
interface Contact { id:number;name:string;company:string;email:string;sector:string;source:string;notes:string;date:string; }
interface OldRow { [key:string]:string; }
interface CRMData { prospects:Prospect[];contacts:Contact[];nid:number; }

const Pill=({t,c}:{t:string;c:{bg:string;fg:string}})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:c.bg,color:c.fg,fontWeight:600,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{t}</span>;

export default function CRM() {
  const [tab,setTab]=useState<"pipeline"|"contacts"|"old">("pipeline");
  const [data,setDataRaw]=useState<CRMData>({prospects:[],contacts:[],nid:1});
  const [old,setOld]=useState<OldRow[]>([]);
  const [oldF,setOldF]=useState<OldRow[]>([]);
  const [oldQ,setOldQ]=useState("");
  const [oldPg,setOldPg]=useState(1);
  const [oldLbls,setOldLbls]=useState<Record<number,string>>({});
  const [nc,setNC]=useState({name:"",company:"",email:"",sector:"",source:"",notes:""});
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{(async()=>{const d=await kvGet<CRMData>("crm");if(d)setDataRaw(d);setLoaded(true);})();},[]);

  const setData=useCallback((p:Partial<CRMData>)=>{
    setDataRaw(prev=>{const next={...prev,...p};kvSet("crm",next);return next;});
  },[]);

  const addProspect=()=>{const id=data.nid;setData({prospects:[...data.prospects,{id,company:"New Prospect",contact:"",stage:"Prospecting",lastAction:"",nextStep:"",nextUpdate:"",notes:""}],nid:id+1});};
  const updP=(id:number,p:Partial<Prospect>)=>setData({prospects:data.prospects.map(x=>x.id===id?{...x,...p}:x)});
  const delP=(id:number)=>setData({prospects:data.prospects.filter(x=>x.id!==id)});
  const addContact=()=>{
    if(!nc.name.trim()&&!nc.company.trim())return;
    const id=data.nid;
    setData({contacts:[...data.contacts,{...nc,id,date:new Date().toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"})}],nid:id+1});
    setNC({name:"",company:"",email:"",sector:"",source:"",notes:""});
  };
  const delC=(id:number)=>setData({contacts:data.contacts.filter(x=>x.id!==id)});

  const handleCSV=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target?.result as string;
      const lines=text.trim().split("\n");
      const hdrs=lines[0].split(",").map(h=>h.trim().replace(/^"|"$/g,""));
      const rows=lines.slice(1).map(line=>{
        const cols:string[]=[],s={v:"",q:false};
        for(const ch of line){if(ch==='"'){s.q=!s.q;}else if(ch===','&&!s.q){cols.push(s.v.trim());s.v="";}else s.v+=ch;}
        cols.push(s.v.trim());
        const obj:OldRow={};hdrs.forEach((h,i)=>{obj[h]=cols[i]||"";});return obj;
      });
      setOld(rows);setOldF(rows);setOldPg(1);
    };
    reader.readAsText(file);
  };

  const filterOld=(q:string)=>{
    setOldQ(q);
    const ql=q.toLowerCase();
    setOldF(old.filter(r=>(r.Name||"").toLowerCase().includes(ql)||(r.Company||"").toLowerCase().includes(ql)||(r.Email||"").toLowerCase().includes(ql)));
    setOldPg(1);
  };

  const S={
    panel:{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:12,overflow:"hidden"} as React.CSSProperties,
    th:{fontSize:9,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase" as const,color:"#b0bec8",padding:"8px 12px",textAlign:"left" as const,borderBottom:"0.5px solid #f0f2f5",background:"#fafbfc",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap" as const},
    td:{fontSize:11,color:"#3a4a5a",padding:"7px 12px",borderBottom:"0.5px solid #f0f2f5",verticalAlign:"middle" as const} as React.CSSProperties,
    inp:{fontSize:11,padding:"5px 8px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#1a2332",width:"100%"} as React.CSSProperties,
    tabBtn:(a:boolean)=>({padding:"8px 16px",border:"none",background:"none",cursor:"pointer",fontSize:12,color:a?"#185FA5":"#8a9ab0",borderBottom:`2px solid ${a?"#185FA5":"transparent"}`,fontWeight:a?600:400,whiteSpace:"nowrap" as const}) as React.CSSProperties,
  };

  const totPg=Math.max(1,Math.ceil(oldF.length/PAGE_SIZE));
  const slice=oldF.slice((oldPg-1)*PAGE_SIZE,oldPg*PAGE_SIZE);

  if(!loaded)return<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#b0bec8",fontSize:12,fontFamily:"'DM Mono',monospace"}}>Loading CRM...</div>;

  return(
    <div style={{flex:1,overflow:"auto"}}>
      <div style={{background:"#fff",borderBottom:"0.5px solid #e2e6ea",padding:"0 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:5,height:52,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:"#1a2332"}}>CRM</div>
          <div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>Industrial Sales Intelligence</div>
        </div>
        <div style={{display:"flex"}}>
          {(["pipeline","contacts","old"] as const).map(t=><button key={t} style={S.tabBtn(tab===t)} onClick={()=>setTab(t)}>{t==="pipeline"?"Pipeline":t==="contacts"?"New Contacts":"Old Contacts"}</button>)}
        </div>
      </div>

      <div style={{padding:14}}>

        {tab==="pipeline"&&<>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,fontWeight:600,color:"#1a2332"}}>Active Prospects</span>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{data.prospects.length}</span>
            </div>
            <button onClick={addProspect} style={{fontSize:11,padding:"6px 12px",borderRadius:8,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600}}>+ Add Prospect</button>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Company","Contact","Stage","Last Action","Next Step","Next Update","Notes",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.prospects.length===0&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"24px"}}>No prospects yet.</td></tr>}
                  {data.prospects.map((p,i)=>(
                    <tr key={p.id} style={{background:i%2===0?"#fff":"#fafbfc"}}>
                      <td style={{...S.td,color:"#b0bec8",fontSize:10}}>{i+1}</td>
                      <td style={S.td}><input style={S.inp} value={p.company} onChange={e=>updP(p.id,{company:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.contact} onChange={e=>updP(p.id,{contact:e.target.value})}/></td>
                      <td style={S.td}>
                        <select style={{...S.inp,background:STAGE_C[p.stage]?.bg||"#f8f9fb",color:STAGE_C[p.stage]?.fg||"#3a4a5a",fontWeight:600,fontSize:10}} value={p.stage} onChange={e=>updP(p.id,{stage:e.target.value})}>
                          {STAGES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><input style={S.inp} value={p.lastAction} onChange={e=>updP(p.id,{lastAction:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.nextStep} onChange={e=>updP(p.id,{nextStep:e.target.value})}/></td>
                      <td style={S.td}><input style={{...S.inp,width:120}} type="date" value={p.nextUpdate} onChange={e=>updP(p.id,{nextUpdate:e.target.value})}/></td>
                      <td style={S.td}><input style={S.inp} value={p.notes} onChange={e=>updP(p.id,{notes:e.target.value})}/></td>
                      <td style={S.td}><button onClick={()=>delP(p.id)} style={{fontSize:12,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {tab==="contacts"&&<>
          <div style={{...S.panel,padding:16,marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"#b0bec8",marginBottom:12,fontFamily:"'DM Mono',monospace"}}>Add New Contact</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
              {([["Name","name","text","Full name"],["Company","company","text","Company"],["Email","email","email","email@domain.com"]] as [string,string,string,string][]).map(([lbl,k,t,ph])=>(
                <div key={k}>
                  <div style={{fontSize:9,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>{lbl}</div>
                  <input style={S.inp} type={t} placeholder={ph} value={(nc as Record<string,string>)[k]} onChange={e=>setNC(n=>({...n,[k]:e.target.value}))}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:9,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Sector</div>
                <select style={S.inp} value={nc.sector} onChange={e=>setNC(n=>({...n,sector:e.target.value}))}>
                  <option value="">-- Select --</option>{SECTORS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Source</div>
                <select style={S.inp} value={nc.source} onChange={e=>setNC(n=>({...n,source:e.target.value}))}>
                  <option value="">-- Select --</option>{SOURCES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4,fontFamily:"'DM Mono',monospace"}}>Notes</div>
                <input style={S.inp} placeholder="Optional" value={nc.notes} onChange={e=>setNC(n=>({...n,notes:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addContact} style={{fontSize:11,padding:"7px 14px",borderRadius:8,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>Save Contact</button>
              <button onClick={()=>setNC({name:"",company:"",email:"",sector:"",source:"",notes:""})} style={{fontSize:11,padding:"7px 14px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer"}}>Clear</button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:11,fontWeight:600,color:"#1a2332"}}>Contact Log</span>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{data.contacts.length}</span>
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Name","Company","Email","Sector","Source","Notes","Date",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.contacts.length===0&&<tr><td colSpan={9} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"24px"}}>No contacts yet.</td></tr>}
                  {data.contacts.map((c,i)=>(
                    <tr key={c.id}>
                      <td style={{...S.td,color:"#b0bec8",fontSize:10}}>{i+1}</td>
                      <td style={{...S.td,fontWeight:500}}>{c.name||"—"}</td>
                      <td style={S.td}>{c.company||"—"}</td>
                      <td style={{...S.td,color:"#185FA5"}}>{c.email||"—"}</td>
                      <td style={S.td}>{c.sector?<Pill t={c.sector} c={{bg:"#f0faf5",fg:"#3B6D11"}}/>:"—"}</td>
                      <td style={S.td}>{c.source||"—"}</td>
                      <td style={{...S.td,color:"#8a9ab0"}}>{c.notes||"—"}</td>
                      <td style={{...S.td,color:"#b0bec8",fontFamily:"'DM Mono',monospace",fontSize:10,whiteSpace:"nowrap"}}>{c.date}</td>
                      <td style={S.td}><button onClick={()=>delC(c.id)} style={{fontSize:12,color:"#d0d8e0",background:"none",border:"none",cursor:"pointer"}}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {tab==="old"&&<>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <label style={{fontSize:11,padding:"6px 12px",borderRadius:8,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontWeight:500}}>
              Upload CSV<input type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV}/>
            </label>
            <input style={{...S.inp,width:240,flex:"none"}} placeholder="Search name, company, email..." value={oldQ} onChange={e=>filterOld(e.target.value)}/>
            {old.length>0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{oldF.length} records</span>}
          </div>
          <div style={S.panel}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr>{["#","Name","Email","Company","Type","Priority","Status","Account","First Contact","Last Contact","Emails","Unanswered","Cold","Label"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {slice.length===0&&<tr><td colSpan={14} style={{...S.td,textAlign:"center",color:"#b0bec8",padding:"24px"}}>{old.length===0?"Upload a CSV to view old contacts.":"No records found."}</td></tr>}
                  {slice.map((r,i)=>{
                    const ai=(oldPg-1)*PAGE_SIZE+i;
                    const lbl=oldLbls[ai]||"Unlabeled";
                    const lc=LABEL_C[lbl]||LABEL_C["Unlabeled"];
                    return(
                      <tr key={ai}>
                        <td style={{...S.td,color:"#b0bec8",fontSize:10}}>{ai+1}</td>
                        <td style={{...S.td,fontWeight:500,whiteSpace:"nowrap"}}>{r.Name||"—"}</td>
                        <td style={{...S.td,color:"#185FA5",fontSize:10}}>{r.Email||"—"}</td>
                        <td style={S.td}>{r.Company||"—"}</td>
                        <td style={{...S.td,color:"#8a9ab0"}}>{r.Type||"—"}</td>
                        <td style={S.td}>{r.Priority?<Pill t={r.Priority} c={r.Priority==="A"?{bg:"#FFF8EC",fg:"#854F0B"}:r.Priority==="B"?{bg:"#EBF3FC",fg:"#185FA5"}:{bg:"#f0f2f5",fg:"#8a9ab0"}}/>:"—"}</td>
                        <td style={S.td}>{r.Status||"—"}</td>
                        <td style={{...S.td,color:"#8a9ab0"}}>{r.Account||"—"}</td>
                        <td style={{...S.td,color:"#b0bec8",fontSize:10,whiteSpace:"nowrap"}}>{r["First Contact"]||"—"}</td>
                        <td style={{...S.td,color:"#b0bec8",fontSize:10,whiteSpace:"nowrap"}}>{r["Last Contact"]||"—"}</td>
                        <td style={{...S.td,textAlign:"center"}}>{r["Total Emails"]||"—"}</td>
                        <td style={{...S.td,textAlign:"center"}}>{r.Unanswered||"—"}</td>
                        <td style={{...S.td,textAlign:"center"}}>{r.Cold||"—"}</td>
                        <td style={S.td}>
                          <select style={{fontSize:10,padding:"2px 7px",borderRadius:20,border:`0.5px solid ${lc.fg}44`,background:lc.bg,color:lc.fg,fontWeight:600,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}
                            value={lbl} onChange={e=>setOldLbls(p=>({...p,[ai]:e.target.value}))}>
                            {LABELS.map(l=><option key={l}>{l}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {oldF.length>PAGE_SIZE&&(
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderTop:"0.5px solid #f0f2f5"}}>
                <button onClick={()=>setOldPg(p=>Math.max(1,p-1))} disabled={oldPg<=1} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",cursor:"pointer",color:"#4a6a8a"}}>← Prev</button>
                <span style={{fontSize:11,color:"#8a9ab0",fontFamily:"'DM Mono',monospace"}}>Page {oldPg} of {totPg} · {oldF.length} records</span>
                <button onClick={()=>setOldPg(p=>Math.min(totPg,p+1))} disabled={oldPg>=totPg} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:"0.5px solid #e2e6ea",background:"#f8f9fb",cursor:"pointer",color:"#4a6a8a"}}>Next →</button>
              </div>
            )}
          </div>
        </>}

      </div>
    </div>
  );
}
