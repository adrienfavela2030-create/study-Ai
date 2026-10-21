const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function show(el, html) { el.classList.remove("hidden"); el.innerHTML = html; }
function showScreen(name) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $$(".tab").forEach((t) => t.classList.remove("active"));
  const screen = $("#screen-" + name);
  if (screen) screen.classList.add("active");
  const tab = document.querySelector('.tab[data-screen="' + name + '"]');
  if (tab) tab.classList.add("active");
}
$$(".tab").forEach((tab) => { tab.addEventListener("click", () => showScreen(tab.dataset.screen)); });
$$("[data-jump]").forEach((chip) => { chip.addEventListener("click", () => showScreen(chip.dataset.jump)); });
function pills(root, key, cb) {
  const el = $(root); if (!el) return;
  el.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active"); cb(btn.dataset[key]);
    });
  });
}
let hwMode = "help"; let noteStyle = "light";
pills("#hw-modes", "mode", (v) => (hwMode = v));
pills("#note-styles", "style", (v) => (noteStyle = v));
function solveHomework(text, mode, nums) {
  const t = text.trim(); if (!t) return null;
  const lines = ["What you are being asked", "- Read the question carefully."];
  if (nums) lines.push("- Focus on #: " + nums);
  lines.push("", "Break it down", "- Key words: what / why / how / calculate / explain", "- What do you already know?", "- What is missing?", "");
  if (mode === "help") lines.push("Help me understand", "1. Restate in your own words", "2. Name the topic", "3. One fact or formula", "4. First small step only", "5. If stuck, name the confusing part", "", "Your question:", t.slice(0, 800));
  else if (mode === "answer") lines.push("Direct approach", "- Use the question + your materials", "- Math: show the steps", "- Reading: cite a sentence", "", "Draft answer: _______________", "", "Question:", t.slice(0, 800));
  else lines.push("Answer + explain", "1. One-sentence answer", "2. Why", "3. Evidence or steps", "", "Answer: ...", "Because: ...", "Evidence: ...", "", "Question:", t.slice(0, 800));
  return lines.join("\n");
}
$("#hw-go").addEventListener("click", () => {
  const ans = solveHomework($("#hw-text").value, hwMode, $("#hw-nums").value.trim());
  const out = $("#hw-out");
  if (!ans) { show(out, "<p class=\"body\">Paste a question first.</p>"); return; }
  show(out, "<h3>Result</h3><div class=\"body\">" + esc(ans) + "</div>");
});
function makeNotes(text, style) {
  const raw = text.trim(); if (!raw) return null;
  const sentences = raw.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const n = style === "light" || style === "short" ? 5 : style === "medium" ? 10 : 16;
  const bullets = sentences.slice(0, n); const out = [];
  if (style === "light") { out.push("Light notes", ""); bullets.forEach((s, i) => out.push(i + 1 + ". " + s)); }
  else if (style === "short") { out.push("Short review", ""); bullets.forEach((s) => out.push("• " + s.slice(0, 110) + (s.length > 110 ? "…" : ""))); }
  else if (style === "medium") { out.push("Medium notes", "", "Main ideas"); bullets.slice(0, 4).forEach((s) => out.push("• " + s)); out.push("", "Details"); bullets.slice(4).forEach((s) => out.push("• " + s)); }
  else { out.push("Test-prep notes", ""); bullets.forEach((s, i) => out.push(i + 1 + ". " + s)); out.push("", "Prompts: causes? effects? names/dates? connections?"); }
  return out.join("\n");
}
$("#notes-go").addEventListener("click", () => {
  const notes = makeNotes($("#notes-text").value, noteStyle); const out = $("#notes-out");
  if (!notes) { show(out, "<p class=\"body\">Paste text first.</p>"); return; }
  show(out, "<h3>" + esc(noteStyle) + "</h3><div class=\"body\">" + esc(notes) + "</div>");
});
const chatEl = $("#chat");
function bubble(role, text, meta) {
  const div = document.createElement("div");
  div.className = "bubble " + (role === "user" ? "user" : "ai");
  div.innerHTML = esc(text) + (meta ? '<div class="meta">' + esc(meta) + "</div>" : "");
  chatEl.appendChild(div); chatEl.scrollTop = chatEl.scrollHeight;
}
async function wikiSearch(query) {
  const url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=" + encodeURIComponent(query) + "&limit=5&namespace=0&format=json&origin=*";
  const r = await fetch(url); if (!r.ok) throw new Error("Search failed");
  const data = await r.json(); const titles = data[1] || []; const urls = data[3] || [];
  return titles.map((title, i) => ({ title, url: urls[i] }));
}
async function wikiExtract(title) {
  const url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=" + encodeURIComponent(title) + "&format=json&origin=*";
  const r = await fetch(url); if (!r.ok) throw new Error("Page failed");
  const data = await r.json();
  const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];
  if (!pages.length || pages[0].missing !== undefined) return null;
  const p = pages[0];
  return { title: p.title, extract: (p.extract || "").slice(0, 2500), url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")) };
}
function explainFromSources(question, extracts) {
  if (!extracts.length) return "Nothing found. Try a shorter topic (e.g. water cycle).";
  const parts = ["About: " + question, ""];
  extracts.forEach((ex, i) => { parts.push("[" + (i + 1) + "] " + ex.title); parts.push(ex.extract.slice(0, 650) + (ex.extract.length > 650 ? "…" : ""), ""); });
  return parts.join("\n");
}
function renderSources(list) {
  const box = $("#learn-sources");
  if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  let html = "";
  list.forEach((s, i) => { html += '<div class="source-card"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">[' + (i + 1) + "] ' + esc(s.title) + "</a></div>"; });
  box.innerHTML = html;
}
async function sendLearn() {
  const input = $("#learn-input"); const msg = input.value.trim(); if (!msg) return;
  const useSearch = $("#learn-search").checked;
  bubble("user", msg); input.value = ""; $("#learn-go").disabled = true;
  bubble("ai", "…", useSearch ? "searching…" : "");
  try {
    let reply;
    if (useSearch) {
      let q = msg;
      for (const p of ["what is the ", "what is ", "what are ", "who is ", "explain ", "define "]) {
        if (q.toLowerCase().startsWith(p)) { q = q.slice(p.length).replace(/[?.!]+$/, "").trim(); break; }
      }
      const hits = await wikiSearch(q || msg); const extracts = [];
      for (const h of hits.slice(0, 2)) { const ex = await wikiExtract(h.title); if (ex && ex.extract) extracts.push(ex); }
      reply = explainFromSources(msg, extracts); renderSources(extracts);
    } else { reply = "Turn on Web research for live pages.\n\nYou asked: " + msg; renderSources([]); }
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", reply, useSearch ? "Wikipedia" : "");
  } catch (e) {
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    bubble("ai", "Error: " + e.message);
  }
  $("#learn-go").disabled = false; input.focus();
}
$("#learn-go").addEventListener("click", sendLearn);
$("#learn-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendLearn(); } });
bubble("ai", "Ask something. Web research reads live pages.");
