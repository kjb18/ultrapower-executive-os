import { NextRequest, NextResponse } from "next/server";

const CATEGORIES = ["Business strategy","Sales & negotiation","Marketing & branding","Personal productivity","Finance & wealth","Mindset & self-help"];

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

export async function POST(req: NextRequest) {
  try {
    const { usedIds = [], usedCats = [], pendingRequest = "" } = await req.json();

    const pool = CATEGORIES.filter((c: string) => !usedCats.includes(c));
    const available = pool.length > 0 ? pool : CATEGORIES;
    const category = available[Math.floor(Math.random() * available.length)];

    const prompt = buildPrompt(category, usedIds, pendingRequest);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `API error: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
    if (!raw) return NextResponse.json({ error: "Empty response" }, { status: 500 });

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: "No JSON in response" }, { status: 500 });
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json({ module: parsed, category });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
