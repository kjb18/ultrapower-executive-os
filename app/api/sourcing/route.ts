import { NextRequest, NextResponse } from "next/server";

interface SourcingItem {
  name: string;
  quantity: string;
  specs: string;
}

function buildPrompt(items: SourcingItem[]) {
  const itemList = items.map((item, i) =>
    `${i+1}. ${item.name}${item.quantity ? ` (Qty: ${item.quantity})` : ""}${item.specs ? ` — Specs: ${item.specs}` : ""}`
  ).join("\n");

  return `You are a procurement specialist for Ultra Power Industrial Resources Inc., a Philippine B2B industrial distributor based in Makati. Search the web for current supplier information for the following items.

Items to source:
${itemList}

For each item, search for:
1. Philippine local suppliers, distributors, and retailers with current pricing
2. International suppliers if local options are limited or for comparison
3. Online platforms (Lazada, Shopee, industrial suppliers, manufacturer websites)

Return ONLY raw JSON, no markdown fences, no preamble. Format:

{
  "items": [
    {
      "name": "item name",
      "summary": "brief 1-sentence market summary",
      "local_available": true or false,
      "local_suppliers": [
        {
          "name": "supplier name",
          "type": "Local Distributor|Online Platform|Direct Manufacturer",
          "price_range": "₱X,XXX – ₱X,XXX",
          "unit": "per piece|per meter|per set|etc",
          "stock": "In Stock|On Order|Indent|Unknown",
          "lead_time": "e.g. 1-3 days or 2-3 weeks",
          "moq": "e.g. 1 pc or 10 pcs",
          "certifications": "e.g. IP65, IEC, CE or N/A",
          "notes": "any relevant notes",
          "url": "website url if found"
        }
      ],
      "international_suppliers": [
        {
          "name": "supplier name",
          "type": "Manufacturer|Trading Company|Online Platform",
          "price_range": "USD X – X or ₱X,XXX – ₱X,XXX",
          "unit": "per piece|per set|etc",
          "lead_time": "e.g. 15-30 days",
          "moq": "e.g. 10 pcs",
          "import_notes": "duties, shipping, certifications",
          "url": "website url if found"
        }
      ],
      "recommendation": "brief recommendation for Ultra Power — best local source or international if no local option",
      "quotation_hint": "suggested selling price range in PHP for Ultra Power to quote to their clients"
    }
  ],
  "searched_at": "ISO date string"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: SourcingItem[] };
    if (!items?.length) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: buildPrompt(items) }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `API error ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content?.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("") || "";
    if (!raw) return NextResponse.json({ error: "Empty response" }, { status: 500 });

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) return NextResponse.json({ error: "Could not parse response" }, { status: 500 });
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
