"use client";
import { useState, useEffect } from "react";
import { TB_COLORS } from "@/lib/constants";

interface CUTask { id:string; name:string; status:string; statusColor:string; dueDate:number; dueDateStr:string; priority:string; listName:string; url:string; spaceName:string; }
interface TimeBlock { id:number; time:string; label:string; sub:string; type:string; }

const PRIORITY_C: Record<string,{bg:string;fg:string}> = {
  urgent:{bg:"#FEF0F0",fg:"#A32D2D"}, high:{bg:"#FFF8EC",fg:"#854F0B"},
  normal:{bg:"#EBF3FC",fg:"#185FA5"}, low:{bg:"#f0f2f5",fg:"#b0bec8"},
};
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HOURS = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];

export default function Calendar({ timeBlocks }: { timeBlocks: TimeBlock[] }) {
  const today = new Date();
  const [view, setView] = useState<"month"|"week">("month");
  const [curYear, setCurYear] = useState(today.getFullYear());
  const [curMonth, setCurMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => { const d=new Date(today); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d; });
  const [tasks, setTasks] = useState<CUTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [noToken, setNoToken] = useState(false);
  const [selected, setSelected] = useState<CUTask|null>(null);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clickup");
      const data = await res.json();
      if (data.error?.includes("not set")) { setNoToken(true); }
      else { setTasks(data.tasks||[]); }
    } catch {}
    setLoading(false);
  };

  const todayStr = today.toISOString().split("T")[0];
  const tasksOn = (d:string) => tasks.filter(t=>t.dueDateStr===d);

  const prevMonth=()=>{ if(curMonth===0){setCurYear(y=>y-1);setCurMonth(11);}else setCurMonth(m=>m-1); };
  const nextMonth=()=>{ if(curMonth===11){setCurYear(y=>y+1);setCurMonth(0);}else setCurMonth(m=>m+1); };
  const prevWeek=()=>setWeekStart(d=>{const n=new Date(d);n.setDate(n.getDate()-7);return n;});
  const nextWeek=()=>setWeekStart(d=>{const n=new Date(d);n.setDate(n.getDate()+7);return n;});
  const goToday=()=>{ setCurYear(today.getFullYear()); setCurMonth(today.getMonth()); const d=new Date(today); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); setWeekStart(d); };

  const viewBtn=(a:boolean):React.CSSProperties=>({padding:"5px 13px",borderRadius:20,border:`0.5px solid ${a?"#185FA5":"#e2e6ea"}`,background:a?"#EBF3FC":"#fff",color:a?"#185FA5":"#8a9ab0",cursor:"pointer",fontSize:12,fontWeight:a?600:400,fontFamily:"'DM Mono',monospace"});
  const panel:React.CSSProperties={background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,overflow:"hidden"};

  const TaskPill=({task}:{task:CUTask})=>{
    const pc=PRIORITY_C[task.priority]||PRIORITY_C.normal;
    return <div onClick={e=>{e.stopPropagation();setSelected(task);}} title={task.name}
      style={{fontSize:10,padding:"2px 5px",borderRadius:3,background:pc.bg,color:pc.fg,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:2,borderLeft:`2px solid ${pc.fg}`,lineHeight:1.4}}>
      {task.name}
    </div>;
  };

  // Month view
  const renderMonth=()=>{
    const dim = new Date(curYear,curMonth+1,0).getDate();
    const first = new Date(curYear,curMonth,1).getDay();
    const cells:(number|null)[] = [];
    for(let i=0;i<first;i++) cells.push(null);
    for(let i=1;i<=dim;i++) cells.push(i);
    while(cells.length%7!==0) cells.push(null);

    return (
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"0.5px solid #f0f2f5"}}>
          {DAYS.map(d=><div key={d} style={{padding:"8px",fontSize:11,fontWeight:600,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"center",fontFamily:"'DM Mono',monospace"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {cells.map((day,i)=>{
            const ds=day?`${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";
            const dt=day?tasksOn(ds):[];
            const isToday=ds===todayStr;
            return (
              <div key={i} style={{minHeight:90,padding:"6px",borderRight:"0.5px solid #f0f2f5",borderBottom:"0.5px solid #f0f2f5",background:isToday?"#F0F6FF":!day?"#fafbfc":"#fff"}}>
                {day&&<>
                  <div style={{fontSize:12,fontWeight:isToday?700:400,width:22,height:22,borderRadius:"50%",background:isToday?"#185FA5":"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:isToday?"#fff":"#3a4a5a",marginBottom:3}}>{day}</div>
                  {dt.slice(0,3).map(t=><TaskPill key={t.id} task={t}/>)}
                  {dt.length>3&&<div style={{fontSize:10,color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>+{dt.length-3} more</div>}
                </>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Week view
  const renderWeek=()=>{
    const weekDays=Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d; });
    const nowHour=`${String(today.getHours()).padStart(2,"0")}:00`;

    return (
      <div style={{overflowX:"auto"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"64px repeat(7,1fr)",borderBottom:"0.5px solid #f0f2f5",minWidth:640,position:"sticky",top:0,background:"#fff",zIndex:2}}>
          <div style={{padding:"8px"}}/>
          {weekDays.map((d,i)=>{
            const ds=d.toISOString().split("T")[0];
            const isToday=ds===todayStr;
            const dt=tasksOn(ds);
            return (
              <div key={i} style={{padding:"8px 6px",textAlign:"center",borderLeft:"0.5px solid #f0f2f5",background:isToday?"#F0F6FF":"#fff"}}>
                <div style={{fontSize:11,color:"#b0bec8",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'DM Mono',monospace"}}>{DAYS[d.getDay()]}</div>
                <div style={{fontSize:15,fontWeight:isToday?700:400,color:isToday?"#185FA5":"#1a2332",marginTop:2}}>{d.getDate()}</div>
                {dt.length>0&&<div style={{fontSize:10,padding:"1px 5px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace",marginTop:3,display:"inline-block"}}>{dt.length} task{dt.length>1?"s":""}</div>}
              </div>
            );
          })}
        </div>
        {/* Hour rows */}
        <div style={{minWidth:640}}>
          {HOURS.map(hour=>{
            const hourNum=parseInt(hour.split(":")[0]);
            const matchingBlock=timeBlocks.find(tb=>parseInt(tb.time.split(":")[0])===hourNum);
            const isCurrentHour=`${String(today.getHours()).padStart(2,"0")}:00`===hour;
            return (
              <div key={hour} style={{display:"grid",gridTemplateColumns:"64px repeat(7,1fr)",borderBottom:"0.5px solid #f0f2f5",minHeight:52}}>
                <div style={{padding:"6px 8px",fontSize:11,color:"#b0bec8",fontFamily:"'DM Mono',monospace",paddingTop:8,flexShrink:0}}>{hour}</div>
                {weekDays.map((d,i)=>{
                  const ds=d.toISOString().split("T")[0];
                  const isToday=ds===todayStr;
                  const dt=tasksOn(ds);
                  return (
                    <div key={i} style={{borderLeft:"0.5px solid #f0f2f5",padding:"4px 5px",minHeight:52,background:isToday&&isCurrentHour?"#F0F6FF":isToday?"#fafeff":"#fff",position:"relative"}}>
                      {matchingBlock&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:TB_COLORS[matchingBlock.type]||"#b0bec8"}}/>}
                      {/* Show tasks on this day at 08:00 row */}
                      {hour==="08:00"&&dt.map(t=><TaskPill key={t.id} task={t}/>)}
                      {isToday&&isCurrentHour&&<div style={{position:"absolute",left:4,right:0,top:"50%",height:"1.5px",background:"#185FA5",opacity:0.5}}/>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{gridColumn:"span 2"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.12em",textTransform:"uppercase",color:"#b0bec8",fontFamily:"'DM Mono',monospace"}}>ClickUp Calendar</div>
          {loading&&<span style={{width:11,height:11,border:"2px solid #e2e6ea",borderTopColor:"#185FA5",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>}
          {tasks.length>0&&!loading&&<span style={{fontSize:11,padding:"2px 9px",borderRadius:20,background:"#EBF3FC",color:"#185FA5",fontFamily:"'DM Mono',monospace"}}>{tasks.length} tasks</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <button onClick={goToday} style={{fontSize:11,padding:"4px 10px",borderRadius:20,border:"0.5px solid #e2e6ea",background:"#f8f9fb",color:"#4a6a8a",cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>Today</button>
          <button style={viewBtn(view==="month")} onClick={()=>setView("month")}>Month</button>
          <button style={viewBtn(view==="week")} onClick={()=>setView("week")}>Week</button>
        </div>
      </div>

      {noToken?(
        <div style={{background:"#fff",border:"0.5px solid #e2e6ea",borderRadius:13,padding:"22px 20px"}}>
          <div style={{fontSize:15,fontWeight:600,color:"#1a2332",marginBottom:7}}>ClickUp not connected</div>
          <div style={{fontSize:13,color:"#4a6a8a",lineHeight:1.65,marginBottom:12}}>Add your ClickUp API token to see tasks on the calendar.</div>
          <div style={{fontSize:12,padding:"12px 14px",borderRadius:9,background:"#f8f9fb",border:"0.5px solid #e2e6ea",fontFamily:"'DM Mono',monospace",color:"#4a6a8a",lineHeight:2}}>
            1. ClickUp → Settings → Apps → API Token → Copy<br/>
            2. Vercel → Settings → Environment Variables<br/>
            3. Add: <strong>CLICKUP_API_TOKEN</strong> = your token<br/>
            4. Redeploy
          </div>
          <button onClick={fetchTasks} style={{marginTop:12,fontSize:13,padding:"7px 14px",borderRadius:9,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",cursor:"pointer",fontWeight:600}}>Retry</button>
        </div>
      ):(
        <div style={panel}>
          {/* Nav bar */}
          <div style={{display:"flex",alignItems:"center",gap:9,padding:"12px 14px",borderBottom:"0.5px solid #f0f2f5"}}>
            <button onClick={view==="month"?prevMonth:prevWeek} style={{width:28,height:28,border:"0.5px solid #e2e6ea",borderRadius:7,background:"#f8f9fb",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#4a6a8a"}}>←</button>
            <div style={{fontSize:15,fontWeight:600,color:"#1a2332",minWidth:180}}>
              {view==="month"
                ?`${MONTHS[curMonth]} ${curYear}`
                :`${weekStart.toLocaleDateString("en-PH",{month:"short",day:"numeric"})} – ${new Date(weekStart.getTime()+6*86400000).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}`
              }
            </div>
            <button onClick={view==="month"?nextMonth:nextWeek} style={{width:28,height:28,border:"0.5px solid #e2e6ea",borderRadius:7,background:"#f8f9fb",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#4a6a8a"}}>→</button>
            <div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(PRIORITY_C).map(([p,c])=>(
                <span key={p} style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:c.bg,color:c.fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{p}</span>
              ))}
            </div>
          </div>
          {view==="month"?renderMonth():renderWeek()}
        </div>
      )}

      {/* Task detail modal */}
      {selected&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setSelected(null)}>
          <div style={{background:"#fff",borderRadius:13,padding:"22px 24px",maxWidth:420,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.12)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600,color:"#1a2332",lineHeight:1.4,marginBottom:7}}>{selected.name}</div>
                <span style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:(PRIORITY_C[selected.priority]||PRIORITY_C.normal).bg,color:(PRIORITY_C[selected.priority]||PRIORITY_C.normal).fg,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{selected.priority}</span>
              </div>
              <button onClick={()=>setSelected(null)} style={{fontSize:17,color:"#b0bec8",background:"none",border:"none",cursor:"pointer",marginLeft:10}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13,color:"#4a6a8a"}}>
              {[["LIST",selected.listName],["SPACE",selected.spaceName],["DUE",new Date(selected.dueDate).toLocaleDateString("en-PH",{weekday:"short",year:"numeric",month:"short",day:"numeric"})],["STATUS",selected.status]].map(([lbl,val])=>(
                <div key={lbl} style={{display:"flex",gap:10}}>
                  <span style={{color:"#b0bec8",minWidth:60,fontFamily:"'DM Mono',monospace",fontSize:10}}>{lbl}</span>
                  <span style={{fontWeight:lbl==="DUE"?500:400,color:lbl==="DUE"&&new Date(selected.dueDate)<new Date()?"#A32D2D":"#1a2332"}}>{val}</span>
                </div>
              ))}
            </div>
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
              style={{display:"block",marginTop:16,padding:"10px 16px",borderRadius:9,border:"0.5px solid #185FA5",background:"#EBF3FC",color:"#185FA5",fontSize:13,fontWeight:600,textAlign:"center",textDecoration:"none"}}>
              Open in ClickUp →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
