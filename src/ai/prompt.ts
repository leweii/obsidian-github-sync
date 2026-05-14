import type { AISuggestionRequest } from "./AIProvider";

export const SYSTEM_PROMPT = `You resolve git merge conflicts in user notes and text files.

You receive two versions of a text fragment that conflict (Local + Remote). Output one merged version that preserves intent from both sides where possible.

Output STRICT JSON only — no markdown, no commentary, no code fences:
{
  "merged": ["line 1", "line 2", "..."],
  "reasoning": ["short bullet 1", "short bullet 2"],
  "confidence": 3,
  "picks": [0, 2]
}

Field rules:
- "merged": resulting hunk as array of lines. Match the input style/indentation. Never include conflict markers (<<<<<<<, =======, >>>>>>>).
- "reasoning": 1 to 4 concise bullets explaining the choice. Each bullet ≤ 20 words.
- "confidence": integer 0-5. 0 = no clue / contradictory; 5 = obvious merge.
- "picks": indices into the "merged" array marking lines where you made a substantive choice between Local and Remote (these get ★ in the UI). Skip context lines and common lines.

Resolution heuristics:
- Contradictory facts (different dates, numbers, claims) → prefer the side that looks newer/more specific; explain why.
- Complementary additions (each side added different new things) → include both.
- Same content, different formatting → keep one consistent format.
- One side empty → take the non-empty side.
`;

export function buildPrompt(req: AISuggestionRequest): string {
  const parts: string[] = [];

  if (req.filePath) parts.push(`File: ${req.filePath}`);

  if (req.gitMeta) {
    const meta: string[] = [];
    if (req.gitMeta.localCommit) meta.push(`local@${req.gitMeta.localCommit.slice(0, 7)}`);
    if (req.gitMeta.remoteCommit) meta.push(`remote@${req.gitMeta.remoteCommit.slice(0, 7)}`);
    if (req.gitMeta.localAuthor) meta.push(`local-author=${req.gitMeta.localAuthor}`);
    if (req.gitMeta.remoteAuthor) meta.push(`remote-author=${req.gitMeta.remoteAuthor}`);
    if (meta.length) parts.push(`Git: ${meta.join(", ")}`);
  }

  parts.push("");

  if (req.context?.before?.length) {
    parts.push("=== Context before ===");
    parts.push(req.context.before.join("\n"));
    parts.push("");
  }

  parts.push("=== Local (your version) ===");
  parts.push(req.hunk.local.length ? req.hunk.local.join("\n") : "(empty)");
  parts.push("");
  parts.push("=== Remote (incoming version) ===");
  parts.push(req.hunk.remote.length ? req.hunk.remote.join("\n") : "(empty)");

  if (req.context?.after?.length) {
    parts.push("");
    parts.push("=== Context after ===");
    parts.push(req.context.after.join("\n"));
  }

  parts.push("");
  parts.push("Resolve the conflict. Return JSON only.");
  return parts.join("\n");
}

export function parseAIResponse(content: string): {
  merged: string[];
  reasoning: string[];
  confidence: number;
  picks: number[];
} {
  // Strip code fences and any preface chatter.
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // If the model emitted text before/after the JSON, isolate the first { … } object.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let obj: any;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`AI response was not valid JSON: ${(e as Error).message}`);
  }

  const merged = Array.isArray(obj.merged)
    ? obj.merged.map(String)
    : String(obj.merged ?? "").split("\n");

  const reasoning = Array.isArray(obj.reasoning)
    ? obj.reasoning.map(String)
    : obj.reasoning
    ? [String(obj.reasoning)]
    : [];

  const confidence = clamp(Number(obj.confidence) || 0, 0, 5);

  const picks = Array.isArray(obj.picks)
    ? obj.picks.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < merged.length)
    : [];

  return { merged, reasoning, confidence, picks };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
