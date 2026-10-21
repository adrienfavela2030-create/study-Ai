(function () {
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function showScreen(name) {
    $$(".screen").forEach(function (s) { s.classList.remove("is-on"); });
    $$(".tab").forEach(function (t) { t.classList.remove("is-on"); });
    var screen = document.getElementById("screen-" + name);
    if (screen) screen.classList.add("is-on");
    var tab = document.querySelector('.tab[data-screen="' + name + '"]');
    if (tab) tab.classList.add("is-on");
  }
  $$(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () { showScreen(tab.getAttribute("data-screen")); });
  });
  $$("[data-jump]").forEach(function (chip) {
    chip.addEventListener("click", function () { showScreen(chip.getAttribute("data-jump")); });
  });
  var hwMode = "help";
  var noteStyle = "light";
  function setupPills(rootSel, key, onPick) {
    var root = $(rootSel);
    if (!root) return;
    root.querySelectorAll(".pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        root.querySelectorAll(".pill").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        onPick(btn.getAttribute("data-" + key));
      });
    });
  }
  setupPills("#hw-modes", "mode", function (v) { hwMode = v; });
  setupPills("#note-styles", "style", function (v) { noteStyle = v; });
  function solveHomework(text, mode, nums) {
    var t = text.trim();
    if (!t) return null;
    var lines = ["What you are being asked", "- Read the question carefully."];
    if (nums) lines.push("- Focus on #: " + nums);
    lines.push("", "Break it down", "- Key words: what / why / how / calculate / explain", "- What do you already know?", "- What is missing?", "");
    if (mode === "help") lines.push("Help me understand", "1. Restate in your own words", "2. Name the topic", "3. One fact or formula", "4. First small step only", "5. If stuck, name the confusing part", "", "Your question:", t.slice(0, 800));
    else if (mode === "answer") lines.push("Direct approach", "- Use the question + your materials", "- Math: show the steps", "- Reading: cite a sentence", "", "Draft answer: _______________", "", "Question:", t.slice(0, 800));
    else lines.push("Answer + explain", "1. One-sentence answer", "2. Why", "3. Evidence or steps", "", "Answer: ...", "Because: ...", "Evidence: ...", "", "Question:", t.slice(0, 800));
    return lines.join("\n");
  }
  $("#hw-go").addEventListener("click", function () {
    var out = $("#hw-out");
    var ans = solveHomework($("#hw-text").value, hwMode, $("#hw-nums").value.trim());
    out.classList.remove("hidden");
    if (!ans) { out.innerHTML = '<p class="body">Paste a question first.</p>'; return; }
    out.innerHTML = "<h3>Result</h3><div class=\"body\">" + esc(ans) + "</div>";
  });
  function makeNotes(text, style) {
    var raw = text.trim();
    if (!raw) return null;
    var sentences = raw.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 15; });
    var n = style === "light" || style === "short" ? 5 : style === "medium" ? 10 : 16;
    var bullets = sentences.slice(0, n);
    var out = [];
    if (style === "light") { out.push("Light notes", ""); bullets.forEach(function (s, i) { out.push(i + 1 + ". " + s); }); }
    else if (style === "short") { out.push("Short review", ""); bullets.forEach(function (s) { out.push("• " + s.slice(0, 110) + (s.length > 110 ? "…" : "")); }); }
    else if (style === "medium") { out.push("Medium notes", "", "Main ideas"); bullets.slice(0, 4).forEach(function (s) { out.push("• " + s); }); out.push("", "Details"); bullets.slice(4).forEach(function (s) { out.push("• " + s); }); }
    else { out.push("Test-prep notes", ""); bullets.forEach(function (s, i) { out.push(i + 1 + ". " + s); }); out.push("", "Prompts: causes? effects? names/dates?"); }
    return out.join("\n");
  }
  $("#notes-go").addEventListener("click", function () {
    var out = $("#notes-out");
    var notes = makeNotes($("#notes-text").value, noteStyle);
    out.classList.remove("hidden");
    if (!notes) { out.innerHTML = '<p class="body">Paste text first.</p>'; return; }
    out.innerHTML = "<h3>" + esc(noteStyle) + "</h3><div class=\"body\">" + esc(notes) + "</div>";
  });
  var chatEl = $("#chat");
  function bubble(role, text, meta) {
    var div = document.createElement("div");
    div.className = "bubble " + (role === "user" ? "user" : "ai");
    div.innerHTML = esc(text) + (meta ? '<div class="meta">' + esc(meta) + "</div>" : "");
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
  function wikiSearch(query) {
    var url = "https://en.wikipedia.org/w/api.php?action=opensearch&search=" + encodeURIComponent(query) + "&limit=5&namespace=0&format=json&origin=*";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Search failed");
      return r.json();
    }).then(function (data) {
      var titles = data[1] || [];
      var urls = data[3] || [];
      return titles.map(function (title, i) { return { title: title, url: urls[i] }; });
    });
  }
  function wikiExtract(title) {
    var url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=" + encodeURIComponent(title) + "&format=json&origin=*";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Page failed");
      return r.json();
    }).then(function (data) {
      var pages = data.query && data.query.pages ? Object.keys(data.query.pages).map(function (k) { return data.query.pages[k]; }) : [];
      if (!pages.length || pages[0].missing !== undefined) return null;
      var p = pages[0];
      return { title: p.title, extract: (p.extract || "").slice(0, 2500), url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")) };
    });
  }
  function explainFromSources(question, extracts) {
    if (!extracts.length) return "Nothing found. Try a shorter topic.";
    var parts = ["About: " + question, ""];
    extracts.forEach(function (ex, i) {
      parts.push("[" + (i + 1) + "] " + ex.title);
      parts.push(ex.extract.slice(0, 650) + (ex.extract.length > 650 ? "…" : ""), "");
    });
    return parts.join("\n");
  }
  function renderSources(list) {
    var box = $("#learn-sources");
    if (!list || !list.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
    box.classList.remove("hidden");
    var html = "";
    list.forEach(function (s, i) {
      html += '<div class="source-card"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">[' + (i + 1) + "] ' + esc(s.title) + "</a></div>";
    });
    box.innerHTML = html;
  }
  function sendLearn() {
    var input = $("#learn-input");
    var msg = input.value.trim();
    if (!msg) return;
    var useSearch = $("#learn-search").checked;
    bubble("user", msg);
    input.value = "";
    $("#learn-go").disabled = true;
    bubble("ai", "…", useSearch ? "searching…" : "");
    function finish(reply, sources, meta) {
      if (chatEl.lastChild) chatEl.removeChild(chatEl.lastChild);
      bubble("ai", reply, meta || "");
      renderSources(sources || []);
      $("#learn-go").disabled = false;
      input.focus();
    }
    if (!useSearch) { finish("Turn on Web research for live pages.\n\nYou asked: " + msg, [], ""); return; }
    var q = msg;
    ["what is the ", "what is ", "what are ", "who is ", "explain ", "define "].forEach(function (p) {
      if (q.toLowerCase().indexOf(p) === 0) q = q.slice(p.length).replace(/[?.!]+$/, "").trim();
    });
    wikiSearch(q || msg).then(function (hits) {
      var chain = Promise.resolve([]);
      hits.slice(0, 2).forEach(function (h) {
        chain = chain.then(function (acc) {
          return wikiExtract(h.title).then(function (ex) {
            if (ex && ex.extract) acc.push(ex);
            return acc;
          });
        });
      });
      return chain;
    }).then(function (extracts) {
      finish(explainFromSources(msg, extracts), extracts, "Wikipedia");
    }).catch(function (e) {
      finish("Error: " + e.message, [], "");
    });
  }
  $("#learn-go").addEventListener("click", sendLearn);
  $("#learn-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); sendLearn(); }
  });
  bubble("ai", "Ask something. Web research reads live pages.");
})();
