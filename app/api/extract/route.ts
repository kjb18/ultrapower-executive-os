import { NextRequest, NextResponse } from "next/server";

// Token safety constants -- do not increase without reviewing usage impact
const MAX_TOKENS = 2000; // Hard cap -- no web search on this route

const EXTRACTION_PROMPT = `You are an expert at reading RFQ (Request for Quotation) documents from Philippine industrial clients. Extract ALL details from the provided document.

Return ONLY raw JSON with no markdown, no backticks, no explanation:

{
  "client": {
    "name": "company name",
    "address": "full address if visible",
    "contactPerson": "name of contact person if visible",
    "contactTitle": "title/position if visible",
    "department": "department if visible",
    "email": "email if visible",
    "phone": "phone if visible"
  },
  "rfq": {
    "number": "RFQ number or reference number if visible",
    "subject": "brief description of what they are requesting",
    "deadline": "deadline date in YYYY-MM-DD format if visible, null if not",
    "terms": {
      "delivery": "delivery terms if mentioned",
      "payment": "payment terms if mentioned",
      "warranty": "warranty requirements if mentioned",
      "validity": "validity period if mentioned"
    }
  },
  "items": [
    {
      "description": "item description exactly as written",
      "quantity": 0,
      "unit": "pcs or sets or meters etc",
      "clientPrice": 0,
      "clientPriceNote": "any price indication from the client, null if none"
    }
  ],
  "notes": "any other relevant details, special instructions, or context from the document",
  "confidence": {
    "client": "high or low",
    "items": "high or low",
    "deadline": "high or low"
  }
}

Rules:
- Extract quantities and units exactly as shown
- If a field is not visible in the document, use null or empty string
- For items, include ALL line items even if details are sparse
- The document is from a Philippine company so addresses may include Philippine locations
- Dates may be in various formats -- convert to YYYY-MM-DD
- If prices are shown, capture them in clientPrice for comparison purposes`;

export async function POST(req: NextRequest) {
  try {
    const { image, text } = await req.json();
    if (!image && !text) return NextResponse.json({ error: "No input" }, { status: 400 });

    const messages: Array<{ role: string; content: unknown }> = [];

    if (image) {
      const mediaType = image.startsWith("data:image/png") ? "image/png"
        : image.startsWith("data:image/webp") ? "image/webp"
        : "image/jpeg";
      const base64Data = image.split(",")[1] || image;
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: EXTRACTION_PROMPT + "\n\nHere is the RFQ document text:\n\n" + text,
      });
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
        messages,
        // No web_search tool on this route
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `API ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content
      ?.filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("") || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return NextResponse.json({ error: "Failed to parse extraction", raw: cleaned }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
