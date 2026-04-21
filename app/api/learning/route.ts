import { NextRequest, NextResponse } from "next/server";

// TOKEN SAFETY: Hard cap on output tokens. No web search on this route.
const MAX_TOKENS_CAP = 4000;

function avoid(usedIds: string[]) {
  return usedIds.length > 0 ? `\nAvoid these already-used topics: ${usedIds.slice(-20).join(", ")}.` : "";
}

export async function POST(req: NextRequest) {
  try {
    const { topicRequest, usedIds = [] } = await req.json();

    const systemPrompt = `You are a world-class executive learning curator for Khalil Joseph Banares, Engineering Solutions Director at Ultra Power Industrial Resources Inc., Makati Philippines. Generate a daily learning module that is immediately applicable to B2B industrial sales, procurement, leadership, or personal effectiveness.${avoid(usedIds)}`;

    const userPrompt = topicRequest
      ? `Generate a learning module on this topic: "${topicRequest}". Make it deeply relevant to industrial B2B sales in the Philippines.`
      : `Generate today's learning module. Choose a topic from: business strategy, sales psychology, negotiation, leadership, productivity, industrial/technical knowledge, or Filipino business culture. Make it practical and immediately applicable.`;

    const prompt = `${userPrompt}

Return ONLY raw JSON, no markdown fences:
{
  "id": "unique-slug-here",
  "title": "Module title",
  "subtitle": "One-line description",
  "category": "Sales|Leadership|Strategy|Productivity|Technical|Negotiation",
  "bookTitle": "Book or source title",
  "bookAuthor": "Author name",
  "bookIsbn": "ISBN if known or empty string",
  "conceptType": "pyramid|matrix|steps|cards",
  "concepts": [{"title":"Concept","description":"2-3 sentence explanation"}],
  "pullQuote": "A powerful quote from the source",
  "pullQuoteAuthor": "Quote author",
  "keyTakeaway": "Single most important lesson in 2-3 sentences",
  "applicationForKhalil": "Specific application for Ultra Power industrial sales context"
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: MAX_TOKENS_CAP,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        // No web_search tool -- learning modules use training knowledge only
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API error ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return NextResponse.json({ error: "Could not parse response" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
