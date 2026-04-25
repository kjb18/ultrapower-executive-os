import { NextRequest, NextResponse } from "next/server";

// TOKEN SAFETY: Max 2 web searches, max_tokens 1000 -- image search is lightweight
export async function POST(req: NextRequest) {
  try {
    const { topic } = await req.json();
    if (!topic) return NextResponse.json({ error: "No topic" }, { status: 400 });

    const prompt = `Search for 5 high-quality royalty-free images suitable for a professional B2B article about: "${topic}"

Search Unsplash (unsplash.com) and Pexels (pexels.com) for relevant images. Return ONLY raw JSON, no markdown:

{
  "images": [
    {
      "url": "direct image URL ending in .jpg or .png",
      "thumb": "thumbnail URL if available, otherwise same as url",
      "description": "brief description of what the image shows",
      "source": "Unsplash or Pexels",
      "credit": "photographer name if available"
    }
  ]
}

Requirements:
- Images must be royalty-free and suitable for commercial use
- Prefer industrial, professional, or business-related imagery
- Direct image URLs only -- must end in .jpg, .jpeg, or .png
- No watermarked images`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `API error ${res.status}: ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content?.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("") || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return NextResponse.json({ images: [] });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
