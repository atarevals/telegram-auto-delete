// ==UserScript==
// @name         Telegram Chat Cleaner Pro
// @namespace    https://www.github.com/atarevals
// @version      4.0
// @description  Advanced bulk chat deletion — filter by type, scan all (lazy-load), preview every chat, deselect keepers, then delete one by one
// @author       atarevals
// @match        https://web.telegram.org/*
// @grant        none
// ==/UserScript==

(async () => {
  "use strict";

  // ══════════════════════════════════════════════════════════════
  //  UTILITIES
  // ══════════════════════════════════════════════════════════════

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log("%c[TG-CLEANER v4]", "color:#3390ec;font-weight:bold;", ...a);
  const warn = (...a) => console.warn("%c[TG-CLEANER v4]", "color:#f0a050;font-weight:bold;", ...a);
  const err = (...a) => console.error("%c[TG-CLEANER v4]", "color:#e05555;font-weight:bold;", ...a);

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ══════════════════════════════════════════════════════════════
  //  CONSTANTS & ICONS
  // ══════════════════════════════════════════════════════════════

  // These names are ALWAYS protected — never deleted under any circumstances
  const PROTECTED = ["saved messages", "telegram", "telegram tips", "telegramtips"];

  const SVG_PATHS = {
    dm: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
    group: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    channel: `<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>`,
    bot: `<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/>`,
    unknown: `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    trash: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>`,
    scan: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
    shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
    check: `<polyline points="20 6 9 17 4 12"/>`,
    warn: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    close: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
    pause: `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`,
    play: `<polygon points="5 3 19 12 5 21 5 3"/>`,
    stop: `<rect x="3" y="3" width="18" height="18" rx="2"/>`,
    refresh: `<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>`,
    back: `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
  };

  function icon(name, size = 16, color = "currentColor") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0;">${SVG_PATHS[name] || ""}</svg>`;
  }

  // ══════════════════════════════════════════════════════════════
  //  DOM HELPERS
  // ══════════════════════════════════════════════════════════════

  function isProtectedName(name) {
    const n = (name || "").toLowerCase().trim();
    return PROTECTED.some((p) => n === p || n.startsWith(p + " "));
  }

  function getChatName(el) {
    // Try several Telegram Web K selectors in priority order
    for (const sel of [".fullName", "h3", '[class*="title"]:not([class*="subtitle"])', '[class*="peer-title"]']) {
      const node = el.querySelector(sel);
      const text = node?.innerText?.trim();
      if (text && text.length > 0 && text.length < 120) return text;
    }
    //
    // Fallback: first non-empty line
    return (
      (el.innerText || "")
        .split("\n")
        .map((s) => s.trim())
        .find((s) => s.length > 0) || "(Unknown)"
    );
  }

  function getPeerId(el) {
    // 1) Direct/ancestor datasets (fast path)
    const host = el.closest("[data-peer-id]") || el.closest("[data-list-item-id]");
    const direct = host?.dataset?.peerId || host?.dataset?.listItemId;
    if (direct) return String(direct);

    // 2) Nested descendants often carry peer id (e.g. Deleted Account avatar)
    const nested = el.querySelector("[data-peer-id], [data-list-item-id]");
    const nestedId = nested?.dataset?.peerId || nested?.dataset?.listItemId;
    if (nestedId) return String(nestedId);

    // 3) Telegram links usually look like href="#7381737019"
    const link = el.matches("a") ? el : el.querySelector("a[href]");
    const href = link?.getAttribute("href") || "";
    const m = href.match(/^#(-?\d+)$/);
    if (m) return m[1];

    return null;
  }

  function detectTypeFromDOM(el) {
    const peerId = parseInt(getPeerId(el) || "0", 10);

    // 1. Check subtitle / status text for keywords
    const subtitleEl = el.querySelector('.subtitle, .status, [class*="subtitle"], [class*="status"]');
    const subtitle = (subtitleEl?.innerText || "").toLowerCase();

    // 2. Check SVG <use> hrefs (Telegram uses icon sprites)
    const svgUse = el.querySelector("use");
    const href = svgUse?.getAttribute("href") || svgUse?.getAttribute("xlink:href") || "";

    if (href.includes("bot") || subtitle.includes("bot")) return "bot";
    if (href.includes("channel") || subtitle.includes("subscriber")) return "channel";
    if (href.includes("group") || subtitle.includes("member")) return "group";

    // 3. Telegram internal peer ID ranges
    if (!isNaN(peerId)) {
      if (peerId < -1_000_000_000) return "channel"; // supergroups / channels
      if (peerId < 0) return "group";
    }

    return "dm";
  }

  /** Find the scrollable container of the left-panel chat list */
  function getChatListScroller() {
    const chatList = document.querySelector(".chat-list");
    if (!chatList) return null;

    // Check known Telegram Web K scroller class names first
    const knownSelectors = [
      ".chatlist-container",
      ".scrollable-y",
      ".chats-container .scrollable",
      ".sidebar-left .scrollable",
      ".sidebar-left-section .scrollable",
    ];
    for (const sel of knownSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 10) return el;
    }

    // Walk up the DOM from .chat-list
    let el = chatList.parentElement;
    while (el && el !== document.body) {
      const ov = getComputedStyle(el).overflowY;
      if ((ov === "auto" || ov === "scroll") && el.scrollHeight > el.clientHeight + 10) return el;
      el = el.parentElement;
    }
    // Last resort: return direct parent
    return chatList.parentElement;
  }

  /** Force the chat list to the top, retrying for virtualized list re-renders */
  async function scrollChatsToTop(maxPasses = 14, waitMs = 220) {
    let stableAtTop = 0;
    for (let i = 0; i < maxPasses; i++) {
      const scroller = getChatListScroller();
      const chatList = document.querySelector(".chat-list");

      if (scroller) {
        scroller.scrollTop = 0;
        scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      }

      // Also try bringing the first rendered chat into view
      const firstChat = chatList?.querySelector(".Chat:first-child") || chatList?.querySelector(".Chat");
      if (firstChat) firstChat.scrollIntoView({ block: "start" });

      await delay(waitMs);

      const topNow = scroller?.scrollTop ?? 0;
      if (topNow <= 2) stableAtTop++;
      else stableAtTop = 0;

      if (stableAtTop >= 3) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  //  SCANNER  — scrolls to bottom (handles lazy loading), collects all chats
  // ══════════════════════════════════════════════════════════════

  /** Harvest all currently rendered chat elements */
  function harvestChats(seen, found) {
    const chatEls = [...document.querySelectorAll(".chat-list .Chat a.ListItem-button, .chat-list .Chat .ListItem-button")];
    for (const el of chatEls) {
      const name = getChatName(el);
      if (!name || name === "(Unknown)") continue;
      if (isProtectedName(name)) continue;
      const peerId = getPeerId(el);
      const key = peerId ? `p:${peerId}` : `n:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ name, type: detectTypeFromDOM(el), key, selected: true });
      }
    }
  }

  async function scanAllChats(onProgress) {
    let scroller = getChatListScroller();

    // Start from top
    if (scroller) {
      scroller.scrollTop = 0;
      await delay(700);
    }

    const seen = new Set();
    const found = [];
    let stableRounds = 0;
    let lastCount = 0;
    let pass = 0;
    const MAX_PASSES = 600;
    const STABLE_THRESHOLD = 10; // require 10 stable passes before stopping
    const SCROLL_DELAY = 900; // ms between scroll attempts

    while (pass < MAX_PASSES) {
      pass++;

      // Re-detect scroller each pass in case the DOM changed
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 10) {
        scroller = getChatListScroller();
      }

      harvestChats(seen, found);
      onProgress?.(found.length, pass);

      // Stability check
      if (found.length === lastCount) {
        stableRounds++;
        if (stableRounds >= STABLE_THRESHOLD) {
          log(`Scan stable at ${found.length} chats after ${pass} scroll passes`);
          break;
        }
      } else {
        stableRounds = 0;
        lastCount = found.length;
      }

      // Multi-method scroll to trigger Telegram's lazy loading
      if (scroller) {
        // Method 1: jump to bottom
        scroller.scrollTop = scroller.scrollHeight;
      }
      // Method 2: scroll last visible chat into view
      const lastChat = document.querySelector(".chat-list .Chat:last-child");
      if (lastChat) lastChat.scrollIntoView({ block: "end" });

      // Method 3: fire keyboard End key on the scroller
      const target = scroller || document.querySelector(".chat-list");
      if (target) {
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      }

      await delay(SCROLL_DELAY);
    }

    // Return to top so deletion can start from position 0
    if (scroller) {
      /// retry to scroll top and attempt becouse telegram is lazy loading
      await scrollChatsToTop(30, 300);
    }

    log(`Scan complete — ${found.length} chats`);
    return found;
  }

  // ══════════════════════════════════════════════════════════════
  //  STYLES
  // ══════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById("tgc-styles")) return;
    const s = document.createElement("style");
    s.id = "tgc-styles";
    s.textContent = `
      /* ── Reset & root ───────────────────────────────────── */
      #tgc-root, #tgc-root * { box-sizing: border-box; }
      #tgc-root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                     "Helvetica Neue", Arial, sans-serif;
      }

      /* ── Buttons ─────────────────────────────────────────── */
      .tgc-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        border: none; border-radius: 9px; padding: 10px 20px;
        font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap;
        transition: background 0.18s, transform 0.12s, opacity 0.18s;
        outline: none; line-height: 1.3;
      }
      .tgc-btn:active  { transform: scale(0.96); }
      .tgc-btn:disabled { opacity: 0.38; cursor: not-allowed; transform: none !important; pointer-events: none; }

      .tgc-btn-primary   { background: #3390ec; color: #fff; }
      .tgc-btn-primary:hover   { background: #55a7ff; }
      .tgc-btn-danger    { background: #b93330; color: #fff; }
      .tgc-btn-danger:hover    { background: #d94040; }
      .tgc-btn-secondary { background: #1b3550; color: #9ec8ef; }
      .tgc-btn-secondary:hover { background: #2a4f72; color: #d0e8ff; }
      .tgc-btn-ghost     { background: transparent; color: #7a9ab8; border: 1px solid #253a4e; }
      .tgc-btn-ghost:hover     { background: #182840; color: #c0d8ef; }
      .tgc-btn-success   { background: #22723a; color: #fff; }
      .tgc-btn-success:hover   { background: #2d9050; }

      /* ── Toggle switch ───────────────────────────────────── */
      .tgc-toggle          { position: relative; display: inline-block; width: 46px; height: 26px; flex-shrink: 0; }
      .tgc-toggle input    { opacity: 0; width: 0; height: 0; }
      .tgc-slider          { position: absolute; inset: 0; background: #1e3450; border-radius: 26px;
                             cursor: pointer; transition: background 0.25s; }
      .tgc-slider::before  { content: ''; position: absolute; width: 20px; height: 20px;
                             left: 3px; top: 3px; background: #55718e; border-radius: 50%;
                             transition: transform 0.25s, background 0.25s; }
      .tgc-toggle input:checked + .tgc-slider              { background: #3390ec; }
      .tgc-toggle input:checked + .tgc-slider::before      { transform: translateX(20px); background: #fff; }

      /* ── Input ───────────────────────────────────────────── */
      .tgc-input {
        background: #0c1826; border: 1px solid #253a4e; border-radius: 8px;
        color: #daeaf8; padding: 9px 14px; font-size: 14px; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s; width: 100%;
      }
      .tgc-input:focus { border-color: #3390ec; box-shadow: 0 0 0 3px rgba(51,144,236,0.18); }
      .tgc-input::placeholder { color: #3a5570; }

      /* ── Tab bar ─────────────────────────────────────────── */
      .tgc-tab {
        padding: 6px 12px; border-radius: 7px; font-size: 13px; font-weight: 500;
        cursor: pointer; border: none; background: transparent; color: #7a9ab8;
        transition: all 0.16s; display: inline-flex; align-items: center; gap: 5px;
      }
      .tgc-tab.active  { background: #1e3450; color: #d0e8ff; }
      .tgc-tab:hover:not(.active) { background: #141f2e; color: #aac8e0; }

      /* ── Scrollbar ───────────────────────────────────────── */
      .tgc-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: #253a4e transparent; }
      .tgc-scroll::-webkit-scrollbar       { width: 4px; }
      .tgc-scroll::-webkit-scrollbar-thumb { background: #253a4e; border-radius: 2px; }

      /* ── Animations ──────────────────────────────────────── */
      @keyframes tgc-spin    { to { transform: rotate(360deg); } }
      @keyframes tgc-fade    { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      @keyframes tgc-pulse   { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
      @keyframes tgc-shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }

      .tgc-spinner {
        border: 3px solid #1a3050; border-top-color: #3390ec; border-radius: 50%;
        animation: tgc-spin 0.7s linear infinite; flex-shrink: 0;
      }
      .tgc-fade   { animation: tgc-fade  0.28s cubic-bezier(.22,.68,0,1.2) both; }
      .tgc-pulse  { animation: tgc-pulse 1.6s ease-in-out infinite; }

      /* ── Chat row ────────────────────────────────────────── */
      .tgc-chat-row {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 12px; border-radius: 9px; cursor: pointer;
        transition: background 0.14s; user-select: none;
      }
      .tgc-chat-row:hover { background: #121f30; }
      .tgc-chat-row.deselected { opacity: 0.32; }

      /* ── Checkbox ────────────────────────────────────────── */
      .tgc-cb {
        width: 18px; height: 18px; border-radius: 5px; border: 2px solid #3390ec;
        background: transparent; flex-shrink: 0; display: flex;
        align-items: center; justify-content: center; transition: all 0.17s;
      }
      .tgc-cb.on { background: #3390ec; border-color: #3390ec; }
      .tgc-cb.on::after {
        content: ''; width: 10px; height: 5px;
        border-left: 2.5px solid #fff; border-bottom: 2.5px solid #fff;
        transform: rotate(-45deg) translateY(-1px); display: block;
      }

      /* ── Type badge ──────────────────────────────────────── */
      .tgc-badge {
        font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
        flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px;
        text-transform: uppercase; letter-spacing: 0.4px;
      }
      .tgc-b-dm      { background: #0e2540; color: #5da8f5; }
      .tgc-b-group   { background: #0a2218; color: #45c26a; }
      .tgc-b-channel { background: #251808; color: #e8a040; }
      .tgc-b-bot     { background: #190e32; color: #a888ff; }
      .tgc-b-unknown { background: #151515; color: #607080; }

      /* ── Divider ─────────────────────────────────────────── */
      .tgc-hr { height: 1px; background: #182838; margin: 16px 0; }

      /* ── Stat row ────────────────────────────────────────── */
      .tgc-stat {
        display: flex; justify-content: space-between; align-items: center;
        padding: 9px 0; border-bottom: 1px solid #0e1e2e;
      }
      .tgc-stat:last-child { border-bottom: none; }

      /* ── Progress bar ────────────────────────────────────── */
      .tgc-pbar-bg   { height: 5px; background: #1a2e44; border-radius: 3px; overflow: hidden; }
      .tgc-pbar-fill {
        height: 100%;
        background: linear-gradient(90deg, #3390ec 0%, #66bbff 100%);
        border-radius: 3px; transition: width 0.4s ease;
      }

      /* ── Category row ────────────────────────────────────── */
      .tgc-cat-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 14px; background: #0e1e2e; border-radius: 11px;
        margin-bottom: 8px; border: 1px solid #182838;
        transition: border-color 0.2s;
      }
      .tgc-cat-row:hover { border-color: #2a4060; }

      /* ── Card ────────────────────────────────────────────── */
      .tgc-card {
        background: #111d2c;
        border-radius: 16px;
        box-shadow: 0 20px 70px rgba(0,0,0,0.75), 0 0 0 1px #1e3050;
        width: 530px;
        max-width: calc(100vw - 28px);
        max-height: calc(100vh - 36px);
        display: flex; flex-direction: column; overflow: hidden;
      }
    `;
    document.head.appendChild(s);
  }

  // ══════════════════════════════════════════════════════════════
  //  ROOT OVERLAY
  // ══════════════════════════════════════════════════════════════

  function getRoot() {
    let r = document.getElementById("tgc-root");
    if (r) return r;
    r = document.createElement("div");
    r.id = "tgc-root";
    Object.assign(r.style, {
      position: "fixed",
      inset: "0",
      zIndex: "999999",
      background: "rgba(3, 8, 15, 0.88)",
      backdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });
    document.body.appendChild(r);
    return r;
  }

  /** Replaces root content with a styled card + fade-in animation */
  function setCard(root, innerHtml) {
    root.innerHTML = `<div class="tgc-card tgc-fade">${innerHtml}</div>`;
  }

  // ── Shared header ──────────────────────────────────────────────
  function cardHeader(title, subtitle, showClose = true) {
    return `
      <div style="padding:22px 26px 18px;border-bottom:1px solid #182838;
                  display:flex;align-items:center;gap:14px;flex-shrink:0;">
        <div style="width:42px;height:42px;border-radius:12px;
                    background:linear-gradient(135deg,#0f2a50,#3390ec);
                    display:flex;align-items:center;justify-content:center;
                    color:#fff;flex-shrink:0;">
          ${icon("trash", 18)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:600;color:#e0ecf8;">${title}</div>
          ${subtitle ? `<div style="font-size:12px;color:#6a8aaa;margin-top:2px;">${subtitle}</div>` : ""}
        </div>
        ${
          showClose ?
            `<button id="tgc-close" class="tgc-btn tgc-btn-ghost"
            style="padding:7px;border-radius:8px;flex-shrink:0;">${icon("close", 16)}</button>`
          : ""
        }
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 1 — CONFIGURATION
  // ══════════════════════════════════════════════════════════════

  function showConfig(root) {
    const cats = [
      { id: "dm", label: "Personal Chats", desc: "Direct messages with people", color: "#5da8f5", ico: "dm" },
      { id: "group", label: "Groups", desc: "Multi-person group chats", color: "#45c26a", ico: "group" },
      { id: "channel", label: "Channels", desc: "Broadcast / public channels", color: "#e8a040", ico: "channel" },
      { id: "bot", label: "Bots", desc: "Automated bot conversations", color: "#a888ff", ico: "bot" },
    ];

    setCard(
      root,
      `
      ${cardHeader("Telegram Chat Cleaner", "v4.0 &nbsp;·&nbsp; Configure, scan & selectively delete")}

      <div class="tgc-scroll" style="padding:22px 26px;flex:1;overflow-y:auto;">

        <div style="font-size:11px;font-weight:700;color:#4a6a88;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:12px;">Step 1 — Choose Types to Delete</div>

        ${cats
          .map(
            (c) => `
          <div class="tgc-cat-row">
            <div style="display:flex;align-items:center;gap:13px;">
              <div style="width:36px;height:36px;border-radius:9px;background:#0c1826;
                          display:flex;align-items:center;justify-content:center;
                          color:${c.color};border:1px solid #1e3050;flex-shrink:0;">
                ${icon(c.ico, 17, c.color)}
              </div>
              <div>
                <div style="font-size:14px;color:#d8eaf8;font-weight:500;">${c.label}</div>
                <div style="font-size:11px;color:#5a7a98;">${c.desc}</div>
              </div>
            </div>
            <label class="tgc-toggle">
              <input type="checkbox" id="tgc-f-${c.id}" checked>
              <span class="tgc-slider"></span>
            </label>
          </div>
        `,
          )
          .join("")}

        <div class="tgc-hr"></div>

        <div style="font-size:11px;font-weight:700;color:#4a6a88;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:12px;">Always Protected (Never Deleted)</div>

        <div style="background:#0a1520;border-radius:11px;padding:14px 16px;border:1px solid #182838;">
          ${["Saved Messages", "Telegram (Official)", "Telegram Tips"]
            .map(
              (name) => `
            <div style="display:flex;align-items:center;gap:10px;padding:5px 0;">
              <div style="color:#3390ec;flex-shrink:0;">${icon("shield", 13, "#3390ec")}</div>
              <span style="font-size:13px;color:#7a9ab8;">${name}</span>
              <span style="font-size:11px;color:#2a5a30;background:#0a1e0e;padding:1px 8px;
                           border-radius:10px;margin-left:auto;font-weight:600;">Protected</span>
            </div>
          `,
            )
            .join("")}
        </div>

        <div class="tgc-hr"></div>

        <div style="background:#180e04;border:1px solid #3a2008;border-radius:11px;
                    padding:14px 16px;display:flex;gap:12px;align-items:flex-start;">
          <div style="color:#c87020;flex-shrink:0;margin-top:1px;">${icon("warn", 18, "#c87020")}</div>
          <div style="font-size:13px;color:#a07040;line-height:1.65;">
            <b style="color:#d08040;">Irreversible action.</b>
            Deleted chats cannot be recovered. The next step lets you preview every chat
            and deselect any you want to keep before deletion starts.
          </div>
        </div>

      </div>

      <div style="padding:16px 26px;border-top:1px solid #182838;
                  display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;">
        <button class="tgc-btn tgc-btn-ghost" id="tgc-cancel">Cancel</button>
        <button class="tgc-btn tgc-btn-primary" id="tgc-scan-btn">
          ${icon("scan", 15)} Scan All Chats
        </button>
      </div>
    `,
    );

    root.querySelector("#tgc-close").onclick = () => root.remove();
    root.querySelector("#tgc-cancel").onclick = () => root.remove();
    root.querySelector("#tgc-scan-btn").onclick = () => {
      const filters = {};
      for (const c of ["dm", "group", "channel", "bot"]) {
        filters[c] = root.querySelector(`#tgc-f-${c}`)?.checked ?? true;
      }
      showScanning(root, filters);
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 2 — SCANNING  (scrolls list bottom to load everything)
  // ══════════════════════════════════════════════════════════════

  function showScanning(root, filters) {
    setCard(
      root,
      `
      <div style="padding:55px 40px;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:24px;text-align:center;min-height:340px;">
        <div class="tgc-spinner" style="width:46px;height:46px;border-width:4px;"></div>

        <div>
          <div style="font-size:20px;font-weight:600;color:#d8eaf8;">Scanning Your Chat List</div>
          <div id="tgc-scan-status" style="font-size:13px;color:#6a8aaa;margin-top:7px;">
            Scrolling to load all chats…
          </div>
        </div>

        <div style="background:#0c1826;border-radius:13px;padding:18px 40px;border:1px solid #1e3050;">
          <div id="tgc-scan-count" style="font-size:38px;font-weight:700;color:#3390ec;line-height:1;">0</div>
          <div style="font-size:12px;color:#4a6a88;margin-top:5px;letter-spacing:0.5px;">CHATS FOUND</div>
        </div>

        <div style="font-size:12px;color:#334455;display:flex;align-items:center;gap:6px;">
          ${icon("warn", 12, "#445566")}
          Do not close or navigate away from Telegram Web
        </div>
      </div>
    `,
    );

    (async () => {
      const chats = await scanAllChats((count, pass) => {
        const countEl = document.getElementById("tgc-scan-count");
        const statusEl = document.getElementById("tgc-scan-status");
        if (countEl) countEl.textContent = count;
        if (statusEl) statusEl.textContent = `Scroll pass ${pass} — loading more chats…`;
      });

      // Pre-deselect chat types the user filtered out
      for (const c of chats) {
        if (filters[c.type] === false) c.selected = false;
      }

      showChatList(root, chats, filters);
    })();
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 3 — CHAT SELECTION  (preview + deselect)
  // ══════════════════════════════════════════════════════════════

  function showChatList(root, chats, filters) {
    let activeTab = "all";
    let query = "";

    const typeCounts = { all: chats.length };
    for (const c of chats) typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;

    const selCount = () => chats.filter((c) => c.selected).length;
    const getVisible = () =>
      chats.filter((c) => {
        if (activeTab !== "all" && c.type !== activeTab) return false;
        if (query && !c.name.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      });

    let firstRender = true;

    const renderList = () => {
      const visible = getVisible();
      const sc = selCount();

      const listHTML =
        visible.length === 0 ?
          `<div style="padding:40px;text-align:center;color:#3a5570;font-size:14px;">
             No chats match this filter
           </div>`
        : visible
            .map(
              (c) => `
            <div class="tgc-chat-row ${c.selected ? "" : "deselected"}" data-key="${esc(c.key)}">
              <div class="tgc-cb ${c.selected ? "on" : ""}"></div>
              <span style="flex:1;font-size:14px;color:#d8eaf8;
                           overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.name)}</span>
              <span class="tgc-badge tgc-b-${c.type}">
                ${icon(c.type, 9, "currentColor")} ${c.type}
              </span>
            </div>
          `,
            )
            .join("");

      /* ── Partial update (subsequent renders) ── */
      if (!firstRender) {
        const listInner = document.getElementById("tgc-list-inner");
        const scrollEl = document.getElementById("tgc-chat-scroll");
        const savedScroll = scrollEl?.scrollTop || 0;

        if (listInner) {
          listInner.innerHTML = listHTML;
          if (scrollEl) scrollEl.scrollTop = savedScroll;
          attachRowEvents();
        }

        // Update counter + button
        const footerCnt = document.getElementById("tgc-footer-cnt");
        const startBtn = document.getElementById("tgc-start-del");
        const hdrSel = document.getElementById("tgc-hdr-sel");
        if (footerCnt) footerCnt.textContent = sc;
        if (hdrSel) hdrSel.textContent = sc + " selected";
        if (startBtn) {
          startBtn.innerHTML = `${icon("trash", 14)} Delete ${sc} Chats`;
          startBtn.disabled = sc === 0;
        }
        return;
      }

      /* ── First (full) render ── */
      firstRender = false;

      setCard(
        root,
        `
        ${cardHeader(
          "Select Chats to Delete",
          `${chats.length} found &nbsp;·&nbsp; <span id="tgc-hdr-sel" style="color:#e05555;">${sc} selected</span>`,
        )}

        <div style="padding:14px 18px 10px;border-bottom:1px solid #182838;flex-shrink:0;">
          <input class="tgc-input" id="tgc-search" placeholder="🔍  Search chats…"
                 value="${esc(query)}" style="margin-bottom:10px;" autocomplete="off">
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${["all", "dm", "group", "channel", "bot"]
              .filter((t) => t === "all" || (typeCounts[t] || 0) > 0)
              .map(
                (t) => `
                <button class="tgc-tab ${activeTab === t ? "active" : ""}" data-tab="${t}">
                  ${t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  <span style="opacity:0.6;font-size:11px;">${typeCounts[t] || 0}</span>
                </button>
              `,
              )
              .join("")}
          </div>
        </div>

        <div id="tgc-chat-scroll" class="tgc-scroll"
             style="flex:1;padding:8px 10px;overflow-y:auto;min-height:0;">
          <div style="display:flex;justify-content:flex-end;gap:6px;padding:4px 4px 6px;">
            <button class="tgc-btn tgc-btn-ghost" id="tgc-sel-all"
                    style="font-size:12px;padding:5px 11px;">Select All</button>
            <button class="tgc-btn tgc-btn-ghost" id="tgc-desel-all"
                    style="font-size:12px;padding:5px 11px;">Deselect All</button>
          </div>
          <div id="tgc-list-inner">${listHTML}</div>
        </div>

        <div style="padding:14px 20px;border-top:1px solid #182838;
                    display:flex;align-items:center;gap:10px;flex-shrink:0;">
          <button class="tgc-btn tgc-btn-ghost" id="tgc-back">${icon("back", 14)} Back</button>
          <div style="flex:1;text-align:center;font-size:13px;color:#4a6a88;">
            <span id="tgc-footer-cnt"
                  style="color:${sc > 0 ? "#e05555" : "#4a6a88"};font-weight:600;">${sc}</span>
            chats selected
          </div>
          <button class="tgc-btn tgc-btn-danger" id="tgc-start-del" ${sc === 0 ? "disabled" : ""}>
            ${icon("trash", 14)} Delete ${sc} Chats
          </button>
        </div>
      `,
      );

      // Wire static events
      root.querySelector("#tgc-close").onclick = () => root.remove();
      root.querySelector("#tgc-back").onclick = () => showConfig(root);
      root.querySelector("#tgc-sel-all").onclick = () => {
        getVisible().forEach((c) => (c.selected = true));
        renderList();
      };
      root.querySelector("#tgc-desel-all").onclick = () => {
        getVisible().forEach((c) => (c.selected = false));
        renderList();
      };
      root.querySelector("#tgc-start-del").onclick = () => {
        if (selCount() > 0) showConfirm(root, chats);
      };

      root.querySelector("#tgc-search").oninput = (e) => {
        query = e.target.value;
        renderList();
        root.querySelector("#tgc-search")?.focus();
      };

      root.querySelectorAll(".tgc-tab").forEach((btn) => {
        btn.onclick = () => {
          activeTab = btn.dataset.tab;
          renderList();
        };
      });

      attachRowEvents();
    };

    function attachRowEvents() {
      const listDiv = document.getElementById("tgc-list-inner");
      if (!listDiv) return;
      listDiv.onclick = (e) => {
        const row = e.target.closest(".tgc-chat-row");
        if (!row) return;
        const chat = chats.find((c) => c.key === row.dataset.key);
        if (chat) {
          chat.selected = !chat.selected;
          renderList();
          if (query) root.querySelector("#tgc-search")?.focus();
        }
      };
    }

    renderList();
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 4 — CONFIRM
  // ══════════════════════════════════════════════════════════════

  function showConfirm(root, chats) {
    const sel = chats.filter((c) => c.selected);
    const byType = {};
    for (const c of sel) byType[c.type] = (byType[c.type] || 0) + 1;

    const typeRows = [
      ["dm", "📱", "Personal Chats", "#5da8f5"],
      ["group", "👥", "Groups", "#45c26a"],
      ["channel", "📢", "Channels", "#e8a040"],
      ["bot", "🤖", "Bots", "#a888ff"],
    ]
      .filter(([t]) => byType[t] > 0)
      .map(
        ([t, e, l, c]) => `
       <div class="tgc-stat">
         <span style="color:#6a8aaa;">${e} ${l}</span>
         <span style="color:${c};font-weight:600;">${byType[t]}</span>
       </div>`,
      )
      .join("");

    setCard(
      root,
      `
      <div style="padding:38px 34px;display:flex;flex-direction:column;align-items:center;gap:24px;">
        <div style="width:62px;height:62px;border-radius:16px;
                    background:linear-gradient(135deg,#3a0a0a,#aa2820);
                    display:flex;align-items:center;justify-content:center;color:#fff;">
          ${icon("warn", 30, "#fff")}
        </div>

        <div style="text-align:center;">
          <div style="font-size:21px;font-weight:700;color:#e0ecf8;">Confirm Deletion</div>
          <div style="font-size:13px;color:#5a7a98;margin-top:7px;">
            This action is permanent — chats cannot be recovered
          </div>
        </div>

        <div style="background:#0c1826;border-radius:13px;padding:16px 22px;
                    width:100%;border:1px solid #182838;">
          <div class="tgc-stat" style="padding-bottom:13px;">
            <span style="color:#8ab0d0;font-size:15px;">Total to delete</span>
            <span style="color:#e05555;font-size:24px;font-weight:700;">${sel.length}</span>
          </div>
          ${typeRows}
        </div>

        <div style="display:flex;gap:10px;width:100%;">
          <button class="tgc-btn tgc-btn-ghost" id="tgc-back" style="flex:1;">
            ${icon("back", 14)} Go Back
          </button>
          <button class="tgc-btn tgc-btn-danger" id="tgc-confirm" style="flex:1.5;">
            ${icon("trash", 14)} Delete ${sel.length} Chats Now
          </button>
        </div>
      </div>
    `,
    );

    root.querySelector("#tgc-back").onclick = () => showChatList(root, chats, {});
    root.querySelector("#tgc-confirm").onclick = () => showDeletion(root, chats);
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 5 — DELETION  (scroll to top, delete one by one)
  // ══════════════════════════════════════════════════════════════

  function showDeletion(root, chats) {
    const selected = chats.filter((c) => c.selected);
    const total = selected.length;
    // Track remaining targets by stable key (peerId when possible, fallback name)
    const remaining = new Map();
    for (const c of selected) remaining.set(c.key, (remaining.get(c.key) || 0) + 1);

    let isPaused = false;
    let shouldStop = false;
    let noTargetScrollRetries = 0;

    setCard(
      root,
      `
      <div style="padding:28px 32px;display:flex;flex-direction:column;gap:20px;">

        <!-- Status header -->
        <div style="display:flex;align-items:center;gap:15px;">
          <div class="tgc-spinner" style="width:36px;height:36px;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:600;color:#d8eaf8;">Deleting Chats…</div>
            <div id="tgc-cur" class="tgc-pulse"
                 style="font-size:12px;color:#5a7a98;margin-top:3px;
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Starting…</div>
          </div>
          <div id="tgc-pct" style="font-size:26px;font-weight:700;color:#3390ec;flex-shrink:0;">0%</div>
        </div>

        <!-- Progress bar -->
        <div class="tgc-pbar-bg">
          <div class="tgc-pbar-fill" id="tgc-bar" style="width:0%;"></div>
        </div>

        <!-- Live stats -->
        <div style="background:#0c1826;border-radius:13px;padding:14px 20px;border:1px solid #182838;">
          <div class="tgc-stat">
            <span style="color:#7a9ab8;">Total Deleted</span>
            <span id="tgc-n-total" style="color:#3390ec;font-size:21px;font-weight:700;">0</span>
          </div>
          <div class="tgc-stat">
            <span style="color:#7a9ab8;">📱 Personal</span>
            <span id="tgc-n-dm" style="color:#5da8f5;font-weight:600;">0</span>
          </div>
          <div class="tgc-stat">
            <span style="color:#7a9ab8;">👥 Groups</span>
            <span id="tgc-n-group" style="color:#45c26a;font-weight:600;">0</span>
          </div>
          <div class="tgc-stat">
            <span style="color:#7a9ab8;">📢 Channels</span>
            <span id="tgc-n-channel" style="color:#e8a040;font-weight:600;">0</span>
          </div>
          <div class="tgc-stat">
            <span style="color:#7a9ab8;">🤖 Bots</span>
            <span id="tgc-n-bot" style="color:#a888ff;font-weight:600;">0</span>
          </div>
        </div>

        <!-- Pause / Stop -->
        <div style="display:flex;gap:10px;">
          <button class="tgc-btn tgc-btn-secondary" id="tgc-pause" style="flex:1;">
            ${icon("pause", 14)} Pause
          </button>
          <button class="tgc-btn tgc-btn-ghost" id="tgc-stop" style="flex:1;">
            ${icon("stop", 14)} Stop
          </button>
        </div>

        <div style="font-size:11px;color:#2a3d50;text-align:center;">
          Do not navigate away from Telegram Web during deletion
        </div>
      </div>
    `,
    );

    // Controls
    const pauseBtn = root.querySelector("#tgc-pause");
    pauseBtn.onclick = () => {
      isPaused = !isPaused;
      pauseBtn.innerHTML = isPaused ? `${icon("play", 14)} Resume` : `${icon("pause", 14)} Pause`;
    };
    root.querySelector("#tgc-stop").onclick = () => {
      shouldStop = true;
    };

    // UI update helper
    const upd = (counts) => {
      const g = (id) => document.getElementById(id);
      const set = (id, val) => {
        const el = g(id);
        if (el) el.textContent = val;
      };
      set("tgc-n-total", counts.total);
      set("tgc-n-dm", counts.dm || 0);
      set("tgc-n-group", counts.group || 0);
      set("tgc-n-channel", counts.channel || 0);
      set("tgc-n-bot", counts.bot || 0);
      const pct = total > 0 ? Math.round((counts.total / total) * 100) : 0;
      const bar = g("tgc-bar");
      if (bar) bar.style.width = pct + "%";
      const pctEl = g("tgc-pct");
      if (pctEl) pctEl.textContent = pct + "%";
      if (counts.currentChat) {
        const cur = g("tgc-cur");
        if (cur) {
          const name = counts.currentChat.length > 48 ? counts.currentChat.slice(0, 48) + "…" : counts.currentChat;
          cur.textContent = `Deleting: ${name}`;
        }
      }
    };

    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      return el.getClientRects().length > 0;
    };

    const queryDeleteMenuItem = () => {
      const menuItems = [...document.querySelectorAll('[role="menuitem"], .MenuItem, .menu-item, li.menu-item')];
      return menuItems.find((el) => {
        const t = (el.innerText || el.textContent || "").trim();
        return t === "Delete Chat" || t === "Leave Channel" || t === "Leave Group" || t === "Delete and Leave";
      });
    };

    const queryConfirmButton = () => {
      const clickables = [...document.querySelectorAll("button"), ...document.querySelectorAll('[role="button"]')].filter(
        isVisible,
      );

      return (
        clickables.find((b) => /delete for me and/i.test(b.innerText || "")) ||
        clickables.find((b) => /delete for me and deleted/i.test(b.innerText || "")) ||
        clickables.find((b) => /delete and block/i.test(b.innerText || "")) ||
        clickables.find((b) => /delete and leave/i.test(b.innerText || "")) ||
        clickables.find((b) => /delete for all members/i.test(b.innerText || "")) ||
        clickables.find((b) => /leave channel/i.test(b.innerText || "")) ||
        clickables.find((b) => /leave group/i.test(b.innerText || "")) ||
        clickables.find((b) => /delete chat/i.test(b.innerText || "")) ||
        clickables.find((b) => /^delete$/i.test((b.innerText || "").trim())) ||
        clickables.find(
          (b) => /^ok$/i.test((b.innerText || "").trim()) && b.closest(".popup, .modal, [class*='dialog'], [role='dialog']"),
        )
      );
    };

    const hasBlockingPopup = () => {
      const blockers = document.querySelectorAll('.popup, .modal, [class*="dialog"], [role="dialog"]');
      return [...blockers].some(isVisible);
    };

    const waitFor = async (predicate, timeoutMs = 1200, intervalMs = 40) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = predicate();
        if (result) return result;
        await delay(intervalMs);
      }
      return predicate();
    };

    const settleUiBeforeNextAction = async () => {
      const settled = await waitFor(() => !hasBlockingPopup() && !queryDeleteMenuItem(), 1200, 50);
      if (settled) return true;
      // Best-effort escape to close any lingering popup/menu
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await delay(120);
      return await waitFor(() => !hasBlockingPopup() && !queryDeleteMenuItem(), 1200, 50);
    };

    // ─── Deletion loop ───────────────────────────────────────────
    (async () => {
      const counts = { total: 0, dm: 0, group: 0, channel: 0, bot: 0, unknown: 0 };
      let consecSkips = 0;
      const MAX_SKIPS = 8;
      const MAX_ATTEMPTS = 6000;
      let attempts = 0;

      // Force list to real top before the first deletion attempt
      const atTop = await scrollChatsToTop(18, 250);
      log(atTop ? "Deletion start: chat list locked at top" : "Deletion start: best-effort top scroll completed");

      // ── helpers for the no-target sweep ──────────────────────
      /** Scroll scroller to 0, retrying up to `tries` times with `waitMs` between
       *  each attempt, because Telegram's virtual list sometimes ignores the first set. */
      const forceScrollTop = async (scroller, tries = 5, waitMs = 300) => {
        for (let i = 0; i < tries; i++) {
          scroller.scrollTop = 0;
          scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
          const firstChat = document.querySelector(".chat-list .Chat:first-child");
          if (firstChat) firstChat.scrollIntoView({ block: "start" });
          await delay(waitMs);
          if (scroller.scrollTop <= 2) return true; // confirmed at top
        }
        return scroller.scrollTop <= 2;
      };

      /** Scroll scroller down by one step, with lazy-load trigger and wait.
       *  Returns true if position actually changed (not already at bottom). */
      const stepDown = async (scroller, step, waitMs = 350) => {
        const before = scroller.scrollTop;
        scroller.scrollTop += step;
        const lastChat = document.querySelector(".chat-list .Chat:last-child");
        if (lastChat) lastChat.scrollIntoView({ block: "end" });
        scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
        await delay(waitMs);
        // Retry once if position hasn't changed yet (lazy render delay)
        if (scroller.scrollTop === before) {
          await delay(waitMs);
        }
        return scroller.scrollTop !== before;
      };

      // State for the no-target sweep phase
      let sweeping = false; // true while we are in the sweep-down phase
      let sweepAtBottom = false; // set when we confirmed we hit the bottom

      while (attempts < MAX_ATTEMPTS && !shouldStop) {
        // Handle pause
        while (isPaused && !shouldStop) await delay(250);
        if (shouldStop) break;

        // When NOT sweeping, always scroll to top so we pick the topmost remaining chat
        if (!sweeping) {
          const iterScroller = getChatListScroller();
          if (iterScroller) {
            await forceScrollTop(iterScroller, 5, 300);
          }
        }

        attempts++;

        const chatList = document.querySelector(".chat-list");
        if (!chatList) {
          err("Chat list not found in DOM");
          break;
        }

        const allVisible = [...chatList.querySelectorAll(".Chat a.ListItem-button, .Chat .ListItem-button")];
        if (!allVisible.length) {
          log("Chat list is empty — done");
          break;
        }

        // Find first visible chat that is still in our targets
        let target = null;
        for (const el of allVisible) {
          const name = getChatName(el);
          if (isProtectedName(name)) continue;
          const peerId = getPeerId(el);
          const key = peerId ? `p:${peerId}` : `n:${name}`;
          if ((remaining.get(key) || 0) > 0) {
            target = el;
            break;
          }
        }

        if (!target) {
          const delScroller = getChatListScroller();

          if (!delScroller) {
            log("No scroller found — stopping");
            break;
          }

          if (!sweeping) {
            // ── Phase 1: make sure we are really at the top ──────────
            log("No target visible — forcing scroll to top and starting sweep");
            await forceScrollTop(delScroller, 5, 300);
            sweeping = true;
            sweepAtBottom = false;
            noTargetScrollRetries = 0;
            continue; // re-scan from top
          }

          // ── Phase 2: step down through the list ─────────────────────
          const step = Math.max(delScroller.clientHeight * 0.8, 200);
          const moved = await stepDown(delScroller, step, 350);
          noTargetScrollRetries++;

          if (!moved) {
            // Didn't move → truly at bottom
            if (!sweepAtBottom) {
              sweepAtBottom = true;
              log(`Sweep hit bottom after ${noTargetScrollRetries} steps — remaining keys: ${remaining.size}`);

              // ── Phase 3: re-scan all chats to find any we missed ──────
              if (remaining.size > 0) {
                log("Re-scanning full chat list to verify remaining targets…");
                const g = (id) => document.getElementById(id);
                const curEl = g("tgc-cur");
                if (curEl) curEl.textContent = "Re-scanning to find remaining chats…";

                const rescanned = await scanAllChats(() => {});
                let foundAny = false;
                for (const rc of rescanned) {
                  if (remaining.has(rc.key)) {
                    foundAny = true;
                    break;
                  }
                }

                if (foundAny) {
                  log("Re-scan found remaining targets — resuming deletion from top");
                  sweeping = false;
                  sweepAtBottom = false;
                  noTargetScrollRetries = 0;
                  continue;
                } else {
                  log("Re-scan confirmed: no remaining targets exist — done");
                }
              }
            }
            log("All targets deleted or not found — complete");
            break;
          }

          log(`Sweep step ${noTargetScrollRetries} — pos ${Math.round(delScroller.scrollTop)}`);
          continue;
        }

        // Reset scroll-retry counter and sweep state whenever we find a target
        noTargetScrollRetries = 0;
        sweeping = false;
        sweepAtBottom = false;

        const name = getChatName(target);
        const targetPeerId = getPeerId(target);
        const targetKey = targetPeerId ? `p:${targetPeerId}` : `n:${name}`;
        upd({ ...counts, currentChat: name });

        try {
          await settleUiBeforeNextAction();

          // Open context menu
          target.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          const delItem = await waitFor(() => queryDeleteMenuItem(), 1000, 35);

          if (!delItem) {
            warn(`No delete menu item for: "${name}"`);
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            await delay(220);
            if (++consecSkips >= MAX_SKIPS) {
              err("Too many consecutive skips — stopping");
              break;
            }
            continue;
          }

          delItem.click();
          const confirmBtn = await waitFor(() => queryConfirmButton(), 1400, 35);

          if (!confirmBtn) {
            warn(`No confirm button for: "${name}"`);
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            await delay(260);
            if (++consecSkips >= MAX_SKIPS) {
              err("Too many consecutive skips — stopping");
              break;
            }
            continue;
          }

          // Detect actual type from button text
          const bt = (confirmBtn.innerText || "").toUpperCase();
          const type =
            bt.includes("DELETE AND BLOCK") ? "bot"
            : bt.includes("LEAVE CHANNEL") ? "channel"
            : bt.includes("LEAVE GROUP") ? "group"
            : bt.includes("DELETE AND LEAVE") ? "group"
            : (
              bt.includes("DELETE FOR ME AND DELETED") ||
              bt.includes("DELETE FOR ME AND") ||
              bt.includes("DELETE FOR ALL MEMBERS") ||
              bt.includes("DELETE CHAT")
            ) ?
              "dm"
            : "unknown";

          confirmBtn.click();

          // Wait for confirmation popup/menu to fully close before next iteration
          await settleUiBeforeNextAction();

          counts.total++;
          counts[type] = (counts[type] || 0) + 1;

          // Decrement remaining counter for this stable key
          const rem = remaining.get(targetKey) || 0;
          if (rem <= 1) remaining.delete(targetKey);
          else remaining.set(targetKey, rem - 1);

          consecSkips = 0;
          log(`✓ [${type}] "${name}" (${counts.total} / ${total})`);
          upd({ ...counts, currentChat: name });

          await delay(120);
        } catch (e) {
          err("Exception during deletion:", e);
          await delay(1500);
        }
      }

      showResults(root, counts, shouldStop);
    })();
  }

  // ══════════════════════════════════════════════════════════════
  //  STEP 6 — RESULTS
  // ══════════════════════════════════════════════════════════════

  function showResults(root, counts, wasStopped) {
    const typeRows = [
      ["dm", "📱", "Personal Chats", "#5da8f5"],
      ["group", "👥", "Groups", "#45c26a"],
      ["channel", "📢", "Channels", "#e8a040"],
      ["bot", "🤖", "Bots", "#a888ff"],
      ["unknown", "❓", "Unknown", "#607080"],
    ]
      .filter(([t]) => (counts[t] || 0) > 0)
      .map(
        ([t, e, l, c]) => `
       <div class="tgc-stat">
         <span style="color:#6a8aaa;">${e} ${l}</span>
         <span style="color:${c};font-weight:600;">${counts[t]}</span>
       </div>`,
      )
      .join("");

    const isSuccess = !wasStopped;

    setCard(
      root,
      `
      <div style="padding:40px 36px;display:flex;flex-direction:column;align-items:center;gap:24px;">

        <div style="width:68px;height:68px;border-radius:18px;
                    background:linear-gradient(135deg,${isSuccess ? "#0a2a14,#1f8a40" : "#2a1a0a,#7a4010"});
                    display:flex;align-items:center;justify-content:center;color:#fff;">
          ${icon(isSuccess ? "check" : "stop", 30, "#fff")}
        </div>

        <div style="text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#d8eaf8;">
            ${isSuccess ? "All Done!" : "Stopped Early"}
          </div>
          <div style="font-size:13px;color:#5a7a98;margin-top:7px;">
            ${isSuccess ? "All selected chats have been deleted successfully" : "Deletion was stopped before completing"}
          </div>
        </div>

        <div style="background:#0c1826;border-radius:13px;padding:16px 24px;
                    width:100%;border:1px solid #182838;">
          <div class="tgc-stat" style="padding-bottom:13px;">
            <span style="color:#8ab0d0;font-size:15px;">Total Deleted</span>
            <span style="color:#3390ec;font-size:26px;font-weight:700;">${counts.total}</span>
          </div>
          ${
            typeRows ||
            `<div style="color:#3a5570;font-size:13px;text-align:center;padding:8px 0;">
                          No chats were deleted
                        </div>`
          }
        </div>

        <div style="display:flex;gap:10px;width:100%;">
          <button class="tgc-btn tgc-btn-ghost" id="tgc-restart" style="flex:1;">
            ${icon("refresh", 14)} Run Again
          </button>
          <button class="tgc-btn tgc-btn-primary" id="tgc-done" style="flex:1.4;">
            ${icon("check", 14)} Done
          </button>
        </div>
      </div>
    `,
    );

    root.querySelector("#tgc-done").onclick = () => root.remove();
    root.querySelector("#tgc-restart").onclick = () => showConfig(root);
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  injectStyles();
  const root = getRoot();
  showConfig(root);
})();
