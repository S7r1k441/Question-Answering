const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Build one section per provider.
for (const [id, p] of Object.entries(PROVIDERS)) {
  $("provider").insertAdjacentHTML("beforeend", `<option value="${id}">${esc(p.name)} (${p.tag})</option>`);
  const options = p.models.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("");
  $("sections").insertAdjacentHTML("beforeend", `
    <fieldset id="box-${id}" hidden>
      <legend>${esc(p.name)}</legend>
      <label for="${id}Key">API key <span class="keyset" id="${id}KeySet"></span></label>
      <input id="${id}Key" type="password" placeholder="${esc(p.keyPlaceholder)}" autocomplete="off">
      <div class="hint">${esc(p.keyHint)} <a href="${p.keyUrl}" target="_blank">Get a key →</a></div>

      <label for="${id}Model">Model for highlighted / typed questions</label>
      <input id="${id}Model" list="${id}-models" placeholder="${esc(p.defaultModel)}">

      <label for="${id}VisionModel">Model for screenshots (must support images)</label>
      <input id="${id}VisionModel" list="${id}-models" placeholder="${esc(p.defaultVisionModel)}">
      <datalist id="${id}-models">${options}</datalist>
      <div class="hint">${p.models.map((m) => `<b>${esc(m.id)}</b> — ${esc(m.label.split(" — ")[1] || "")}`).join("<br>")}</div>
      ${p.modelsUrl ? `<button class="ghost" id="${id}Load" type="button">Load free models</button><div class="hint" id="${id}LoadOut"></div>` : ""}
      ${p.hasEffort ? `
        <label for="claudeEffort">Effort</label>
        <select id="claudeEffort">
          <option value="low">Low — quickest answers</option>
          <option value="medium">Medium — balanced (recommended)</option>
          <option value="high">High — think harder on tricky questions</option>
        </select>` : ""}
    </fieldset>`);
}

function showProviderBox() {
  for (const id of Object.keys(PROVIDERS)) $(`box-${id}`).hidden = id !== $("provider").value;
}

function fieldIds() {
  const ids = ["provider", "claudeEffort"];
  for (const id of Object.keys(PROVIDERS)) ids.push(`${id}Key`, `${id}Model`, `${id}VisionModel`);
  return ids;
}

getSettings().then((s) => {
  for (const f of fieldIds()) if ($(f)) $(f).value = s[f] ?? "";
  for (const id of Object.keys(PROVIDERS)) if (s[`${id}Key`]) $(`${id}KeySet`).textContent = "✓ saved";
  showProviderBox();
});

$("provider").onchange = showProviderBox;

// OpenRouter: fetch the live list of free models and add them to the suggestions.
for (const [id, p] of Object.entries(PROVIDERS)) {
  if (!p.modelsUrl) continue;
  $(`${id}Load`).onclick = async () => {
    const out = $(`${id}LoadOut`);
    out.textContent = "Loading…";
    try {
      const data = await (await fetch(p.modelsUrl)).json();
      const free = (data.data || []).filter((m) => m.id.endsWith(":free"));
      const vision = (m) => (m.architecture?.input_modalities || []).includes("image");
      $(`${id}-models`).innerHTML = free
        .map((m) => `<option value="${esc(m.id)}">${esc(m.name || m.id)}${vision(m) ? " — reads screenshots" : ""}</option>`)
        .join("");
      out.innerHTML = `${free.length} free models loaded — click a model box to pick one. 📷 = reads screenshots:<br>` +
        free.map((m) => `${vision(m) ? "📷 " : ""}${esc(m.id)}`).join("<br>");
    } catch {
      out.textContent = "Couldn't load the model list.";
    }
  };
}

$("save").onclick = async () => {
  const values = {};
  for (const f of fieldIds()) if ($(f)) values[f] = $(f).value.trim();
  await chrome.storage.local.set(values);
  for (const id of Object.keys(PROVIDERS)) $(`${id}KeySet`).textContent = values[`${id}Key`] ? "✓ saved" : "";
  $("status").textContent = "Saved ✓";
  setTimeout(() => ($("status").textContent = ""), 2000);
};
