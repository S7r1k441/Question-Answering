// Injected into pages: answer panel, region selector, and "Ask AI" button on highlight.
(() => {
  if (window.__qaLoaded) return;
  window.__qaLoaded = true;

  const ACCENT = "#e5383b";
  let host, shadow, panel, askBtn;

  function ensureUI() {
    if (host) return;
    host = document.createElement("div");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
        .panel {
          position: fixed; top: 16px; right: 16px; width: 340px; max-width: calc(100vw - 32px);
          background: #17171a; color: #f2f2f2; border-radius: 12px; border-top: 4px solid ${ACCENT};
          box-shadow: 0 10px 40px rgba(0,0,0,.45); padding: 14px 16px 16px; display: none;
          font-size: 14px; line-height: 1.45;
        }
        .panel.show { display: block; animation: pop .15s ease-out; }
        @keyframes pop { from { transform: translateY(-6px); opacity: 0; } to { transform: none; opacity: 1; } }
        .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: move; user-select: none; }
        .title { font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: ${ACCENT}; }
        .x { background: none; border: none; color: #aaa; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 2px; }
        .x:hover { color: #fff; }
        .answer { font-size: 18px; font-weight: 700; color: #fff; margin: 4px 0 8px; word-wrap: break-word; }
        .why { color: #c8c8cc; font-size: 13px; }
        .via { color: #6f6f78; font-size: 11px; margin-top: 8px; }
        .err { color: #ff8a8c; }
        .thumb { max-width: 100%; max-height: 120px; border-radius: 6px; margin-top: 10px; opacity: .85; display: block; }
        .row { display: flex; gap: 8px; margin-top: 12px; }
        .btn { background: #2a2a30; color: #eee; border: 1px solid #3a3a42; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; }
        .btn:hover { border-color: ${ACCENT}; }
        .spin { width: 18px; height: 18px; border: 2px solid #444; border-top-color: ${ACCENT}; border-radius: 50%; animation: s .7s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
        @keyframes s { to { transform: rotate(360deg); } }
        .ask {
          position: fixed; display: none; background: ${ACCENT}; color: #fff; border: none; border-radius: 999px;
          padding: 5px 11px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.3);
        }
        .ask:hover { filter: brightness(1.1); }
        .overlay { position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.25); }
        .box { position: fixed; border: 2px solid ${ACCENT}; background: rgba(229,56,59,.12); box-shadow: 0 0 0 9999px rgba(0,0,0,.35); }
        .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #17171a; color: #fff;
          padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 4px 20px rgba(0,0,0,.4); pointer-events: none; }
      </style>
      <div class="panel"></div>
      <button class="ask" title="Answer this question">Ask AI</button>
    `;
    panel = shadow.querySelector(".panel");
    askBtn = shadow.querySelector(".ask");
    askBtn.addEventListener("mousedown", (e) => e.preventDefault());
    askBtn.addEventListener("click", () => {
      const text = window.getSelection().toString().trim();
      hideAsk();
      if (text) chrome.runtime.sendMessage({ type: "answer-text", text });
    });
    makeDraggable();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showPanel(inner) {
    ensureUI();
    panel.innerHTML = `
      <div class="head"><span class="title">Question Answerer</span><button class="x" title="Close">×</button></div>
      ${inner}`;
    panel.querySelector(".x").onclick = () => panel.classList.remove("show");
    panel.classList.add("show");
  }

  function showLoading(label) {
    showPanel(`<div><span class="spin"></span>${esc(label || "Thinking…")}</div>`);
  }

  function showAnswer(result, thumbnail) {
    showPanel(`
      <div class="answer">${esc(result.answer)}</div>
      ${result.why ? `<div class="why">${esc(result.why)}</div>` : ""}
      ${thumbnail ? `<img class="thumb" src="${thumbnail}" alt="">` : ""}
      ${result.model ? `<div class="via">via ${esc(result.provider)} · ${esc(result.model)}</div>` : ""}
      <div class="row"><button class="btn copy">Copy answer</button></div>`);
    panel.querySelector(".copy").onclick = (e) => {
      navigator.clipboard.writeText(result.answer).then(() => (e.target.textContent = "Copied!"));
    };
  }

  function showError(error) {
    showPanel(`<div class="err">${esc(error)}</div>`);
  }

  function makeDraggable() {
    let dx = 0, dy = 0, dragging = false;
    panel.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".head") || e.target.closest(".x")) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.left = `${Math.max(0, e.clientX - dx)}px`;
      panel.style.top = `${Math.max(0, e.clientY - dy)}px`;
      panel.style.right = "auto";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  }

  // ---- Floating "Ask AI" button when text is highlighted ----
  function hideAsk() {
    if (askBtn) askBtn.style.display = "none";
  }

  document.addEventListener("mouseup", (e) => {
    if (host && e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (!text || text.length < 3 || sel.rangeCount === 0) return hideAsk();
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return hideAsk();
      ensureUI();
      askBtn.style.display = "block";
      askBtn.style.top = `${Math.min(window.innerHeight - 36, rect.bottom + 6)}px`;
      askBtn.style.left = `${Math.min(window.innerWidth - 80, Math.max(4, rect.right - 60))}px`;
    }, 0);
  });
  document.addEventListener("mousedown", (e) => {
    if (host && e.composedPath().includes(host)) return;
    hideAsk();
  });
  window.addEventListener("scroll", hideAsk, { passive: true });

  // ---- Region selection for screenshots ----
  function startRegionSelect() {
    ensureUI();
    hideAsk();
    panel.classList.remove("show");
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `<div class="hint">Drag a box around the question · Esc to cancel</div>`;
    shadow.appendChild(overlay);

    let start = null, box = null;
    const cleanup = () => {
      overlay.remove();
      window.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cleanup(); }
    };
    window.addEventListener("keydown", onKey, true);

    overlay.addEventListener("mousedown", (e) => {
      start = { x: e.clientX, y: e.clientY };
      box = document.createElement("div");
      box.className = "box";
      overlay.appendChild(box);
      overlay.style.background = "transparent";
      overlay.querySelector(".hint").style.display = "none";
      e.preventDefault();
    });
    overlay.addEventListener("mousemove", (e) => {
      if (!start) return;
      const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
      Object.assign(box.style, {
        left: `${x}px`, top: `${y}px`,
        width: `${Math.abs(e.clientX - start.x)}px`, height: `${Math.abs(e.clientY - start.y)}px`,
      });
    });
    overlay.addEventListener("mouseup", (e) => {
      if (!start) return;
      const rect = {
        x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY),
        width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y),
      };
      cleanup();
      if (rect.width < 10 || rect.height < 10) return;
      // Wait two frames so the overlay is gone before the screenshot is taken.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: "region-selected", rect, dpr: window.devicePixelRatio || 1 });
      }));
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case "ping": sendResponse({ ok: true }); break;
      case "start-region-select": startRegionSelect(); break;
      case "show-loading": showLoading(msg.label); break;
      case "show-answer": showAnswer(msg.result, msg.thumbnail); break;
      case "show-error": showError(msg.error); break;
    }
  });
})();
