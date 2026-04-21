import { NextRequest, NextResponse } from "next/server";

interface SourcingItem {
  name: string;
  quantity: string;
  specs: string;
}

interface SupplierResult {
  name: string;
  summary: string;
  local_available: boolean;
  local_suppliers: object[];
  international_suppliers: object[];
  recommendation: string;
  quotation_hint: string;
}

// Token safety constants -- do not increase without reviewing usage impact
const MAX_TOKENS = 2000;           // Hard cap per item -- prevents truncation and cost blowout
const MAX_WEB_SEARCHES = 3;        // Max web searches per item -- each search adds ~5-15K input tokens
const MAX_ITEMS = 5;               // Max items per batch

function buildItemPrompt(item: SourcingItem, useWebSearch: boolean) {
  const searchNote = useWebSearch
    ? "Search the web for current pricing and availability."
    : "Use your training knowledge to suggest likely suppliers and estimated pricing.";

  return `You are a procurement specialist for Ultra Power Industrial Resources Inc., a Philippine B2B industrial distributor in Makati. ${searchNote}

Item: ${item.name}${item.quantity ? ` (Qty: ${item.quantity})` : ""}${item.specs ? ` — Specs: ${item.specs}` : ""}

Find Philippine suppliers first, then international options. Be concise -- short notes only.

Return ONLY raw JSON, no markdown, no preamble:

{
  "name": "${item.name}",
  "summary": "1-sentence market summary",
  "local_available": true or false,
  "local_suppliers": [
    {
      "name": "supplier",
      "type": "Local Distributor|Online Platform|Direct Manufacturer",
      "price_range": "₱X,XXX – ₱X,XXX",
      "unit": "per piece|etc",
      "stock": "In Stock|On Order|Indent|Unknown",
      "lead_time": "e.g. 1-3 days",
      "moq": "e.g. 1 pc",
      "certifications": "e.g. IP65 or N/A",
      "notes": "brief note",
      "url": "url or empty string"
    }
  ],
  "international_suppliers": [
    {
      "name": "supplier",
      "type": "Manufacturer|Trading Company|Online Platform",
      "price_range": "USD X – X",
      "unit": "per piece|etc",
      "lead_time": "e.g. 15-30 days",
      "moq": "e.g. 10 pcs",
      "import_notes": "brief import note",
      "url": "url or empty string"
    }
  ],
  "recommendation": "1-2 sentence recommendation for Ultra Power",
  "quotation_hint": "suggested selling price range in PHP"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { items, useWebSearch = true } = await req.json() as { items: SourcingItem[]; useWebSearch: boolean };
    if (!items?.length) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    const limited = items.slice(0, MAX_ITEMS);
    const results: SupplierResult[] = [];

    for (const item of limited) {
      try {
        const body: Record<string, unknown> = {
          model: "claude-sonnet-4-5",
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: buildItemPrompt(item, useWebSearch) }],
        };

        // Only attach web search tool when enabled -- web search is the primary token cost driver
        if (useWebSearch) {
          body.tools = [{
            type: "web_search_20250305",
            name: "web_search",
            max_uses: MAX_WEB_SEARCHES, // Hard cap: 3 searches per item max
          }];
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.text();
          if (res.status === 429) {
            results.push({
              name: item.name,
              summary: "Rate limit reached. Wait 60 seconds and try again, or use fewer items.",
              local_available: false,
              local_suppliers: [],
              international_suppliers: [],
              recommendation: "Try this item in a separate search after waiting.",
              quotation_hint: "N/A",
            });
            continue;
          }
          throw new Error(`API error ${res.status}: ${err}`);
        }

        const data = await res.json();
        const raw = data.content
          ?.filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("") || "";

        if (!raw) {
          results.push({
            name: item.name,
            summary: "No results returned.",
            local_available: false,
            local_suppliers: [],
            international_suppliers: [],
            recommendation: "Try rephrasing with more specific details.",
            quotation_hint: "N/A",
          });
          continue;
        }

        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        let parsed: SupplierResult;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (!match) {
            results.push({
              name: item.name,
              summary: "Could not parse supplier data.",
              local_available: false,
              local_suppliers: [],
              international_suppliers: [],
              recommendation: "Try a simpler item name.",
              quotation_hint: "N/A",
            });
            continue;
          }
          parsed = JSON.parse(match[0]);
        }
        results.push(parsed);

      } catch (itemErr) {
        results.push({
          name: item.name,
          summary: `Error: ${String(itemErr)}`,
          local_available: false,
          local_suppliers: [],
          international_suppliers: [],
          recommendation: "Search failed. Try again.",
          quotation_hint: "N/A",
        });
      }
    }

    return NextResponse.json({
      items: results,
      searched_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
