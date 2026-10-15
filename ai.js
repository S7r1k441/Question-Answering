// AI request helper (loaded by background.js after providers.js).

const SYSTEM_PROMPT = `You answer questions for a student. Most questions are multiple choice.

Rules:
- If answer choices are given, pick the single best one (or every correct one if the question says "select all").
- If the input is an image, read the question and choices from it carefully first.
- If no choices are given, give a short direct answer.

Reply in exactly this format and nothing else:
ANSWER: <the letter and text of the correct choice, or the short answer>
WHY: <one to three sentences explaining why>`;

// input: { text?: string, imageDataUrl?: string }
// returns: { answer, why, raw, provider, model }
async function askAI(input) {
  const settings = await getSettings();
  const id = settings.provider;
  const provider = PROVIDERS[id];
  const key = (settings[`${id}Key`] || "").trim();
  if (!key) {
    throw new Error(`No ${provider.name} API key set. Open the extension's Options and paste one (get it at ${provider.keyUrl}).`);
  }

  let image = null;
  if (input.imageDataUrl) {
    const match = input.imageDataUrl.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    if (!match) throw new Error("Couldn't read that image.");
    image = { dataUrl: input.imageDataUrl, mediaType: match[1], data: match[2] };
  }
  let model = image ? settings[`${id}VisionModel`] : settings[`${id}Model`];
  const fallbackModel = image ? provider.defaultVisionModel : provider.defaultModel;
  const text = (input.text || "").trim();
  const prompt = text ? `Question:\n${text}` : "Answer the question in this image.";

  const call = (m) => {
    if (provider.api === "gemini") return askGemini(key, m, prompt, image);
    if (provider.api === "claude") return askClaude(key, m, settings.claudeEffort, prompt, image);
    return askOpenAICompatible(provider, key, m, prompt, image);
  };

  let raw;
  try {
    raw = await call(model);
  } catch (e) {
    // The chosen model was removed or renamed: retry once with the provider's default.
    if (!e.modelNotFound || model === fallbackModel) throw e;
    model = fallbackModel;
    raw = await call(model);
  }

  return { ...parseAnswer(raw), raw, provider: provider.name, model };
}

async function postJSON(url, headers, body) {
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new Error("Network error — check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    const msg = (typeof err === "string" ? err : err?.message) || data?.message || data?.detail || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error(`API key rejected: ${msg}`);
    if (res.status === 429) throw new Error(`Rate limited — wait a bit or switch providers. (${msg})`);
    if (res.status === 404 || /model.*(not (be )?found|does not exist|decommissioned)/i.test(msg)) {
      const e = new Error(`Model not found — pick a different model in Options. (${msg})`);
      e.modelNotFound = true;
      throw e;
    }
    throw new Error(`API error: ${msg}`);
  }
  return data;
}

async function askGemini(key, model, prompt, image) {
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
  parts.push({ text: prompt });

  const data = await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "content-type": "application/json", "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
    }
  );

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this request (${data.promptFeedback.blockReason}).`);
  }
  const candidate = data.candidates?.[0];
  const out = (candidate?.content?.parts || [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("\n")
    .trim();
  if (!out) throw new Error(`Gemini returned no answer${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`);
  return out;
}

// Groq, GitHub Models, OpenRouter, Mistral all speak the OpenAI chat-completions format.
async function askOpenAICompatible(provider, key, model, prompt, image) {
  const content = [{ type: "text", text: prompt }];
  if (image) {
    content.push({
      type: "image_url",
      image_url: provider.imageUrlAsString ? image.dataUrl : { url: image.dataUrl },
    });
  }
  const headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
  if (provider === PROVIDERS.openrouter) headers["X-Title"] = "Question Answerer";

  const data = await postJSON(provider.url, headers, {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: image ? content : prompt },
    ],
  });

  const msg = data.choices?.[0]?.message;
  let out = msg?.content;
  if (Array.isArray(out)) out = out.map((c) => c.text || "").join("\n");
  out = (out || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!out) throw new Error(`${provider.name} returned no answer.`);
  return out;
}

async function askClaude(key, model, effort, prompt, image) {
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });
  content.push({ type: "text", text: prompt });

  const body = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort },
    messages: [{ role: "user", content }],
  };
  const headers = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  // Server-side fallback reroutes a declined request to another model. Not available for Haiku.
  if (!model.startsWith("claude-haiku")) {
    body.fallbacks = "default";
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }

  const data = await postJSON("https://api.anthropic.com/v1/messages", headers, body);
  if (data.stop_reason === "refusal") throw new Error("The model declined to answer this one.");
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function parseAnswer(raw) {
  const answerMatch = raw.match(/ANSWER:\s*([\s\S]*?)(?:\n\s*\**WHY:|$)/i);
  const whyMatch = raw.match(/WHY:\**\s*([\s\S]*)$/i);
  return {
    answer: answerMatch ? answerMatch[1].replace(/\*\*/g, "").trim() : raw,
    why: whyMatch ? whyMatch[1].replace(/\*\*/g, "").trim() : "",
  };
}
