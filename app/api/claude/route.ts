import { NextRequest, NextResponse } from "next/server";

// TOKEN SAFETY: Hard cap on output tokens.
// Never increase above 4000 without reviewing cost impact.
// Web search is NOT enabled on this route -- use /api/sourcing for search-enabled calls.
const MAX_TOKENS_DEFAULT = 400;
const MAX_TOKENS_CAP = 4000;

export async function POST(req: NextRequest) {
  try {
    const { system, user, max_tokens = MAX_TOKENS_DEFAULT } = await req.json();

    // Enforce hard cap -- never allow callers to exceed 4000 output tokens on this route
    const safeMaxTokens = Math.min(Number(max_tokens) || MAX_TOKENS_DEFAULT, MAX_TOKENS_CAP);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: safeMaxTokens,
        system,
        messages: [{ role: "user", content: user }],
        // No web_search tool on this route -- use /api/sourcing for web-enabled calls
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `API error ${res.status}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
