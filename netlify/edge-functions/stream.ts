// netlify/edge-functions/stream.ts
// Streams text using a model directly (fallback: no vector dataset).
// Requires: OPENAI_API_KEY in your Netlify env.

export default async (req: Request) => {
  const url = new URL(req.url);

  const key = Deno.env.get("OPENAI_API_KEY") || "";
  const org = Deno.env.get("OPENAI_ORG_ID") || ""; // optional
  const prompt = url.searchParams.get("prompt") ?? "make a contraddictory short sentence composed by two atomic propositions about art and its essence";

  // Persona copied from your assistant:
  const systemInstruction = "make a contraddictory short sentence composed by two atomic propositions about art and its essence. here are some examples: A monochrome surface contains every color. The sculpture exists only when unseen. This drawing erases itself as it is made. A closed space remains fully accessible. The work changes only when it stays the same. A single point covers the whole wall. The empty frame completes the image. A straight line bends around itself. The title describes what the work is not. The installation expands by being removed. The material is immaterial. The visible part is entirely hidden. This performance occurs without happening. The original is identical to its copy. The text reads what is not written. This object is heavier than itself. The audience completes a work that is already finished. The concept exists without being conceived. Every mark on the page is blank. The frame surrounds nothing and contains everything. This image is smaller than its detail. The negative space occupies more than the object. A permanent work exists only temporarily. The idea is finished when it begins. This space is both empty and full. The work exists only as its documentation. The image is composed entirely of what is missing. The projection illuminates darkness without light. The sequence begins at its conclusion. This surface is both opaque and transparent. The act of looking removes the work from view. ";
  const model = "gpt-4.1"; // Responses-compatible (you can use "gpt-4o" or "gpt-4o-mini" too)

  const sse = (o: any) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`;
  const sseError = (msg: string) =>
    new Response(sse({ error: msg }) + sse("[DONE]"), {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });

  if (!key) return sseError("Missing OPENAI_API_KEY");

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (org) headers["OpenAI-Organization"] = org;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        stream: true,
      }),
    });
  } catch (e) {
    return sseError(`Network error: ${String(e)}`);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return sseError(`Upstream error ${upstream.status}: ${text}`);
  }

  const body = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const enc = new TextEncoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.enqueue(enc.encode(sse("[DONE]")));
      } catch (e) {
        controller.enqueue(enc.encode(sse({ error: String(e) })));
        controller.enqueue(enc.encode(sse("[DONE]")));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8", // 👈 fixes mojibake
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = { path: "/stream" };
