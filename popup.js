const $ = (id) => document.getElementById(id);
let imageDataUrl = null;

$("settings").onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

$("shot").onclick = async () => {
  const res = await chrome.runtime.sendMessage({ type: "popup-screenshot" });
  if (res?.ok) window.close();
  else showError(res?.error || "Couldn't start screenshot.");
};

$("ask").onclick = async () => {
  const text = $("q").value.trim();
  if (!text && !imageDataUrl) return showError("Type a question or paste a screenshot first.");
  $("ask").disabled = true;
  $("ask").textContent = "Thinking…";
  showOut(`<div class="why">Working on it…</div>`);
  const res = await chrome.runtime.sendMessage({ type: "popup-ask", text, imageDataUrl });
  $("ask").disabled = false;
  $("ask").textContent = "Answer";
  if (res?.ok) showResult(res.result);
  else showError(res?.error || "Something went wrong.");
};

$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("ask").click();
});

// Paste a screenshot with Ctrl+V anywhere in the popup.
document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) {
    e.preventDefault();
    loadImageFile(item.getAsFile());
  }
});

// Drag & drop an image.
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
  if (file) loadImageFile(file);
});

$("file").onchange = (e) => {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
  e.target.value = "";
};

$("clearImg").onclick = () => {
  imageDataUrl = null;
  $("imgWrap").hidden = true;
};

// Normalize any image to PNG and cap its size so the request stays small.
function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1568;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      imageDataUrl = canvas.toDataURL("image/png");
      $("img").src = imageDataUrl;
      $("imgWrap").hidden = false;
    };
    img.onerror = () => showError("Couldn't read that image.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showOut(html) {
  $("out").innerHTML = html;
  $("out").hidden = false;
}

function showResult(r) {
  showOut(`<div class="answer">${esc(r.answer)}</div>${r.why ? `<div class="why">${esc(r.why)}</div>` : ""}` +
    (r.model ? `<div class="via">via ${esc(r.provider)} · ${esc(r.model)}</div>` : ""));
}

// Provider quick-switch. Providers without a saved key are marked.
getSettings().then((s) => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const opt = new Option(`${p.name}${s[`${id}Key`] ? "" : " (no key)"}`, id);
    $("provider").add(opt);
  }
  $("provider").value = s.provider;
});
$("provider").onchange = () => chrome.storage.local.set({ provider: $("provider").value });

function showError(msg) {
  showOut(`<div class="err">${esc(msg)}</div>`);
}

// Show the most recent answer (e.g. from a screenshot taken a moment ago).
chrome.storage.session.get("lastResult").then(({ lastResult }) => {
  if (lastResult && Date.now() - lastResult.at < 10 * 60 * 1000 && $("out").hidden) showResult(lastResult);
}).catch(() => {});
