# Question Answerer (Chrome extension)

Highlight a question or screenshot it, and AI answers it. Tuned for multiple choice.
Works with several AI providers — pick one (or set up a few and switch from the popup):

| Provider | Cost | Get a key |
|---|---|---|
| Google Gemini (default) | free | https://aistudio.google.com/apikey |
| GitHub Models (GPT-4.1 / GPT-4o) | free with a GitHub account | https://github.com/settings/personal-access-tokens/new → Account permissions → **Models: Read-only** |
| Groq (GPT-OSS 120B, Llama 4) | free, very fast | https://console.groq.com/keys |
| OpenRouter (`:free` models) | free | https://openrouter.ai/settings/keys |
| Mistral | free "Experiment" plan | https://console.mistral.ai/api-keys |
| Anthropic Claude | paid | https://console.anthropic.com/settings/keys |

Each provider has two model boxes: one for text questions and one for screenshots (needs a model that can read images). Any model ID works; the suggestions are just a starting point. OpenRouter has a **Load free models** button that pulls the current free list.

## Install
1. Open `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder.
3. The settings page opens. Pick a provider, get a key from the table above, paste it, and click **Save**.

## Use
- **Highlight text** → click the red **Ask AI** button that pops up, or right-click → **Answer this question**, or press **Alt+Shift+A**.
- **Screenshot** → press **Alt+Shift+S**, right-click → **Screenshot a question to answer**, or click the extension icon → **📸 Screenshot a question**. Drag a box around the question.
- **Paste / upload** → open the extension popup and paste an image (Ctrl+V), drag one in, or click **Upload image**. You can also type a question.

The answer shows in a panel in the top-right corner of the page (drag it by the header to move it).

## Settings
- **Active provider** (also switchable from the popup's dropdown).
- Per provider: API key, text model, screenshot model. Claude also has **Effort** (low / medium / high).

Shortcuts can be changed at `chrome://extensions/shortcuts`.

## Files
- `manifest.json` — MV3 manifest
- `providers.js` — provider catalog (URLs, key links, suggested models) + settings
- `ai.js` — API calls (Gemini, Claude, OpenAI-compatible for the rest) + answer parsing
- `background.js` — context menus, shortcuts, screenshot capture + cropping
- `content.js` — on-page answer panel, Ask AI button, region selector
- `popup.*` — popup for screenshots, pasting images, typing questions
- `options.*` — API key / model / effort settings
