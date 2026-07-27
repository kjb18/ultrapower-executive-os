import { NextRequest, NextResponse } from "next/server";

// TOKEN SAFETY: Hard cap on output tokens. No web search on this route.
// Never increase above 4000 without reviewing cost impact.
const MAX_TOKENS = 4000;

interface QuotGenMessage {
  role: "user" | "assistant";
  text: string;
  image?: string;
}

const SYSTEM_PROMPT_BASE = `You are a quotation generator for Ultra Power Industrial Resources, Inc., a Philippine industrial supply company.

Your job: take a supplier quotation and the user's instructions, then produce a customer-facing quotation with marked-up prices and customized terms.

Company details for the quotation header:
- Company: Ultra Power Industrial Resources, Inc.
- Address: Unit 105 Teylan Building, 6917 Washington St., Makati City
- TIN: 238-917-595-000

RULES:
- When the user says "markup X%", multiply supplier cost by (1 + X/100). Example: "markup 40%" means supplier cost x 1.4
- Always present prices in PHP unless told otherwise
- Keep item descriptions professional and clear
- Format quantities with proper units
- Calculate line totals (qty x unit price) and grand total automatically
- Apply VAT only when explicitly instructed

RESPONSE FORMAT:
Always respond with TWO parts separated by the exact marker "---QUOTATION_DATA---"

Part 1: Your conversational response to the user (acknowledgment, questions, notes about what you changed)

Part 2: After the marker, output ONLY raw JSON (no markdown, no backticks):
{
  "lineItems": [
    {
      "description": "item description for the customer",
      "quantity": 10,
      "unit": "pcs",
      "supplierPrice": 1000,
      "markupPct": 40,
      "unitPrice": 1400,
      "total": 14000
    }
  ],
  "subtotal": 14000,
  "vatType": "Zero Rated",
  "vatAmount": 0,
  "grandTotal": 14000,
  "terms": {
    "delivery": "",
    "validity": "",
    "warranty": "",
    "payment": ""
  },
  "notes": "any notes about the quotation"
}

If the user is just chatting or asking questions without needing a quotation update, respond conversationally WITHOUT the ---QUOTATION_DATA--- marker.

When the user provides the initial supplier quote, extract ALL items with their prices, then apply the requested markup and terms. Show the user what you extracted and what the customer prices will be.

On revision requests, take the previous quotation data and apply only the requested changes. Keep everything else the same.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, projectContext } = (await req.json()) as {
      messages: QuotGenMessage[];
      projectContext?: string;
    };

    const systemPrompt = `${SYSTEM_PROMPT_BASE}

Project context:
${projectContext || "No project context provided."}`;

    const claudeMessages: Array<{ role: string; content: unknown }> = [];

    for (const msg of messages || []) {
      if (msg.role === "user") {
        if (msg.image) {
          const mediaType = msg.image.startsWith("data:image/png") ? "image/png"
            : msg.image.startsWith("data:image/webp") ? "image/webp"
            : "image/jpeg";
          const base64Data = msg.image.split(",")[1] || msg.image;
          claudeMessages.push({
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
              { type: "text", text: msg.text || "Extract items from this supplier quotation." },
            ],
          });
        } else {
          claudeMessages.push({ role: "user", content: msg.text });
        }
      } else if (msg.role === "assistant") {
        const convPart = msg.text.split("---QUOTATION_DATA---")[0].trim();
        claudeMessages.push({ role: "assistant", content: convPart || msg.text });
      }
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: claudeMessages,
        // No web_search tool on this route
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `API ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") || "";

    let conversation = raw;
    let quotationData = null;

    if (raw.includes("---QUOTATION_DATA---")) {
      const parts = raw.split("---QUOTATION_DATA---");
      conversation = parts[0].trim();
      const jsonPart = parts[1].trim().replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try {
        quotationData = JSON.parse(jsonPart);
      } catch {
        const match = jsonPart.match(/\{[\s\S]*\}/);
        if (match) {
          try { quotationData = JSON.parse(match[0]); } catch {}
        }
      }
    }

    return NextResponse.json({ conversation, quotationData });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
