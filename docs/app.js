const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function show(el, html) { el.classList.remove("hidden"); el.innerHTML = html; }

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#panel-" + tab.dataset.tool).classList.add("active");
  });
});

function segs(rootSel, key, cb) {
  const root = $(rootSel);
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
  steps.push("");
  steps.push("Break it down");
  steps.push("- Underline key words (what, why, how, calculate, explain, compare).");
  steps.push("- List what you already know.");
  steps.push("- List what is still missing.");
  steps.push("");
  if (mode === "help") {
    steps.push("Help me understand (guided)");
    steps.push("1. Restate the question in your own words.");
    steps.push("2. Identify the topic.");
    steps.push("3. Write one fact or formula that might apply.");
    steps.push("4. Try the first small step only, then check.");
    steps.push("5. If stuck, say what part is confusing.");
    steps.push("");
    steps.push("Your question:");
    steps.push(t.slice(0, 800));
  } else if (mode === "answer") {
    steps.push("Direct approach");
    steps.push("- Use only information in the question and your materials.");
    steps.push("- For math: show numbers and operations clearly.");
    steps.push("- For reading: point to a sentence that supports the answer.");
    steps.push("");
    steps.push("Draft answer: _______________________________");
    steps.push("");
    steps.push("Question text:");
    steps.push(t.slice(0, 800));
  } else {
    steps.push("Answer + explain");
    steps.push("1. State the answer in one sentence.");
    steps.push("2. Explain why (reasons, steps, or evidence).");
    steps.push("3. Check units, labels, or page references.");
    steps.push("");
    steps.push("Template:");
    steps.push("Answer: ...");
    steps.push("Because: ...");
    steps.push("Evidence / steps: ...");
    steps.push("");
    steps.push("Your question:");
    steps.push(t.slice(0, 800));
  }
  steps.push("");
  steps.push("This phone version guides you step by step so you can finish the work.");
  return steps.join("\n");
}

$("#hw-go").addEventListener("click", () => {
  const text = $("#hw-text").value;
  const nums = $("#hw-nums").value.trim();
  const out = $("#hw-out");
  const ans = solveHomework(text, hwMode, nums);
  if (!ans) { show(out, '<p class="body">Paste a question first.</p>'); return; }
  show(out, '<h3>Homework help</h3><div class="body">' + esc(ans) + '</div><p class="note">Phone mode — structured help on your device.</p>');
});

function makeNotes(text, style) {
  const raw = text.trim();
  if (!raw) return null;
  const sentences = raw.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const n = style === "light" || style === "short" ? 5 : style === "medium" ? 10 : 16;
  const bullets = sentences.slice(0, n);
  let out = [];
  if (style === "light") {
    out.push("LIGHT NOTES — main ideas only", "");
    bullets.forEach((s, i) => out.push(i + 1 + ". " + s));
  } else if (style === "short") {
    out.push("SHORT REVIEW", "");
    bullets.forEach((s) => out.push("- " + s.slice(0, 120) + (s.length > 120 ? "..." : "")));
  } else if (style === "medium") {
    out.push("MEDIUM NOTES", "", "Main ideas");
    bullets.slice(0, 4).forEach((s) => out.push("- " + s));
    out.push("", "Supporting details");
    bullets.slice(4).forEach((s) => out.push("- " + s));
    out.push("", "Key terms: add definitions from class for important words.");
  } else {
    out.push("HARD / TEST-PREP NOTES", "", "Facts & statements");
    bullets.forEach((s, i) => out.push(i + 1 + ". " + s));
    out.push("", "Study prompts");
    out.push("- What causes are mentioned?");
    out.push("- What effects or results?");
    out.push("- Names, dates, or places to memorize?");
    out.push("- How does this connect to an earlier lesson?");
  }
  out.push("", "Source: your pasted text only.");
  return out.join("\n");
}

$("#notes-go").addEventListener("click", () => {
  const text = $("#notes-text").value;
  const out = $("#notes-out");
  const notes = makeNotes(text, noteStyle);
  if (!notes) { show(out, '<p class="body">Paste source text first.</p>'); return; }
  show(out, '<h3>' + esc(noteStyle) + ' notes</h3><div class="body">' + esc(notes) + '</div><p class="note">Built on your phone from the text you pasted.</p>');
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
  const titles = data[1] || [];
  const descs = data[2] || [];
  const urls = data[3] || [];
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
  if (!extracts.length) return "I could not open enough pages. Try fewer words (example: Perseverance rover or water cycle).";
  const parts = ["Here is what the sources say about: " + question, ""];
  extracts.forEach((ex, i) => {
    parts.push("[" + (i + 1) + "] " + ex.title);
    parts.push(ex.extract.slice(0, 700) + (ex.extract.length > 700 ? "..." : ""));
    parts.push("");
  });
  parts.push("Tip: open the linked pages for full detail. Learn uses live Wikipedia on your phone.");
  return parts.join("\n");
}

function renderSources(list) {
  const box = $("#learn-sources");
  if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  let html = "<strong>Sources opened</strong>";
  list.forEach((s, i) => {
    html += '<div class="source-card"><span class="tag">PAGE</span><a href="' + esc(s.url) + '" target="_blank" rel="noopener">[' + (i + 1) + "] ' + esc(s.title) + '</a><div style="color:var(--muted);margin-top:4px">' + esc((s.extract || "").slice(0, 140)) + '...</div></div>';
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
  bubble("ai", "...", useSearch ? "searching Wikipedia..." : "thinking...");
  try {
    let reply; let sources = [];
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
      sources = extracts;
      reply = explainFromSources(msg, extracts);
      renderSources(extracts);
    } else {
      reply = "Web research is off. Turn on Research the web to read live Wikipedia pages.\n\nYou asked: " + msg;
      renderSources([]);
    }
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", reply, useSearch ? "Sources: live Wikipedia" : "");
  } catch (e) {
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", "Something went wrong: " + e.message + "\nCheck your internet and try again.");
  }
  $("#learn-go").disabled = false;
  input.focus();
}

$("#learn-go").addEventListener("click", sendLearn);
$("#learn-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendLearn(); } });
bubble("ai", "Hi — Study AI on your phone.\n\n• Homework — guided steps\n• Notes — Light / Medium / Hard / Short\n• Learn — optional live Wikipedia research\n\nAsk something or switch tabs above.");
