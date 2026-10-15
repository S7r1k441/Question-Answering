importScripts("providers.js", "ai.js");

chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "answer-selection",
    title: "Answer this question",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "screenshot-question",
    title: "Screenshot a question to answer",
    contexts: ["page", "image", "frame"],
  });
  if (details.reason === "install") {
    const s = await getSettings();
    if (!Object.keys(PROVIDERS).some((id) => s[`${id}Key`])) chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "answer-selection") {
    answerText(tab.id, info.selectionText || "");
  } else if (info.menuItemId === "screenshot-question") {
    startRegionSelect(tab.id);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab = tab || (await getActiveTab());
  if (!tab?.id) return;
  if (command === "answer-selection") {
    const text = await getSelectionFromTab(tab.id);
    if (text) answerText(tab.id, text);
    else sendToTab(tab.id, { type: "show-error", error: "Highlight a question first." });
  } else if (command === "screenshot-question") {
    startRegionSelect(tab.id);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // From content script: the user picked a region of the page.
  if (msg.type === "region-selected" && sender.tab) {
    answerRegion(sender.tab, msg.rect, msg.dpr);
    return false;
  }
  // From content script floating button: answer selected text.
  if (msg.type === "answer-text" && sender.tab) {
    answerText(sender.tab.id, msg.text);
    return false;
  }
  // From popup: start region selection on the active tab.
  if (msg.type === "popup-screenshot") {
    getActiveTab().then(async (tab) => {
      if (!tab?.id) return sendResponse({ ok: false, error: "No active tab." });
      const ok = await startRegionSelect(tab.id);
      sendResponse(ok ? { ok: true } : { ok: false, error: "Can't screenshot this page (Chrome blocks extensions on built-in pages). Try pasting a screenshot instead." });
    });
    return true;
  }
  // From popup: answer typed text and/or pasted image directly.
  if (msg.type === "popup-ask") {
    askAI({ text: msg.text, imageDataUrl: msg.imageDataUrl })
      .then((result) => {
        saveLast(result);
        sendResponse({ ok: true, result });
      })
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Make sure content.js is present (tabs opened before install won't have it).
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return true;
    } catch {
      return false;
    }
  }
}

async function sendToTab(tabId, msg) {
  if (await ensureContentScript(tabId)) {
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
}

async function getSelectionFromTab(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.getSelection().toString(),
    });
    return (res?.result || "").trim();
  } catch {
    return "";
  }
}

async function startRegionSelect(tabId) {
  if (!(await ensureContentScript(tabId))) return false;
  chrome.tabs.sendMessage(tabId, { type: "start-region-select" }).catch(() => {});
  return true;
}

async function answerText(tabId, text) {
  await sendToTab(tabId, { type: "show-loading", label: "Reading question…" });
  try {
    const result = await askAI({ text });
    saveLast(result);
    sendToTab(tabId, { type: "show-answer", result });
  } catch (e) {
    sendToTab(tabId, { type: "show-error", error: e.message });
  }
}

async function answerRegion(tab, rect, dpr) {
  try {
    const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    sendToTab(tab.id, { type: "show-loading", label: "Reading screenshot…" });
    const cropped = await cropImage(shot, rect, dpr);
    const result = await askAI({ imageDataUrl: cropped });
    saveLast(result);
    sendToTab(tab.id, { type: "show-answer", result, thumbnail: cropped });
  } catch (e) {
    sendToTab(tab.id, { type: "show-error", error: e.message });
  }
}

// Crop the visible-tab screenshot to the selected rect, downscaling very large crops.
async function cropImage(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const sx = Math.max(0, Math.round(rect.x * dpr));
  const sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.width * dpr));
  const sh = Math.min(bitmap.height - sy, Math.round(rect.height * dpr));
  if (sw < 5 || sh < 5) throw new Error("Selection too small — drag a bigger box.");

  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(sw, sh));
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const out = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(out);
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}

function saveLast(result) {
  chrome.storage.session.set({ lastResult: { ...result, at: Date.now() } }).catch(() => {});
}
