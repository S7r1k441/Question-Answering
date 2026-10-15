// AI provider catalog, shared by the background worker, popup, and options page.
// Each provider stores `<id>Key`, `<id>Model` (text questions) and `<id>VisionModel` (screenshots).
// Model fields accept any model ID; the lists below are just suggestions.

const PROVIDERS = {
  gemini: {
    name: "Google Gemini",
    tag: "free",
    api: "gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "Free — sign in with a Google account and click \"Create API key\".",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-pro-latest",
    defaultVisionModel: "gemini-pro-latest",
    models: [
      { id: "gemini-pro-latest", label: "Gemini Pro (latest) — smartest, tighter free limits" },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest) — fast, generous free tier" },
    ],
  },
  github: {
    name: "GitHub Models (GPT-4.1)",
    tag: "free",
    api: "openai",
    url: "https://models.github.ai/inference/chat/completions",
    keyUrl: "https://github.com/settings/personal-access-tokens/new",
    keyHint: "Free with any GitHub account. Create a fine-grained token; under Permissions → Account permissions set \"Models\" to Read-only.",
    keyPlaceholder: "github_pat_...",
    defaultModel: "openai/gpt-4.1",
    defaultVisionModel: "openai/gpt-4.1",
    models: [
      { id: "openai/gpt-4.1", label: "GPT-4.1 — strong, reads screenshots" },
      { id: "openai/gpt-4o", label: "GPT-4o — reads screenshots" },
      { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini — faster, higher free limits" },
    ],
  },
  groq: {
    name: "Groq",
    tag: "free",
    api: "openai",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyUrl: "https://console.groq.com/keys",
    keyHint: "Free — sign up and click \"Create API Key\". Very fast.",
    keyPlaceholder: "gsk_...",
    defaultModel: "openai/gpt-oss-120b",
    defaultVisionModel: "qwen/qwen3.8-27b",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B — best for text questions (no images)" },
      { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B — reads screenshots" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B — text only" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B — faster, text only" },
    ],
    retired: ["meta-llama/llama-4-maverick-17b-128e-instruct", "meta-llama/llama-4-scout-17b-16e-instruct"],
  },
  openrouter: {
    name: "OpenRouter (free models)",
    tag: "free",
    api: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyHint: "Free — sign up and create a key. Model IDs ending in \":free\" cost nothing. Use \"Load free models\" to see the current list.",
    keyPlaceholder: "sk-or-...",
    defaultModel: "google/gemma-3-27b-it:free",
    defaultVisionModel: "google/gemma-3-27b-it:free",
    models: [
      { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B — reads screenshots" },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 — strong reasoning, text only" },
    ],
    retired: ["meta-llama/llama-4-maverick:free", "meta-llama/llama-4-scout:free"],
  },
  mistral: {
    name: "Mistral",
    tag: "free",
    api: "openai",
    url: "https://api.mistral.ai/v1/chat/completions",
    imageUrlAsString: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    keyHint: "Free \"Experiment\" plan — sign up, verify a phone number, then create a key.",
    keyPlaceholder: "",
    defaultModel: "mistral-medium-latest",
    defaultVisionModel: "mistral-medium-latest",
    models: [
      { id: "mistral-medium-latest", label: "Mistral Medium — reads screenshots" },
      { id: "mistral-small-latest", label: "Mistral Small — faster, reads screenshots" },
      { id: "mistral-large-latest", label: "Mistral Large" },
    ],
  },
  claude: {
    name: "Anthropic Claude",
    tag: "paid",
    api: "claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "Paid, pay-as-you-go. Most accurate option.",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-opus-5-5",
    defaultVisionModel: "claude-opus-5-5",
    hasEffort: true,
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 — most accurate" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — faster, cheaper" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — fastest, cheapest" },
    ],
  },
};

const DEFAULT_PROVIDER = "gemini";

function defaultSettings() {
  const s = { provider: DEFAULT_PROVIDER, claudeEffort: "medium" };
  for (const [id, p] of Object.entries(PROVIDERS)) {
    s[`${id}Key`] = "";
    s[`${id}Model`] = p.defaultModel;
    s[`${id}VisionModel`] = p.defaultVisionModel;
  }
  return s;
}

async function getSettings() {
  const defaults = defaultSettings();
  const stored = await chrome.storage.local.get(defaults);
  // Blank or retired model fields fall back to the defaults.
  for (const k of Object.keys(defaults)) if (stored[k] === "" && !k.endsWith("Key")) stored[k] = defaults[k];
  for (const [id, p] of Object.entries(PROVIDERS)) {
    for (const k of [`${id}Model`, `${id}VisionModel`]) {
      if ((p.retired || []).includes(stored[k])) stored[k] = defaults[k];
    }
  }
  if (!PROVIDERS[stored.provider]) stored.provider = DEFAULT_PROVIDER;
  return { ...defaults, ...stored };
}
