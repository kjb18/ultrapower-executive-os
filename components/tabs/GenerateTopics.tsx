"use client";
import { useState, useEffect } from "react";
import type { CSSProperties } from "react";

const STORAGE_KEY = "up_generate_topics_v1";

const ARTICLE_CALENDAR = [
  "Complete Guide to Industrial Lighting in the Philippines",
  "How Government Projects Procure Industrial Lighting (PhilGEPS Explained)",
  "Why Most Warehouse Lighting Designs in the Philippines Are Wrong",
  "LED vs Traditional Lighting: Real Cost Comparison (Philippines)",
  "What is Dialux and Why It Matters in Government Projects",
  "How to Write Technical Specifications for Industrial Lighting (BAC Guide)",
  "Warehouse Lighting Design Guide (Ceiling Height + Lux Levels)",
  "Cheapest Bid vs Best Value: Why Government Projects Overpay Long-Term",
  "Recommended Lux Levels for Warehouses and Factories",
  "How to Evaluate Lighting Suppliers for Government Bidding",
  "High Bay vs Low Bay Lighting: What to Specify",
  "Common Mistakes in PhilGEPS Lighting Bids",
  "Industrial Lighting Standards in the Philippines",
  "How Lighting Impacts Worker Productivity",
  "LED Retrofit Guide for Government Facilities",
  "How to Justify Lighting Upgrades in Budget Proposals",
  "Explosion-Proof Lighting: When Is It Required",
  "What Makes a Lighting Supplier Qualified for Government Projects",
  "How to Read a Dialux Report (For Non-Engineers)",
  "Lighting Design for Cold Storage Facilities",
  "Energy Savings Computation for LED Projects",
  "Why Cheap LED Fails in Government Projects",
  "Best Lighting Layouts for Warehouses",
  "How to Avoid Audit Issues in Lighting Procurement",
  "Lifecycle Costing vs Initial Cost in Public Projects",
  "Writing Bid Documents for Lighting Projects (Template)",
  "Industrial Lighting for Manufacturing Plants",
  "Top 10 Questions Before Approving a Lighting Project",
  "How to Win Lighting Projects Through Better Technical Specs",
  "Case Study: Warehouse Lighting Upgrade",
  "Case Study: Government Facility Retrofit",
  "The Future of Industrial Lighting in the Philippines",
];

const SYSTEM_PROMPT = `You are a content strategist for Ultra Power Industrial Resources, Inc., a Philippine B2B industrial distributor specializing in engineering-led industrial lighting solutions.

BRAND CONTEXT:
- Company: Ultra Power Industrial Resources, Inc. (Philippines)
- Primary focus: Industrial lighting (Goodlite, Philips/Signify authorized distributor)
- Other products: SUFA Valves, ProMinent Pumps, Tomoe Valves
- Target industries: Power generation, oil & gas, manufacturing, mining, cold storage, government
- Brand positioning: Engineering-driven, design-first, data-backed. Never "supplier" or "trader."

CONTENT PILLARS (priority order):
1. Industrial Authority - Technical education, standards, compliance. Audience: Engineers, Facility Managers.
2. Engineering Insights - Dialux simulation, lux levels, fixture specs, design methodology. Audience: Engineers.
3. Decision-Maker ROI - Cost comparisons, payback, lifecycle value, budget justification. Audience: Executives, Facility Managers.
4. Procurement Intelligence - PhilGEPS process, BAC guidance, spec writing, bid compliance. Audience: BAC Officers, Project Managers.

TONE: Technical but clear, authoritative, constructive framing, non-contentious, Philippine context always.

60-DAY ARTICLE CALENDAR:
${ARTICLE_CALENDAR.map((t, i) => `${i + 1}. ${t}`).join("\n")}

OUTPUT FORMAT: Valid JSON array only. No markdown, no explanation, no preamble. Each object:
{
  "title": "Article title",
  "pillar": "Industrial Authority" | "Engineering Insights" | "Decision-Maker ROI" | "Procurement Intelligence",
  "audience": "Engineers" | "BAC Officers" | "Decision-Makers" | "Facility Managers" | "Engineers / BAC Officers" | "Decision-Makers / Engineers",
  "angle": "One sentence describing the content angle and value proposition",
  "source": "Calendar Article #N" | "AI Generated"
}`;

const OUTPUT_SYSTEM = `You are a content strategist for Ultra Power Industrial Resources, Inc. (Philippines). Generate structured content outputs for industrial lighting topics. Brand is engineering-led, authoritative, non-contentious, Philippine context.

OUTPUT FORMAT: Valid JSON only, no markdown, no preamble:
{
  "articleBrief": {
    "title": "Final article title",
    "audience": "Target audience",
    "keyword": "Primary SEO keyword",
    "metaDescription": "150-160 character meta description",
    "h2Outline": ["H2 heading 1", "H2 heading 2", "H2 heading 3", "H2 heading 4", "H2 heading 5"],
    "cta": "Soft CTA for end of article"
  },
  "imageBrief": {
    "template": "Concept Explainer | Data Visualization | Before/After | Process Flow | Comparison Card",
    "content": "Detailed description of what the image should show",
    "branding": "Branding notes: colors, placement, badges"
  },
  "linkedinPost": "Full LinkedIn post caption with hashtags (200-300 words)",
  "facebookPost": "Simplified Facebook caption with hashtags (80-120 words)"
}`;

type TopicStatus = "pending" | "generating" | "approved" | "rejected";

interface Topic {
  id: string;
  title: string;
  pillar: string;
  audience: string;
  angle: string;
  source: string;
  status: TopicStatus;
  outputs: Record<string, unknown> | null;
}

function getPillarColor(pillar: string): { bg: string; color: string; border: string } {
  if (pillar === "Industrial Authority") return { bg: "#FEF3E2", color: "#C8841A", border: "#fde68a" };
  if (pillar === "Engineering Insights") return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
  if (pillar === "Decision-Maker ROI") return { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" };
  if (pillar === "Procurement Intelligence") return { bg: "#fdf4ff", color: "#7e22ce", border: "#e9d5ff" };
  return { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };
}

function cardStyle(status: TopicStatus): CSSProperties {
  return {
    background: "#fff",
    border: `1px solid ${status === "approved" ? "#86efac" : "#E8E8E8"}`,
    borderLeft: `3px solid ${status === "approved" ? "#22c55e" : status === "rejected" ? "#ccc" : status === "generating" ? "#F5A623" : "#E8E8E8"}`,
    borderRadius: 12,
    overflow: "hidden",
    opacity: status === "rejected" ? 0.5 : 1,
  };
}

function tagStyle(bg: string, color: string, border: string): CSSProperties {
  return { fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: bg, color, border: `1px solid ${border}` };
}

function statusBadgeStyle(status: TopicStatus): CSSProperties {
  const map: Record<string, { background: string; color: string }> = {
    approved: { background: "#f0fdf4", color: "#15803d" },
    generating: { background: "#FEF3E2", color: "#C8841A" },
    rejected: { background: "#f1f5f9", color: "#475569" },
    pending: { background: "#f1f5f9", color: "#475569" },
  };
  return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, marginLeft: "auto", ...map[status] };
}

function outputTabStyle(active: boolean): CSSProperties {
  return {
    padding: "5px 12px",
    border: "1px solid #E8E8E8",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    background: active ? "#FEF3E2" : "#fff",
    color: active ? "#C8841A" : "#666",
  };
}

const s: Record<string, CSSProperties> = {
  page: { padding: "24px", maxWidth: 880, margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  header: { marginBottom: 20 },
  h1: { fontSize: 20, fontWeight: 700, margin: 0, color: "#1a1a1a" },
  sub: { fontSize: 12, color: "#999", marginTop: 2 },
  configBar: { background: "#fff", border: "1px solid #E8E8E8", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  label: { fontSize: 12, fontWeight: 600, color: "#666", whiteSpace: "nowrap" },
  select: { padding: "7px 10px", border: "1px solid #E8E8E8", borderRadius: 7, fontSize: 13, background: "#fff", outline: "none" },
  notesInput: { flex: 1, minWidth: 180, padding: "7px 10px", border: "1px solid #E8E8E8", borderRadius: 7, fontSize: 13, fontFamily: "inherit", resize: "none", height: 36 },
  summaryBar: { display: "flex", gap: 20, background: "#fff", border: "1px solid #E8E8E8", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#666" },
  grid: { display: "flex", flexDirection: "column", gap: 12 },
  cardHeader: { padding: "14px 16px 10px", display: "flex", alignItems: "flex-start", gap: 10 },
  num: { width: 24, height: 24, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#666", flexShrink: 0, marginTop: 1 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 6, lineHeight: 1.4 },
  tags: { display: "flex", gap: 6, flexWrap: "wrap" },
  angle: { padding: "0 16px 10px 50px", fontSize: 12, color: "#666", lineHeight: 1.5 },
  actions: { padding: "8px 16px 12px 50px", display: "flex", gap: 8, flexWrap: "wrap" },
  btnApprove: { padding: "6px 14px", background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnReject: { padding: "6px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnRevise: { padding: "6px 14px", background: "#FEF3E2", color: "#C8841A", border: "1px solid #fde68a", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  btnRestore: { padding: "6px 14px", background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  revisePanel: { padding: "0 16px 12px 50px" },
  reviseTextarea: { width: "100%", padding: "8px 10px", border: "1px solid #E8E8E8", borderRadius: 7, fontSize: 13, resize: "vertical", minHeight: 56, fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box" },
  btnRegen: { padding: "6px 14px", background: "#F5A623", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  outputSection: { borderTop: "1px solid #f0f0f0", padding: "12px 16px 14px 50px" },
  outputTabRow: { display: "flex", gap: 6, marginBottom: 10 },
  outputBox: { background: "#f9f9f9", border: "1px solid #E8E8E8", borderRadius: 7, padding: 12, fontSize: 12, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" },
  outputActions: { display: "flex", gap: 8, marginTop: 8 },
  btnCopy: { padding: "5px 12px", background: "#fff", border: "1px solid #E8E8E8", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#666" },
  emptyState: { textAlign: "center", padding: "48px 24px", color: "#aaa" },
  toastBox: { position: "fixed", bottom: 24, right: 24, background: "#1a1a1a", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, zIndex: 1000, pointerEvents: "none" },
};

export default function GenerateTopics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [count, setCount] = useState(5);
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState("");
  const [reviseInputs, setReviseInputs] = useState<Record<string, string>>({});
  const [reviseOpen, setReviseOpen] = useState<Record<string, boolean>>({});
  const [activeOutputTab, setActiveOutputTab] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setTopics(data.topics || []);
      }
    } catch {}
  }, []);

  function saveTopics(updated: Topic[]) {
    setTopics(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics: updated }));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2800);
  }

  async function callClaude(system: string, userMsg: string): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await res.json();
    return data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
  }

  function parseJSON(raw: string) {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  }

  async function generateTopics() {
    setGenerating(true);
    try {
      const userMsg = `Generate exactly ${count} content topic${count > 1 ? "s" : ""} for Ultra Power Industrial Resources.
${notes ? `Additional notes: ${notes}` : ""}
Mix calendar articles and AI-generated topics based on pillar priority. Return only the JSON array.`;
      const raw = await callClaude(SYSTEM_PROMPT, userMsg);
      const parsed: Topic[] = parseJSON(raw).map((t: Omit<Topic, "id" | "status" | "outputs">, i: number) => ({
        id: `topic_${Date.now()}_${i}`,
        ...t,
        status: "pending" as TopicStatus,
        outputs: null,
      }));
      saveTopics(parsed);
      showToast(`${count} topic${count > 1 ? "s" : ""} generated`);
    } catch (e) {
      showToast("Generation failed. Please try again.");
      console.error(e);
    }
    setGenerating(false);
  }

  async function approveTopic(id: string) {
    const topic = topics.find((t) => t.id === id);
    if (!topic) return;
    saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "generating" as TopicStatus } : t)));
    try {
      const userMsg = `Generate all content outputs for this Ultra Power topic:
Title: ${topic.title}
Pillar: ${topic.pillar}
Audience: ${topic.audience}
Angle: ${topic.angle}
Return only the JSON object.`;
      const raw = await callClaude(OUTPUT_SYSTEM, userMsg);
      const outputs = parseJSON(raw);
      saveToOS(topic, outputs);
      saveTopics(topics.map((t) => t.id === id ? { ...t, status: "approved" as TopicStatus, outputs } : t));
      showToast("Approved. Outputs saved to OS.");
    } catch (e) {
      saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "pending" as TopicStatus } : t)));
      showToast("Output generation failed. Try again.");
      console.error(e);
    }
  }

  function rejectTopic(id: string) {
    saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "rejected" as TopicStatus } : t)));
    showToast("Topic rejected.");
  }

  function restoreTopic(id: string) {
    saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "pending" as TopicStatus } : t)));
  }

  async function regenerateTopic(id: string) {
    const topic = topics.find((t) => t.id === id);
    if (!topic) return;
    const note = reviseInputs[id] || "";
    saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "generating" as TopicStatus } : t)));
    try {
      const userMsg = `Regenerate ONE content topic for Ultra Power Industrial Resources.
Original topic: "${topic.title}"
Original pillar: ${topic.pillar}
Revision note: ${note || "General refresh"}
Return only a JSON array with exactly 1 object.`;
      const raw = await callClaude(SYSTEM_PROMPT, userMsg);
      const newTopic = parseJSON(raw)[0];
      saveTopics(topics.map((t) => t.id === id ? { ...t, ...newTopic, status: "pending" as TopicStatus, outputs: null } : t));
      setReviseOpen((prev) => ({ ...prev, [id]: false }));
      showToast("Topic regenerated.");
    } catch (e) {
      saveTopics(topics.map((t) => (t.id === id ? { ...t, status: "pending" as TopicStatus } : t)));
      showToast("Regeneration failed. Try again.");
      console.error(e);
    }
  }

  function saveToOS(topic: Topic, outputs: Record<string, unknown>) {
    const ts = Date.now();
    try {
      const articles = JSON.parse(localStorage.getItem("up_socmed_articles") || "[]");
      const ab = outputs.articleBrief as Record<string, unknown>;
      articles.unshift({
        id: `art_${ts}`, title: ab?.title || topic.title,
        audience: ab?.audience || topic.audience, keyword: ab?.keyword || "",
        metaDescription: ab?.metaDescription || "", outline: ab?.h2Outline || [],
        cta: ab?.cta || "", pillar: topic.pillar, status: "Brief Ready",
        createdAt: ts, source: "Generate Topics",
      });
      localStorage.setItem("up_socmed_articles", JSON.stringify(articles));
    } catch {}
    try {
      const images = JSON.parse(localStorage.getItem("up_socmed_images") || "[]");
      const ib = outputs.imageBrief as Record<string, unknown>;
      images.unshift({
        id: `img_${ts}`, title: topic.title, template: ib?.template || "",
        content: ib?.content || "", branding: ib?.branding || "",
        pillar: topic.pillar, status: "Brief Ready", createdAt: ts, source: "Generate Topics",
      });
      localStorage.setItem("up_socmed_images", JSON.stringify(images));
    } catch {}
    try {
      const posts = JSON.parse(localStorage.getItem("up_socmed_posts") || "[]");
      posts.unshift({
        id: `post_li_${ts}`, platform: "LinkedIn", pillar: topic.pillar,
        caption: outputs.linkedinPost || "", articleTitle: topic.title,
        status: "Draft", createdAt: ts, source: "Generate Topics",
      });
      posts.unshift({
        id: `post_fb_${ts}`, platform: "Facebook", pillar: topic.pillar,
        caption: outputs.facebookPost || "", articleTitle: topic.title,
        status: "Draft", createdAt: ts, source: "Generate Topics",
      });
      localStorage.setItem("up_socmed_posts", JSON.stringify(posts));
    } catch {}
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => showToast(`${label} copied.`));
  }

  function formatArticleBrief(ab: Record<string, unknown>) {
    return `TITLE: ${ab.title}\n\nAUDIENCE: ${ab.audience}\nKEYWORD: ${ab.keyword}\nMETA: ${ab.metaDescription}\n\nH2 OUTLINE:\n${(ab.h2Outline as string[])?.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nCTA: ${ab.cta}`;
  }

  function formatImageBrief(ib: Record<string, unknown>) {
    return `TEMPLATE: ${ib.template}\n\nCONTENT:\n${ib.content}\n\nBRANDING:\n${ib.branding}`;
  }

  const approved = topics.filter((t) => t.status === "approved").length;
  const rejected = topics.filter((t) => t.status === "rejected").length;
  const pending = topics.filter((t) => t.status === "pending").length;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#f5f5f5" }}>
      <div style={s.page}>

        <div style={s.header}>
          <h1 style={s.h1}>Generate Topics</h1>
          <p style={s.sub}>AI-powered content topic generator for Ultra Power Industrial Resources</p>
        </div>

        <div style={s.configBar}>
          <span style={s.label}>Topics to generate:</span>
          <select style={s.select} value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9,10,12,15].map((n) => (
              <option key={n} value={n}>{n} topic{n > 1 ? "s" : ""}</option>
            ))}
          </select>
          <textarea
            style={s.notesInput}
            placeholder="Optional notes: e.g. focus on cold storage this week..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            style={{ padding: "8px 20px", background: generating ? "#ccc" : "#F5A623", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: generating ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            onClick={generateTopics}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate Topics"}
          </button>
        </div>

        {topics.length > 0 && (
          <div style={s.summaryBar}>
            <span>Total: <strong>{topics.length}</strong></span>
            <span style={{ color: "#15803d" }}>Approved: <strong>{approved}</strong></span>
            <span style={{ color: "#b91c1c" }}>Rejected: <strong>{rejected}</strong></span>
            <span>Pending: <strong>{pending}</strong></span>
          </div>
        )}

        <div style={s.grid}>
          {topics.length === 0 ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                Set your batch size and hit <strong>Generate Topics</strong>.<br />
                Each topic can be approved, rejected, or revised individually.
              </p>
            </div>
          ) : (
            topics.map((topic, idx) => {
              const pc = getPillarColor(topic.pillar);
              const outputTab = activeOutputTab[topic.id] || "article";
              const outputs = topic.outputs as Record<string, Record<string, unknown>> | null;

              return (
                <div key={topic.id} style={cardStyle(topic.status)}>
                  <div style={s.cardHeader}>
                    <div style={s.num}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={s.cardTitle}>{topic.title}</div>
                      <div style={s.tags}>
                        <span style={tagStyle(pc.bg, pc.color, pc.border)}>{topic.pillar}</span>
                        <span style={tagStyle("#f1f5f9", "#475569", "#e2e8f0")}>{topic.audience}</span>
                        <span style={tagStyle("#f0f0f0", "#888", "#e0e0e0")}>{topic.source}</span>
                      </div>
                    </div>
                    {topic.status !== "pending" && (
                      <span style={statusBadgeStyle(topic.status)}>
                        {topic.status === "generating" ? "Generating..." : topic.status.charAt(0).toUpperCase() + topic.status.slice(1)}
                      </span>
                    )}
                  </div>

                  <div style={s.angle}>{topic.angle}</div>

                  <div style={s.actions}>
                    {topic.status === "pending" && (
                      <>
                        <button style={s.btnApprove} onClick={() => approveTopic(topic.id)}>Approve</button>
                        <button style={s.btnReject} onClick={() => rejectTopic(topic.id)}>Reject</button>
                        <button style={s.btnRevise} onClick={() => setReviseOpen((p) => ({ ...p, [topic.id]: !p[topic.id] }))}>Revise</button>
                      </>
                    )}
                    {topic.status === "rejected" && (
                      <button style={s.btnRestore} onClick={() => restoreTopic(topic.id)}>Restore</button>
                    )}
                    {topic.status === "generating" && (
                      <span style={{ fontSize: 12, color: "#C8841A" }}>Generating outputs...</span>
                    )}
                  </div>

                  {reviseOpen[topic.id] && topic.status === "pending" && (
                    <div style={s.revisePanel}>
                      <textarea
                        style={s.reviseTextarea}
                        placeholder="Describe how to revise this topic..."
                        value={reviseInputs[topic.id] || ""}
                        onChange={(e) => setReviseInputs((p) => ({ ...p, [topic.id]: e.target.value }))}
                      />
                      <button style={s.btnRegen} onClick={() => regenerateTopic(topic.id)}>
                        Regenerate This Topic
                      </button>
                    </div>
                  )}

                  {topic.status === "approved" && outputs && (
                    <div style={s.outputSection}>
                      <div style={s.outputTabRow}>
                        {["article", "image", "linkedin", "facebook"].map((tab) => (
                          <button
                            key={tab}
                            style={outputTabStyle(outputTab === tab)}
                            onClick={() => setActiveOutputTab((p) => ({ ...p, [topic.id]: tab }))}
                          >
                            {tab === "article" ? "Article Brief" : tab === "image" ? "Image Brief" : tab === "linkedin" ? "LinkedIn" : "Facebook"}
                          </button>
                        ))}
                      </div>
                      {outputTab === "article" && outputs.articleBrief && (
                        <div>
                          <div style={s.outputBox}>{formatArticleBrief(outputs.articleBrief)}</div>
                          <div style={s.outputActions}>
                            <button style={s.btnCopy} onClick={() => copyText(formatArticleBrief(outputs.articleBrief), "Article brief")}>Copy</button>
                          </div>
                        </div>
                      )}
                      {outputTab === "image" && outputs.imageBrief && (
                        <div>
                          <div style={s.outputBox}>{formatImageBrief(outputs.imageBrief)}</div>
                          <div style={s.outputActions}>
                            <button style={s.btnCopy} onClick={() => copyText(formatImageBrief(outputs.imageBrief), "Image brief")}>Copy</button>
                          </div>
                        </div>
                      )}
                      {outputTab === "linkedin" && (
                        <div>
                          <div style={s.outputBox}>{String(outputs.linkedinPost || "")}</div>
                          <div style={s.outputActions}>
                            <button style={s.btnCopy} onClick={() => copyText(String(outputs.linkedinPost || ""), "LinkedIn post")}>Copy</button>
                          </div>
                        </div>
                      )}
                      {outputTab === "facebook" && (
                        <div>
                          <div style={s.outputBox}>{String(outputs.facebookPost || "")}</div>
                          <div style={s.outputActions}>
                            <button style={s.btnCopy} onClick={() => copyText(String(outputs.facebookPost || ""), "Facebook post")}>Copy</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {toast && <div style={s.toastBox}>{toast}</div>}
    </div>
  );
}
