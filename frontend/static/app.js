const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`#panel-${tab.dataset.tool}`).classList.add("active");
  });
});

function setupSegmented(containerSelector, dataAttr, onChange) {
  const root = $(containerSelector);
  if (!root) return;
  root.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (onChange) onChange(btn.dataset[dataAttr]);
    });
  });
}

let homeworkMode = "help_me_understand";
let notesStyle = "light";
setupSegmented("#panel-homework .segmented", "mode", (v) => (homeworkMode = v));
setupSegmented("#panel-notes .segmented", "style", (v) => (notesStyle = v));

async function checkHealth() {
  const badge = $("#health-badge");
  try {
    const r = await fetch("/api/health");
    const d = await r.json();
    if (d.model_loaded) { badge.textContent = "model ready"; badge.className = "badge ok"; }
    else { badge.textContent = "API up · model not loaded"; badge.className = "badge warn"; }
  } catch { badge.textContent = "offline"; badge.className = "badge"; }
}
checkHealth();

function showResult(el, html) { el.classList.remove("hidden"); el.innerHTML = html; }
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function postJSON(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

$("#hw-submit").addEventListener("click", async () => {
  const text = $("#hw-text").value.trim();
  const numbers = $("#hw-numbers").value.trim();
  const out = $("#hw-result");
  if (!text) { showResult(out, `<p class="body">Paste a question first.</p>`); return; }
  $("#hw-submit").disabled = true;
  showResult(out, `<span class="loading"></span> Working…`);
  try {
    const d = await postJSON("/api/homework", { question_text: text, mode: homeworkMode, question_numbers: numbers || null });
    if (!d.ok) showResult(out, `<p class="body">${escapeHtml(d.error || "Failed")}</p>`);
    else showResult(out, `<h3>Answer</h3><div class="body">${escapeHtml(d.answer)}</div><p class="note">${escapeHtml(d.model_note || "")}</p>`);
  } catch (e) { showResult(out, `<p class="body">Error: ${escapeHtml(e.message)}</p>`); }
  $("#hw-submit").disabled = false;
});

$("#notes-submit").addEventListener("click", async () => {
  const text = $("#notes-text").value.trim();
  const out = $("#notes-result");
  if (!text) { showResult(out, `<p class="body">Paste source text first.</p>`); return; }
  $("#notes-submit").disabled = true;
  showResult(out, `<span class="loading"></span> Making ${notesStyle} notes…`);
  try {
    const d = await postJSON("/api/notes", { text, style: notesStyle });
    if (!d.ok) showResult(out, `<p class="body">${escapeHtml(d.error || "Failed")}</p>`);
    else showResult(out, `<h3>${escapeHtml(d.style)} notes</h3><div class="body">${escapeHtml(d.notes)}</div><p class="note">${escapeHtml(d.model_note || "")}</p>`);
  } catch (e) { showResult(out, `<p class="body">Error: ${escapeHtml(e.message)}</p>`); }
  $("#notes-submit").disabled = false;
});

const chatEl = $("#chat");
const learnHistory = [];
function addBubble(role, text, meta) {
  const div = document.createElement("div");
  div.className = `bubble ${role === "user" ? "user" : "ai"}`;
  div.innerHTML = escapeHtml(text) + (meta ? `<div class="meta">${escapeHtml(meta)}</div>` : "");
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function renderSources(search) {
  const box = $("#learn-sources");
  if (!search || !search.sources || !search.sources.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  let html = `<strong>Research:</strong> ${escapeHtml(search.summary || "")}`;
  search.sources.forEach((s) => {
    const tag = s.is_full_page ? `<span class="tag">FULL PAGE</span>` : `<span class="tag snip">SNIPPET</span>`;
    html += `<div class="source-card">${tag}<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title || s.url)}</a></div>`;
  });
  box.innerHTML = html;
}
async function sendLearn() {
  const input = $("#learn-input");
  const msg = input.value.trim();
  if (!msg) return;
  const useSearch = $("#learn-search").checked;
  addBubble("user", msg);
  input.value = "";
  $("#learn-submit").disabled = true;
  addBubble("ai", "…", "thinking");
  try {
    const d = await postJSON("/api/learn", { message: msg, history: learnHistory, use_search: useSearch, search_query: useSearch ? msg : null });
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    const reply = d.reply || "(no reply)";
    addBubble("ai", reply, d.model_note || "");
    learnHistory.push({ role: "user", content: msg });
    learnHistory.push({ role: "assistant", content: reply });
    if (d.search) renderSources(d.search);
  } catch (e) {
    if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
    addBubble("ai", "Error: " + e.message);
  }
  $("#learn-submit").disabled = false;
  input.focus();
}
$("#learn-submit").addEventListener("click", sendLearn);
$("#learn-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendLearn(); } });
addBubble("ai", "Hi — I’m Study AI. Web research is real. My language model is still tiny until more training is done.");
