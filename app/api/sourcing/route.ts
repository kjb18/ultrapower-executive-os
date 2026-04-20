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

function buildItemPrompt(item: SourcingItem) {
  return `You are a procurement specialist for Ultra Power Industrial Resources Inc., a Philippine B2B industrial distributor based in Makati. Search the web for current supplier information for this single item.

Item: ${item.name}${item.quantity ? ` (Qty: ${item.quantity})` : ""}${item.specs ? ` — Specs: ${item.specs}` : ""}

Search for:
1. Philippine local suppliers, distributors, and retailers with current pricing
2. International suppliers if local options are limited
3. Online platforms (Lazada, Shopee, industrial suppliers, manufacturer websites)

Return ONLY raw JSON, no markdown fences, no preamble. Format:

{
  "name": "${item.name}",
  "summary": "brief 1-sentence market summary",
  "local_available": true or false,
  "local_suppliers": [
    {
      "name": "supplier name",
      "type": "Local Distributor|Online Platform|Direct Manufacturer",
      "price_range": "₱X,XXX – ₱X,XXX",
      "unit": "per piece|per meter|per set|etc",
      "stock": "In Stock|On Order|Indent|Unknown",
      "lead_time": "e.g. 1-3 days",
      "moq": "e.g. 1 pc",
      "certifications": "e.g. IP65, IEC or N/A",
      "notes": "any notes",
      "url": "website url if found"
    }
  ],
  "international_suppliers": [
    {
      "name": "supplier name",
      "type": "Manufacturer|Trading Company|Online Platform",
      "price_range": "USD X – X",
      "unit": "per piece|per set",
      "lead_time": "e.g. 15-30 days",
      "moq": "e.g. 10 pcs",
      "import_notes": "duties, shipping, certifications",
      "url": "website url if found"
    }
  ],
  "recommendation": "brief recommendation for Ultra Power",
  "quotation_hint": "suggested selling price range in PHP for Ultra Power to quote to clients"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: SourcingItem[] };
    if (!items?.length) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    // Enforce 5 item limit
    const limited = items.slice(0, 5);
    const results: SupplierResult[] = [];

    // Call API sequentially per item to avoid rate limits and truncation
    for (const item of limited) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 3000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: buildItemPrompt(item) }],
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          // On rate limit, return what we have so far with an error note
          if (res.status === 429) {
            results.push({
              name: item.name,
              summary: "Rate limit reached. Please wait 60 seconds and try again.",
              local_available: false,
              local_suppliers: [],
              international_suppliers: [],
              recommendation: "Rate limit reached. Try searching this item separately.",
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
            summary: "No results returned for this item.",
            local_available: false,
            local_suppliers: [],
            international_suppliers: [],
            recommendation: "Try rephrasing the item name with more specific details.",
            quotation_hint: "N/A",
          });
          continue;
        }

        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        let parsed: SupplierResult;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Try to extract JSON object from response
          const match = cleaned.match(/\{[\s\S]*\}/);
          if (!match) {
            results.push({
              name: item.name,
              summary: "Could not parse supplier data for this item.",
              local_available: false,
              local_suppliers: [],
              international_suppliers: [],
              recommendation: "Try searching with a simpler item name.",
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
          recommendation: "Search failed for this item. Try again.",
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
