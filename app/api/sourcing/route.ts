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

interface CentralResult {
  name: string;
  result: string;
}

// Token safety constants -- do not increase without reviewing usage impact
const MAX_TOKENS = 2000;           // Hard cap per item (legacy mode) -- prevents truncation and cost blowout
const MAX_TOKENS_CENTRAL = 4000;   // Hard cap per item (Sourcing Central mode) -- output is comprehensive
const MAX_WEB_SEARCHES = 3;        // Max web searches per item -- each search adds ~5-15K input tokens
const MAX_ITEMS = 5;               // Max items per batch

// Sourcing Central system prompt -- used only when mode === "central" (Projects.tsx Sourcing panel).
// SourcingModule.tsx still uses the legacy structured JSON prompt below, unchanged.
const SOURCING_SYSTEM = `You are Sourcing Central, a specialized industrial procurement sourcing assistant for Ultra Power Industrial Resources, Inc., an engineering solutions and industrial supply company based in Makati City, Philippines.

Company: Ultra Power Industrial Resources, Inc.
Office: Unit 105 Teylan Building, 6917 Washington St., Makati City, Philippines
TIN: 238-917-595-000
Primary client vertical: Power sector (geothermal, oil and gas, drilling, industrial facilities)

FOR EVERY ITEM SOURCED, ALWAYS PROVIDE:

1. Plain-language product description (1-3 sentences)
Describe what the item is and what it does. Include its specific use in power sector, geothermal, oilfield, or industrial context.

2. Spec summary table
Extract and tabulate all relevant technical specifications. Flag ambiguities, missing info, or spec conflicts.

3. Local Philippine suppliers (3-5 sources)
For each: company name and nature (manufacturer/distributor/reseller), full address, telephone, mobile (flag Viber-active), contact name and email, price estimate in PHP and USD, stock availability and lead time, warranty terms, relevant notes.

4. International suppliers (3-5 sources)
Same as local plus: shipping route and transit time to Manila, customs duty estimate (typically 7-12% CIF), dangerous goods or regulatory notes, air vs sea freight.

5. China/Alibaba sources (always include, place last)
Verified Gold Suppliers and Trade Assurance sellers only. Include brand names, MOQ, estimated FOB price, shipping time to Manila. Flag if brand-lock applies.

6. Cross-reference and equivalent brands
For named brands/models, identify closest equivalents. Note if RFQ brand is locked or equivalents accepted.

7. Outreach emails (per supplier type)
Generate ready-to-send RFQ emails:
- One for local Philippine suppliers
- One for international/OEM suppliers
- One for China/Alibaba suppliers

Email rules:
- Formal authoritative B2B English
- Identifies Ultra Power Industrial Resources, Inc.
- Contains full item specifications formatted cleanly
- Requests: unit price, total price, stock availability, lead time, warranty, delivery terms, documentation (MTC, COC, PDS, SDS, certifications)
- Does NOT include email signature
- Does NOT disclose client name (refer as "an industrial project in the Philippines" or "a power sector application")

8. Sourcing flags and action notes
2-4 concise practical notes covering: urgency flags, brand lock vs equivalent acceptance, documentation requirements, dangerous goods/regulatory issues, spec ambiguity to resolve, recommended fastest sourcing path.

PRICING: Always PHP and USD. Use PHP 57.80 per USD unless specified. Present as range (low-high). State ex-works/FOB/CIF. State VAT included/excluded.

CONFIDENTIALITY: Do NOT name end client in emails. Refer only as "power sector project" or "industrial facility."

FORMAT: Authoritative B2B voice. Tables for specs and cross-references. No em dashes. No bold overuse. Pricing in both PHP and USD.

"OR EQUIVALENT" in RFQ means you MUST include alternate brands.

For multi-item RFQs, process each line item as a separate sourcing card within the same response.`;

function buildCentralPrompt(item: SourcingItem, useWebSearch: boolean) {
  const searchNote = useWebSearch
    ? "Search the web for current pricing, stock, and supplier details."
    : "Use your training knowledge to suggest likely suppliers and estimated pricing.";

  return `Source the following item. ${searchNote}

Item: ${item.name}${item.quantity ? ` (Qty: ${item.quantity})` : ""}${item.specs ? ` — Specs: ${item.specs}` : ""}

Follow the Sourcing Central format exactly, covering all 8 sections for this single item.`;
}

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
    const { items, useWebSearch = true, mode } = await req.json() as { items: SourcingItem[]; useWebSearch: boolean; mode?: string };
    if (!items?.length) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    const limited = items.slice(0, MAX_ITEMS);

    // Sourcing Central mode -- comprehensive freeform report per item, used by the Projects.tsx Sourcing panel
    if (mode === "central") {
      const centralResults: CentralResult[] = [];

      for (const item of limited) {
        try {
          const body: Record<string, unknown> = {
            model: "claude-sonnet-4-5",
            max_tokens: MAX_TOKENS_CENTRAL,
            system: SOURCING_SYSTEM,
            messages: [{ role: "user", content: buildCentralPrompt(item, useWebSearch) }],
          };

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
              centralResults.push({ name: item.name, result: "Rate limit reached. Wait 60 seconds and try again, or source fewer items at once." });
              continue;
            }
            throw new Error(`API error ${res.status}: ${err}`);
          }

          const data = await res.json();
          const raw = data.content
            ?.filter((b: { type: string }) => b.type === "text")
            .map((b: { text: string }) => b.text)
            .join("") || "";

          centralResults.push({ name: item.name, result: raw || "No results returned. Try rephrasing with more specific details." });
        } catch (itemErr) {
          centralResults.push({ name: item.name, result: `Error sourcing this item: ${String(itemErr)}` });
        }
      }

      return NextResponse.json({
        items: centralResults,
        searched_at: new Date().toISOString(),
      });
    }

    // Legacy structured JSON mode -- used by SourcingModule.tsx, unchanged
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
