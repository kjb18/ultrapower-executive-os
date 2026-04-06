"use client";
import { useState, useEffect } from "react";
import { TB_COLORS } from "@/lib/constants";

interface CUTask {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number;
  dueDateStr: string;
  priority: string;
  listName: string;
  url: string;
  spaceName: string;
}

interface TimeBlock {
  id: number;
  time: string;
  label: string;
  sub: string;
  type: string;
}

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  urgent:  { bg:"#FEF0F0", fg:"#A32D2D" },
  high:    { bg:"#FFF8EC", fg:"#854F0B" },
  normal:  { bg:"#EBF3FC", fg:"#185FA5" },
  low:     { bg:"#f0f2f5", fg:"#b0bec8" },
};

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const HOURS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface CalendarProps {
  timeBlocks: TimeBlock[];
}

export default function Calendar({ timeBlocks }: CalendarProps) {
  const today = new Date();
  const [view, setView] = useState<"month"|"week">("month");
  const [curYear, setCurYear] = useState(today.getFullYear());
  const [curMonth, setCurMonth] = useState(today.getMonth());
  const [curWeekStart, setCurWeekStart] = useState(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });
  const [tasks, setTasks] = useState<CUTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CUTask|null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clickup");
      const data = await res.json();
      if (data.error && data.error.includes("not set")) {
        setError("no-token");
      } else {
        setTasks(data.tasks || []);
      }
    } catch {
      setError("Connection error.");
    }
    setLoading(false);
  };

  const tasksOnDate = (dateStr: string) =>
    tasks.filter(t => t.dueDateStr === dateStr);

  const todayStr = today.toISOString().split("T")[0];

  // Month nav
  const prevMonth = () => {
    if (curMonth === 0) { setCurYear(y => y-1); setCurMonth(11); }
    else setCurMonth(m => m-1);
  };
  const nextMonth = () => {
    if (curMonth === 11) { setCurYear(y => y+1); setCurMonth(0); }
    else setCurMonth(m => m+1);
  };

  // Week nav
  const prevWeek = () => setCurWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n; });
  const nextWeek = () => setCurWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n; });
  const goToday = () => {
    setCurYear(today.getFullYear());
    setCurMonth(today.getMonth());
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    setCurWeekStart(d);
  };

  const panel: React.CSSProperties = { background:"#fff", border:"0.5px solid #e2e6ea", borderRadius:12, overflow:"hidden" };
  const viewBtn = (a: boolean): React.CSSProperties => ({ padding:"4px 12px", borderRadius:20, border:`0.5px solid ${a?"#185FA5":"#e2e6ea"}`, background:a?"#EBF3FC":"#fff", color:a?"#185FA5":"#8a9ab0", cursor:"pointer", fontSize:11, fontWeight:a?600:400, fontFamily:"'DM Mono',monospace" });

  const TaskPill = ({ task }: { task: CUTask }) => {
    const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.normal;
    return (
      <div onClick={e=>{e.stopPropagation();setSelected(task);}}
        title={task.name}
        style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:pc.bg, color:pc.fg, cursor:"pointer", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%", marginBottom:1, borderLeft:`2px solid ${pc.fg}` }}>
        {task.name}
      </div>
    );
  };

  // ── MONTH VIEW ──────────────────────────────────────────────────────
  const renderMonth = () => {
    const daysInMonth = getDaysInMonth(curYear, curMonth);
    const firstDay = getFirstDayOfMonth(curYear, curMonth);
    const cells: (number|null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:"0.5px solid #f0f2f5" }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding:"6px 8px", fontSize:9, fontWeight:600, color:"#b0bec8", textTransform:"uppercase", letterSpacing:"0.08em", textAlign:"center", fontFamily:"'DM Mono',monospace" }}>{d}</div>
          ))}
        </div>
        {/* Date cells */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
          {cells.map((day, i) => {
            const dateStr = day ? `${curYear}-${String(curMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : "";
            const dayTasks = day ? tasksOnDate(dateStr) : [];
            const isToday = dateStr === todayStr;
            const isOtherMonth = !day;
            return (
              <div key={i} style={{ minHeight:80, padding:"5px 6px", borderRight:"0.5px solid #f0f2f5", borderBottom:"0.5px solid #f0f2f5", background:isToday?"#F0F6FF":isOtherMonth?"#fafbfc":"#fff", position:"relative" }}>
                {day && (
                  <>
                    <div style={{ fontSize:11, fontWeight:isToday?600:400, marginBottom:3, width:20, height:20, borderRadius:"50%", background:isToday?"#185FA5":"transparent", display:"flex", alignItems:"center", justifyContent:"center", color:isToday?"#fff":"#3a4a5a" }}>{day}</div>
                    {dayTasks.slice(0,3).map(t => <TaskPill key={t.id} task={t}/>)}
                    {dayTasks.length > 3 && <div style={{ fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>+{dayTasks.length-3} more</div>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── WEEK VIEW ────────────────────────────────────────────────────────
  const renderWeek = () => {
    const weekDays = Array.from({length:7}, (_,i) => {
      const d = new Date(curWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    return (
      <div style={{ overflowX:"auto" }}>
        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"60px repeat(7,1fr)", borderBottom:"0.5px solid #f0f2f5", minWidth:600 }}>
          <div style={{ padding:"6px 8px" }}/>
          {weekDays.map((d,i) => {
            const ds = d.toISOString().split("T")[0];
            const isToday = ds === todayStr;
            return (
              <div key={i} style={{ padding:"6px 8px", textAlign:"center", borderLeft:"0.5px solid #f0f2f5", background:isToday?"#F0F6FF":"#fff" }}>
                <div style={{ fontSize:9, color:"#b0bec8", textTransform:"uppercase", letterSpacing:"0.06em", fontFamily:"'DM Mono',monospace" }}>{DAYS[d.getDay()]}</div>
                <div style={{ fontSize:14, fontWeight:isToday?600:400, color:isToday?"#185FA5":"#1a2332", marginTop:2 }}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        {HOURS.map(hour => {
          const matchingBlock = timeBlocks.find(tb => tb.time === hour || tb.time.startsWith(hour.split(":")[0]+":"));
          return (
            <div key={hour} style={{ display:"grid", gridTemplateColumns:"60px repeat(7,1fr)", borderBottom:"0.5px solid #f0f2f5", minWidth:600 }}>
              <div style={{ padding:"4px 8px", fontSize:9, color:"#b0bec8", fontFamily:"'DM Mono',monospace", paddingTop:6, flexShrink:0 }}>{hour}</div>
              {weekDays.map((d,i) => {
                const ds = d.toISOString().split("T")[0];
                const dayTasks = tasksOnDate(ds);
                const isToday = ds === todayStr;
                const nowHour = `${String(today.getHours()).padStart(2,"0")}:00`;
                const isCurrentHour = isToday && hour === nowHour;
                return (
                  <div key={i} style={{ borderLeft:"0.5px solid #f0f2f5", padding:"3px 4px", minHeight:44, background:isCurrentHour?"#F0F6FF":isToday?"#fafeff":"#fff", position:"relative" }}>
                    {/* Time block overlay */}
                    {matchingBlock && i === today.getDay() && isToday && (
                      <div style={{ position:"absolute", left:0, top:0, bottom:0, width:3, background:TB_COLORS[matchingBlock.type]||"#b0bec8", borderRadius:"0 2px 2px 0" }}/>
                    )}
                    {/* Tasks due on this day shown in first column only */}
                    {i === 0 && hour === "08:00" && dayTasks.map(t => <TaskPill key={t.id} task={t}/>)}
                    {isCurrentHour && <div style={{ position:"absolute", left:3, right:0, top:"50%", height:1, background:"#185FA5", opacity:0.4 }}/>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ gridColumn:"span 2" }}>
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:9, fontWeight:600, letterSpacing:"0.12em", textTransform:"uppercase", color:"#b0bec8", fontFamily:"'DM Mono',monospace" }}>ClickUp Calendar</div>
          {loading && <span style={{ width:10, height:10, border:"2px solid #e2e6ea", borderTopColor:"#185FA5", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }}/>}
          {tasks.length > 0 && !loading && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EBF3FC", color:"#185FA5", fontFamily:"'DM Mono',monospace" }}>{tasks.length} tasks</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={goToday} style={{ fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid #e2e6ea", background:"#f8f9fb", color:"#4a6a8a", cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Today</button>
          <button style={viewBtn(view==="month")} onClick={()=>setView("month")}>Month</button>
          <button style={viewBtn(view==="week")} onClick={()=>setView("week")}>Week</button>
        </div>
      </div>

      {error === "no-token" ? (
        <div style={{ ...panel, padding:"20px 18px" }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", marginBottom:6 }}>ClickUp not connected</div>
          <div style={{ fontSize:12, color:"#4a6a8a", lineHeight:1.6, marginBottom:10 }}>
            To sync your ClickUp tasks, add your API token as an environment variable in Vercel.
          </div>
          <div style={{ fontSize:11, padding:"10px 12px", borderRadius:8, background:"#f8f9fb", border:"0.5px solid #e2e6ea", fontFamily:"'DM Mono',monospace", color:"#4a6a8a", lineHeight:1.8 }}>
            1. Go to ClickUp → Settings → Apps → API Token → Copy<br/>
            2. Go to Vercel → Settings → Environment Variables<br/>
            3. Add: <strong>CLICKUP_API_TOKEN</strong> = your token<br/>
            4. Redeploy
          </div>
          <button onClick={fetchTasks} style={{ marginTop:10, fontSize:11, padding:"6px 12px", borderRadius:8, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", cursor:"pointer", fontWeight:600 }}>Retry</button>
        </div>
      ) : (
        <div style={panel}>
          {/* Nav bar */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderBottom:"0.5px solid #f0f2f5" }}>
            <button onClick={view==="month"?prevMonth:prevWeek} style={{ width:24, height:24, border:"0.5px solid #e2e6ea", borderRadius:6, background:"#f8f9fb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#4a6a8a" }}>←</button>
            <div style={{ fontSize:13, fontWeight:600, color:"#1a2332", minWidth:160 }}>
              {view==="month"
                ? `${MONTHS[curMonth]} ${curYear}`
                : `${curWeekStart.toLocaleDateString("en-PH",{month:"short",day:"numeric"})} – ${new Date(curWeekStart.getTime()+6*86400000).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}`
              }
            </div>
            <button onClick={view==="month"?nextMonth:nextWeek} style={{ width:24, height:24, border:"0.5px solid #e2e6ea", borderRadius:6, background:"#f8f9fb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#4a6a8a" }}>→</button>
            <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap" }}>
              {Object.entries(PRIORITY_COLORS).map(([p,c])=>(
                <span key={p} style={{ fontSize:9, padding:"1px 6px", borderRadius:20, background:c.bg, color:c.fg, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{p}</span>
              ))}
            </div>
          </div>

          {/* Calendar body */}
          {view==="month" ? renderMonth() : renderWeek()}
        </div>
      )}

      {/* Task detail modal */}
      {selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setSelected(null)}>
          <div style={{ background:"#fff", borderRadius:12, padding:"20px 22px", maxWidth:400, width:"90%", boxShadow:"0 8px 32px rgba(0,0,0,0.12)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:"#1a2332", lineHeight:1.4, marginBottom:6 }}>{selected.name}</div>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:(PRIORITY_COLORS[selected.priority]||PRIORITY_COLORS.normal).bg, color:(PRIORITY_COLORS[selected.priority]||PRIORITY_COLORS.normal).fg, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{selected.priority}</span>
              </div>
              <button onClick={()=>setSelected(null)} style={{ fontSize:16, color:"#b0bec8", background:"none", border:"none", cursor:"pointer", padding:"0 4px", marginLeft:8 }}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:"#4a6a8a" }}>
              <div style={{ display:"flex", gap:8 }}><span style={{ color:"#b0bec8", minWidth:70, fontFamily:"'DM Mono',monospace", fontSize:10 }}>LIST</span><span>{selected.listName}</span></div>
              <div style={{ display:"flex", gap:8 }}><span style={{ color:"#b0bec8", minWidth:70, fontFamily:"'DM Mono',monospace", fontSize:10 }}>SPACE</span><span>{selected.spaceName}</span></div>
              <div style={{ display:"flex", gap:8 }}><span style={{ color:"#b0bec8", minWidth:70, fontFamily:"'DM Mono',monospace", fontSize:10 }}>DUE</span><span style={{ fontWeight:500, color: new Date(selected.dueDate) < new Date() ? "#A32D2D" : "#1a2332" }}>{new Date(selected.dueDate).toLocaleDateString("en-PH",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</span></div>
              <div style={{ display:"flex", gap:8 }}><span style={{ color:"#b0bec8", minWidth:70, fontFamily:"'DM Mono',monospace", fontSize:10 }}>STATUS</span><span style={{ padding:"1px 7px", borderRadius:20, background:"#f0f2f5", color:"#4a6a8a", fontSize:11 }}>{selected.status}</span></div>
            </div>
            <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ display:"block", marginTop:14, padding:"8px 14px", borderRadius:8, border:"0.5px solid #185FA5", background:"#EBF3FC", color:"#185FA5", fontSize:12, fontWeight:600, textAlign:"center", textDecoration:"none" }}>
              Open in ClickUp →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
