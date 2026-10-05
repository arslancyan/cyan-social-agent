import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { topic } = await req.json().catch(() => ({}));
  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      source: "fallback",
      drafts: [
        { platform: "X", angle: "Hook", content: "What changed? Here’s the signal worth watching — and why it matters beyond the headline." },
        { platform: "TikTok", angle: "Explainer", content: "30-second script: lead with the surprising fact, explain the context, then end with one useful takeaway." },
        { platform: "Instagram", angle: "Carousel", content: "Slide 1: The story. Slide 2: What happened. Slide 3: Why it matters. Slide 4: What to watch next." }
      ]
    });
  }

  const prompt = [
    "You are CYAN, a responsible social media agent.",
    "Create original platform-native drafts from the supplied topic.",
    "Do not invent facts. Clearly flag unsupported claims.",
    "Return strict JSON array with platform, angle, content.",
    "Platforms: X, TikTok, Instagram.",
    "Topic:",
    topic
  ].join("\n");

  const auth = "Bearer " + apiKey;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": auth },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      input: prompt
    })
  });

  if (!response.ok) {
    return NextResponse.json({ error: "AI provider request failed" }, { status: 502 });
  }

  const data = await response.json();
  const raw = data.output_text || "[]";
  let drafts;
  try {
    drafts = JSON.parse(raw);
  } catch {
    drafts = [{ platform: "X", angle: "Draft", content: raw }];
  }

  return NextResponse.json({ drafts, source: "ai" });
}
