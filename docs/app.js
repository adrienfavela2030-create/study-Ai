const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function show(el, html) { el.classList.remove("hidden"); el.innerHTML = html; }

function go(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = $("#view-" + name);
  if (el) el.classList.add("active");
  window.scrollTo(0, 0);
}
$$("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

function segs(rootSel, key, cb) {
  const root = $(rootSel);
  if (!root) return;
  root.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      cb(btn.dataset[key]);
    });
  });
}
let hwMode = "help";
let noteStyle = "light";
segs("#hw-modes", "mode", (v) => (hwMode = v));
segs("#note-styles", "style", (v) => (noteStyle = v));

function solveHomework(text, mode, nums) {
  const t = text.trim();
  if (!t) return null;
  const steps = [];
  steps.push("What you are being asked");
  steps.push("- Read the full question carefully.");
  if (nums) steps.push("- Focus on question number(s): " + nums);
  steps.push("", "Break it down");
  steps.push("- Underline key words (what, why, how, calculate, explain).");
  steps.push("- List what you already know.");
  steps.push("- List what is still missing.", "");
  if (mode === "help") {
    steps.push("Help me understand");
    steps.push("1. Restate the question in your own words.");
    steps.push("2. Identify the topic.");
    steps.push("3. Write one fact or formula that might apply.");
    steps.push("4. Try the first small step, then check.");
    steps.push("5. If stuck, say what part is confusing.", "");
    steps.push("Your question:", t.slice(0, 800));
  } else if (mode === "answer") {
    steps.push("Direct approach");
    steps.push("- Use the question and your materials only.");
    steps.push("- Math: show numbers and operations.");
    steps.push("- Reading: point to supporting sentences.", "");
    steps.push("Draft answer: _______________________________", "");
    steps.push("Question:", t.slice(0, 800));
  } else {
    steps.push("Answer + explain");
    steps.push("1. Answer in one sentence.");
    steps.push("2. Explain why.");
    steps.push("3. Check units or evidence.", "");
    steps.push("Answer: ...", "Because: ...", "Evidence: ...", "");
    steps.push("Question:", t.slice(0, 800));
  }
  return steps.join("\n");
}

$("#hw-go").addEventListener("click", () => {
  const ans = solveHomework($("#hw-text").value, hwMode, $("#hw-nums").value.trim());
  const out = $("#hw-out");
  if (!ans) { show(out, '<p class="body">Paste a question first.</p>'); return; }
  show(out, '<h3>Homework help</h3><div class="body">' + esc(ans) + '</div>');
});

function makeNotes(text, style) {
  const raw = text.trim();
  if (!raw) return null;
  const sentences = raw.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const n = style === "light" || style === "short" ? 5 : style === "medium" ? 10 : 16;
  const bullets = sentences.slice(0, n);
  let out = [];
  if (style === "light") {
    out.push("LIGHT NOTES", "");
    bullets.forEach((s, i) => out.push(i + 1 + ". " + s));
  } else if (style === "short") {
    out.push("SHORT REVIEW", "");
    bullets.forEach((s) => out.push("- " + s.slice(0, 120) + (s.length > 120 ? "..." : "")));
  } else if (style === "medium") {
    out.push("MEDIUM NOTES", "", "Main ideas");
    bullets.slice(0, 4).forEach((s) => out.push("- " + s));
    out.push("", "Details");
    bullets.slice(4).forEach((s) => out.push("- " + s));
  } else {
    out.push("TEST-PREP NOTES", "");
    bullets.forEach((s, i) => out.push(i + 1 + ". " + s));
    out.push("", "Study prompts", "- Causes?", "- Effects?", "- Names / dates?", "- Connections?");
  }
  out.push("", "From your pasted text only.");
  return out.join("\n");
}

$("#notes-go").addEventListener("click", () => {
  const notes = makeNotes($("#notes-text").value, noteStyle);
  const out = $("#notes-out");
  if (!notes) { show(out, '<p class="body">Paste text first.</p>'); return; }
  show(out, '<h3>' + esc(noteStyle) + ' notes</h3><div class="body">' + esc(notes) + '</div>');
});

const chatEl = $("#chat");
function bubble(role, text, meta) {
  const div = document.createElement("div");
  div.className = "bubble " + (role === "user" ? "user" : "ai");
  div.innerHTML = esc(text) + (meta ? '<div class="meta">' + esc(meta) + '</div>' : "");
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function wikiSearch(query) {
  const url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=" + encodeURIComponent(query) + "&limit=5&namespace=0&format=json&origin=*";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Search failed");
  const data = await r.json();
  const titles = data[1] || [], descs = data[2] || [], urls = data[3] || [];
  return titles.map((title, i) => ({ title, desc: descs[i] || "", url: urls[i] }));
}
async function wikiExtract(title) {
  const url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=" + encodeURIComponent(title) + "&format=json&origin=*";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Page failed");
  const data = await r.json();
  const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
  if (!pages.length || pages[0].missing !== undefined) return null;
  const p = pages[0];
  return { title: p.title, extract: (p.extract || "").slice(0, 2500), url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")) };
}
function explainFromSources(question, extracts) {
  if (!extracts.length) return "No pages found. Try fewer words (example: water cycle).";
  const parts = ["About: " + question, ""];
  extracts.forEach((ex, i) => {
    parts.push("[" + (i + 1) + "] " + ex.title);
    parts.push(ex.extract.slice(0, 700) + (ex.extract.length > 700 ? "..." : ""), "");
  });
  parts.push("Open the links below for more.");
  return parts.join("\n");
}
function renderSources(list) {
  const box = $("#learn-sources");
  if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  let html = "<strong>Sources</strong>";
  list.forEach((s, i) => {
    html += '<div class="source-card"><span class="tag">PAGE</span><a href="' + esc(s.url) + '" target="_blank" rel="noopener">[' + (i + 1) + "] ' + esc(s.title) + '</a></div>';
  });
  box.innerHTML = html;
}
async function sendLearn() {
  const input = $("#learn-input");
  const msg = input.value.trim();
  if (!msg) return;
  const useSearch = $("#learn-search").checked;
  bubble("user", msg);
  input.value = "";
  $("#learn-go").disabled = true;
  bubble("ai", "...", useSearch ? "searching..." : "");
  try {
    let reply;
    if (useSearch) {
      let q = msg;
      for (const p of ["what is the ", "what is ", "what are ", "who is ", "explain ", "define "]) {
        if (q.toLowerCase().startsWith(p)) { q = q.slice(p.length).replace(/[?.!]+$/, "").trim(); break; }
      }
      const hits = await wikiSearch(q || msg);
      const extracts = [];
      for (const h of hits.slice(0, 2)) {
        const ex = await wikiExtract(h.title);
        if (ex && ex.extract) extracts.push(ex);
      }
      reply = explainFromSources(msg, extracts);
      renderSources(extracts);
    } else {
      reply = "Turn on Research the web for live pages.\n\nYou asked: " + msg;
      renderSources([]);
    }
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", reply, useSearch ? "Live Wikipedia" : "");
  } catch (e) {
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", "Error: " + e.message);
  }
  $("#learn-go").disabled = false;
  input.focus();
}
$("#learn-go").addEventListener("click", sendLearn);
$("#learn-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); sendLearn(); }
});
bubble("ai", "Ask a question. Leave Research the web on to read real pages.");
