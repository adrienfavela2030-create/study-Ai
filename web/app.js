// Study AI frontend. Talks only to this backend's /api endpoints.
// No secrets are stored in the frontend.
const $ = (id) => document.getElementById(id);
const API = window.location.origin.startsWith("file")
  ? "http://127.0.0.1:8000"
  : window.location.origin;

async function post(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// tool switching
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tool").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    $("tool-" + btn.dataset.tool).classList.add("active");
  });
});

// Homework AI
$("hw-run").addEventListener("click", async () => {
  const out = $("hw-out");
  out.textContent = "Checking worksheet...";
  const data = await post("/api/homework", {
    page_text: $("hw-text").value,
    selection: $("hw-selection").value,
    mode: $("hw-mode").value,
  });
  if (data.detected_question_numbers) {
    out.textContent =
      "Detected questions: " + data.detected_question_numbers.join(", ") +
      "  (selected: " + data.selected.join(", ") + ")\n\n";
  }
  for (const r of data.results || []) {
    out.textContent += `Q${r.question_number}: ${r.question_text}\n`;
    if (r.model_answer) out.textContent += "  " + r.model_answer + "\n";
    for (const n of r.notes || []) out.textContent += "  note: " + n + "\n";
    if (r.followup_needed) out.textContent += "  follow-up: " + r.followup_needed + "\n";
    out.textContent += "\n";
  }
  if ($("hw-file").files[0] && !$("hw-text").value) {
    out.textContent += "Tip: image reading requires the OCR pipeline to be trained; type the text for now.\n";
  }
});

// AI Notes
$("notes-run").addEventListener("click", async () => {
  const out = $("notes-out");
  out.textContent = "Making notes...";
  const data = await post("/api/notes", {
    text: $("notes-text").value,
    style: $("notes-style").value,
  });
  out.textContent = `Style: ${data.style} (${data.method})\n\n` +
    (data.notes || []).map((n, i) => `${i + 1}. ${n}`).join("\n");
});

// Learn With AI
function addMsg(cls, text) {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  $("learn-log").appendChild(div);
  $("learn-log").scrollTop = 1e9;
}
let sessionId = "s" + Date.now();
addMsg("ai", "Hi. What are you working on today?");
$("learn-send").addEventListener("click", async () => {
  const msg = $("learn-input").value.trim();
  if (!msg) return;
  addMsg("user", msg);
  $("learn-input").value = "";
  const data = await post("/api/learn", { session_id: sessionId, message: msg });
  addMsg("ai", data.reply);
});
$("learn-search").addEventListener("click", async () => {
  const msg = $("learn-input").value.trim() || "recent news about the topic";
  addMsg("user", "Research this: " + msg);
  $("learn-input").value = "";
  const data = await post("/api/search", { query: msg });
  if (data.status === "needs_api_key") {
    addMsg("ai", data.message);
    return;
  }
  let text = data.research_summary.note + "\n";
  (data.sources || []).forEach((s, i) => {
    text += `[${i + 1}] ${s.title} — ${s.url}` +
      (s.inspected ? " (opened and read)" : " (snippet only)") + "\n";
  });
  addMsg("ai", text);
});

// health / honest status
$("health-link").addEventListener("click", async (e) => {
  e.preventDefault();
  const res = await fetch(API + "/api/health");
  const data = await res.json();
  $("health-out").textContent = JSON.stringify(data.components, null, 2);
});
