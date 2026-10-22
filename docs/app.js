(function(){
  /* Study AI — full app with all-subjects research */
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function show(name){
    var pages = document.querySelectorAll(".page");
    for(var i=0;i<pages.length;i++) pages[i].classList.remove("on");
    var tabs = document.querySelectorAll(".tab");
    for(var j=0;j<tabs.length;j++) tabs[j].classList.remove("on");
    var p = $("page-"+name); if(p) p.classList.add("on");
    var t = $("tab-"+name); if(t) t.classList.add("on");
  }
  $("tab-home").onclick = function(){ show("home"); };
  $("tab-homework").onclick = function(){ show("homework"); };
  $("tab-notes").onclick = function(){ show("notes"); };
  $("tab-learn").onclick = function(){ show("learn"); };
  $("go-hw").onclick = function(){ show("homework"); };
  $("go-notes").onclick = function(){ show("notes"); };
  $("go-learn").onclick = function(){ show("learn"); };
  function setupPills(id, attr, cb){
    var root = $(id); if(!root) return;
    var pills = root.getElementsByClassName("pill");
    for(var i=0;i<pills.length;i++){
      pills[i].onclick = (function(btn){ return function(){
        for(var k=0;k<pills.length;k++) pills[k].classList.remove("on");
        btn.classList.add("on"); cb(btn.getAttribute(attr));
      }; })(pills[i]);
    }
  }
  var hwMode = "explain", hwStyle = "grade7", hwQuestions = [], hwSubject = "";
  setupPills("hw-modes", "data-m", function(v){ hwMode = v; });
  setupPills("hw-style", "data-s", function(v){ hwStyle = v; });
  setupPills("hw-subject", "data-subj", function(v){ hwSubject = v; });
  function setHwStep(n){
    var labels = ["Step 1 · Add the worksheet","Step 2 · Pick questions","Step 3 · How to help","Step 4 · Result"];
    $("hw-step-label").textContent = labels[n-1] || "";
    var dots = $("hw-dots").children;
    for(var i=0;i<dots.length;i++) dots[i].className = "step-dot" + (i+1 < n ? " done" : (i+1 === n ? " on" : ""));
    $("hw-s1").style.display = n===1 ? "block" : "none";
    $("hw-s2").style.display = n===2 ? "block" : "none";
    $("hw-s3").style.display = n===3 ? "block" : "none";
    $("hw-s4").style.display = n===4 ? "block" : "none";
  }
  /* ---- OCR/manual text cleanup: REMOVE ONLY UNAMBIGUOUS structural
     junk (box-drawing/table borders). Everything uncertain is KEPT and
     FLAGGED for the student to review — deletion heuristics (vowel
     rules, symbol-run thresholds) deleted legitimate content like
     'LCD', 'GCD', '...', '+' and '#1' in earlier versions, so they are
     gone: uncertain text is preserved and reported, never silently
     dropped. ---- */
  function cleanOcrText(raw){
    if(!raw) return { text: "", junkRatio: 0, removed: [], suspects: [] };
    var lines = raw.replace(/\r/g,"\n").split("\n"), out = [], removed = 0, suspects = [];
    for(var i=0;i<lines.length;i++){
      var line = lines[i];
      // remove box-drawing / table border runs (unambiguous structural junk)
      var before = line;
      line = line.replace(/[\u2500-\u257F\u2550-\u256C]+/g," ");
      if(before !== line) removed++;
      // flag (do NOT remove) likely misreads: vowel-less alphabetic runs
      // that are not known acronyms, and long symbol runs
      var tokens = line.split(/\s+/);
      for(var j=0;j<tokens.length;j++){
        var w = tokens[j]; if(!w) continue;
        if(/^[A-Za-z]{4,}$/.test(w) && !/[aeiouyAEIOUY]/.test(w) && !/^(LCD|GCD|HCl|XML|HTML|SQL|NASA|DNA|RNN|LSTM|CNN|OCR|AI)$/.test(w)) suspects.push(w);
        if(/^[^A-Za-z0-9]{4,}$/.test(w) && !/^\.\.\.$/.test(w)) suspects.push(w);
      }
      var joined = line.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
      if(joined) out.push(joined);
    }
    return { text: out.join("\n"), junkRatio: out.length ? removed/Math.max(1,out.length) : 1, removed: [], suspects: suspects.slice(0,12) };
  }
  function isGibberish(text){
    if(!text || text.length < 8) return true;
    var letters = (text.match(/[a-zA-Z]/g) || []).length;
    if(letters / text.length < 0.45) return true;
    var words = text.split(/\s+/).filter(function(w){ return w.length > 0; });
    if(words.length < 3) return true;
    var weird = 0, singles = 0;
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(w.length === 1 && !/^(a|A|I)$/.test(w)) singles++;
      if(w.length >= 3 && !/[aeiouAEIOU]/.test(w) && /[a-zA-Z]{3,}/.test(w)) weird++;
    }
    return weird / words.length > 0.30 || singles / words.length > 0.20;
  }
  function preprocessImage(file){
    return new Promise(function(resolve){
      var img = new Image(); var url = URL.createObjectURL(file);
      img.onload = function(){
        try {
          var maxW = 1600;
          var scale = img.width > maxW ? maxW / img.width : (img.width < 600 ? 2 : 1.25);
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
          var id = ctx.getImageData(0,0,w,h), d = id.data;
          for(var i=0;i<d.length;i+=4){
            var g = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; g = (g-128)*1.35+128;
            if(g<0)g=0; if(g>255)g=255; if(g>200)g=255; else if(g<90)g=0;
            d[i]=d[i+1]=d[i+2]=g;
          }
          ctx.putImageData(id,0,0); URL.revokeObjectURL(url);
          canvas.toBlob(function(blob){ resolve(blob||file); }, "image/png");
        } catch(e){ URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function runOCR(file, statusEl, textEl, prevEl){
    if(prevEl){ try{ prevEl.src = URL.createObjectURL(file); prevEl.style.display = "block"; }catch(e){} }
    if(statusEl) statusEl.textContent = "Photo added. Type the questions below.";
    // This compliant build does NOT use pretrained OCR (Tesseract) — the
    // project's rules forbid pretrained model weights, including OCR.
    // The photo is shown for reference; the student types the text.
    // The from-scratch OCR (runs/ocr_v1) reads synthetic images only so
    // far, so it is not wired into the UI yet.
    return;
  }
  function onHwFile(input){ var f = input.files && input.files[0]; if(!f) return; runOCR(f, $("hw-ocr"), $("hw-text"), $("hw-prev")); }
  $("hw-cam").onchange = function(){ onHwFile(this); };
  $("hw-up").onchange = function(){ onHwFile(this); };
  function parseQuestions(text){
    var lines = text.split(/\n/), qs = [], buf = "";
    var reStart = /^\s*(?:(?:question\s*)?\d+[\).\:\-]|[Qq]\d+[\).\:\-]|[A-D][\).]|\(\d+\))/;
    for(var i=0;i<lines.length;i++){
      var line = lines[i].replace(/\s+$/g,"");
      if(!line.replace(/\s/g,"")) continue;
      if(reStart.test(line) && buf){ qs.push(buf.replace(/^\s+|\s+$/g,"")); buf = line; }
      else buf = buf ? (buf + " " + line) : line;
    }
    if(buf.replace(/^\s+|\s+$/g,"")) qs.push(buf.replace(/^\s+|\s+$/g,""));
    if(qs.length <= 1 && text.length > 80){
      var parts = text.replace(/\s+/g," ").split(/(?=\b\d+[\).])/); qs = [];
      for(var i=0;i<parts.length;i++){ var p = parts[i].replace(/^\s+|\s+$/g,""); if(p.length > 12) qs.push(p); }
    }
    if(!qs.length) qs = [text.replace(/^\s+|\s+$/g,"").slice(0,500)];
    return qs.slice(0,12).map(function(q, idx){ return { n: idx+1, text: q.slice(0,300) }; });
  }
  $("hw-next1").onclick = function(){
    var t = $("hw-text").value.replace(/^\s+|\s+$/g,"");
    if(!t){ $("hw-ocr").textContent = "Add a photo or type the worksheet text first."; return; }
    var cleaned = cleanOcrText(t); t = cleaned.text;
    if(!t || isGibberish(t)){ $("hw-ocr").textContent = "That text looks unreadable. Fix it or type the real questions."; return; }
    if(cleaned.suspects && cleaned.suspects.length){
      $("hw-ocr").textContent = "Some words look off \u2014 please double-check these: " + cleaned.suspects.join(" ");
    } else if($("hw-ocr").textContent.indexOf("look off") !== -1){ $("hw-ocr").textContent = ""; }
    $("hw-text").value = t;
    hwQuestions = parseQuestions(t);
    var box = $("hw-qlist"); box.innerHTML = "";
    for(var i=0;i<hwQuestions.length;i++){
      var q = hwQuestions[i], div = document.createElement("div"); div.className = "q-item";
      div.innerHTML = '<input type="checkbox" id="qq'+i+'" checked /><label for="qq'+i+'"><strong>#'+q.n+'</strong> (do in order) — '+esc(q.text)+'</label>';
      box.appendChild(div);
    }
    setHwStep(2);
  };
  $("hw-back2").onclick = function(){ setHwStep(1); };
  /* ---- task understanding: what is each question actually asking? ---- */
  function classifyTask(q){
    var t = q.replace(/\s+/g," ").toLowerCase();
    if(/\b\d+\s*[\+\-\x\u00d7\*/]\s*\d+/.test(t) || /\b(solve|calculate|compute|evaluate|find the value)\b/.test(t)) return "math";
    if(/\b[a-d]\s*[).]/.test(q) || /\b(multiple choice|circle the)\b/.test(t)) return "choice";
    if(/\b(essay|write a|write about|paragraph|one page|story about)\b/.test(t)) return "essay";
    if(/\b(mainly|mostly|best describes|main idea|what is the story|what is the passage|what is the text)\b/.test(t)) return "main-idea";
    if(/\b(what does .* mean|closest in meaning|synonym|antonym|vocabulary|define)\b/.test(t)) return "vocab";
    if(/\b(why|explain|how)\b/.test(t)) return "explain";
    if(/\b(who|what|when|where|which|name)\b/.test(t)) return "recall";
    return "general";
  }
  /* ---- safe arithmetic: evaluate + - * / ( ) ---- */
  function solveMath(text){
    var expr = text.replace(/[\u00d7\x]/g,"*").replace(/\u00f7/g,"/").replace(/[^0-9+\-*/(). ]/g," ");
    // prefer the longest arithmetic run that contains at least one operator
    // (this captures bracketed expressions like 12 * (4 + 1))
    var runs = expr.match(/[-(\d][\d\s+\-*/().]*/g) || [];
    var best = null;
    for(var i=0;i<runs.length;i++){
      var r = runs[i].replace(/\s+/g," ").trim();
      if(!/[+\-*/]/.test(r)) continue;
      if(!/^[-(]?\d/.test(r) && !/^\(/.test(r)) continue;
      // balanced brackets check
      var open = 0, ok = true;
      for(var c=0;c<r.length;c++){ if(r[c]==="(") open++; if(r[c]===")") open--; if(open<0){ ok=false; break; } }
      if(!ok || open !== 0) continue;
      if(best === null || r.length > best.length) best = r;
    }
    if(best === null) return null;
    try{
      var val = Function("'use strict';return ("+best+")")();
      if(typeof val !== "number" || !isFinite(val)) return null;
      return { expr: best, value: Math.round(val*10000)/10000 };
    }catch(e){ return null; }
  }
  /* ---- Help Me Understand for math: pure function returning the exact
     guidance text. Must NOT contain the final answer value. ---- */
  function mathExplain(math){
    return [
      "How to solve " + math.expr + ":",
      "1. Write the problem out: " + math.expr,
      "2. Order of operations: brackets, then \u00d7 \u00f7, then + \u2212",
      "3. Work it out step by step, then check it against the question.",
      "(Want the final number? Switch mode to Give me the answer or Answer + Explanation.)"
    ].join("\n");
  }
  /* ---- find evidence in the worksheet passage (not in questions,
     answer choices, or instructions). Exclusion happens LINE-BY-LINE
     before sentence splitting, so a choice can never masquerade as
     evidence. Keyword overlap only PROPOSES a sentence; it never
     proves an answer. ---- */
  function passageEvidence(qText, allText){
    var skip = {"what":1,"which":1,"about":1,"this":1,"that":1,"from":1,"your":1,"best":1,"describes":1,"mainly":1,"mostly":1,"story":1,"text":1,"passage":1,"question":1,"answer":1,"sentence":1};
    var qWords = qText.toLowerCase().replace(/[^a-z ]/g," ").split(/\s+/)
      .filter(function(w){ return w.length > 3 && !skip[w]; });
    if(!qWords.length) return null;
    // 1. line-level exclusion FIRST (question lines, choices, instructions)
    var lines = allText.split(/\n+/), keptLines = [];
    for(var li=0; li<lines.length; li++){
      var line = lines[li].replace(/^\s+|\s+$/g,"");
      if(!line) continue;
      if(/^(?:question\s*)?\d{1,2}[\).:\-]\s/i.test(line)) continue;   // question lines
      if(/^[A-Da-d]\s*[).:]\s+\S/.test(line)) continue;                 // answer choices
      if(/^(read|answer|choose|circle|write|complete|use|name|fill)\b/i.test(line)) continue; // instructions
      keptLines.push(line);
    }
    // 2. sentence split within surviving lines only
    var sents = keptLines.join(" ").split(/(?=[A-Z][^.!?]{20,}[.!?])/g);
    var best = null, bestScore = 0;
    for(var i=0;i<sents.length;i++){
      var s = sents[i]; if(s.length < 25 || s.length > 400) continue;
      var l = s.toLowerCase(), score = 0;
      for(var j=0;j<qWords.length;j++) if(l.indexOf(qWords[j]) !== -1) score++;
      if(score > bestScore){ bestScore = score; best = s; }
    }
    return bestScore > 0 ? { sentence: best.trim(), score: bestScore } : null;
  }
  /* ---- essay scaffolding ---- */
  function essayPlan(qText, styleLabel){
    var words = { grade7: "250\u2013300", high: "400\u2013500", normal: "250\u2013400" }[hwStyle] || "250\u2013400";
    return [
      "Essay plan (" + words + " words, " + styleLabel.toLowerCase() + " level)",
      "",
      "1. Hook + background: start with an interesting fact or short scene.",
      "2. Thesis: directly answer \u201c" + qText.slice(0,90) + "\u201d in one clear sentence.",
      "3. Body paragraph 1 \u2014 strongest reason: point \u2192 quote/example from the text \u2192 explanation.",
      "4. Body paragraph 2 \u2014 second reason: same structure.",
      "5. Conclusion: restate the thesis in new words + the bigger takeaway. No new facts.",
      "",
      "Sentence starters:",
      "\u2022 \u201cOne reason ___ is that the text says ___\u2026\u201d",
      "\u2022 \u201cThis matters because ___\u2026\u201d",
      "\u2022 \u201cIn conclusion, ___ shows that ___\u2026\u201d"
    ];
  }
  /* ---- per-question answer builder ---- */
  function buildAnswer(q, task, subject, mode, allText, styleLabel){
    var lines = [], math = null, evidence = null;
    if(task === "math") math = solveMath(q.text);
    if(["main-idea","explain","recall","general","vocab"].indexOf(task) !== -1) evidence = passageEvidence(q.text, allText);
    if(task === "essay" || (mode === "essay" && task !== "math")){
      return essayPlan(q.text, styleLabel).join("\n");
    }
    if(task === "math" && math){
      if(mode === "explain"){
        // Help Me Understand: guide without revealing the final answer.
        // mathExplain() is a pure function so tests can execute the
        // EXACT text the student sees and verify the value never appears.
        return mathExplain(math);
      } else {
        lines.push("Answer: " + math.value);
        if(mode !== "answer") lines.push("(" + math.expr + " = " + math.value + " \u2014 computed with the arithmetic checker, not guessed)");
      }
      return lines.join("\n");
    }
    if(task === "math" && !math){
      return mode === "explain"
        ? "1. Write what the problem gives you\n2. Decide which operation fits (+ \u2212 \u00d7 \u00f7)\n3. Solve step by step and check the result"
        : "I couldn't read the numbers cleanly from this question \u2014 type it out fully (e.g. \u201c12 \u00d7 4\u201d) and I'll compute it exactly.";
    }
    if(task === "choice"){
      lines.push("Multiple-choice strategy:");
      lines.push("\u2022 Cross out answers that are clearly wrong first");
      lines.push("\u2022 Go back to the passage lines about this question \u2014 the right choice restates them");
      if(evidence) lines.push("\u2022 Your worksheet says: \u201c" + evidence.sentence.slice(0,180) + "\u201d \u2014 pick the choice closest to this.");
      return lines.join("\n");
    }
    if(evidence){
      // Keyword overlap PROPOSES a sentence — it does not answer the
      // question. Present the excerpt as UNVERIFIED, relevant material
      // and teach the student to check it against the question. The
      // question is NOT marked answered here.
      lines.push("Relevant excerpt from your worksheet (not yet verified as an answer):");
      lines.push("\u201c" + evidence.sentence.slice(0,200) + "\u201d");
      lines.push("");
      lines.push("How to answer this yourself:");
      lines.push("1. Find that sentence in the passage");
      lines.push("2. Check: does it actually answer what the question asks?");
      lines.push("3. If yes, say it in your own words and add one more detail from the passage");
      return lines.join("\n");
    }
    var tips = subjectTips(subject);
    if(mode === "explain"){
      lines.push("What this question is asking");
      lines.push("\u2022 Task: " + ({ "main-idea":"find the big idea","vocab":"figure out what a word means","explain":"give reasons","recall":"find the fact in the text","general":"understand the question" })[task]);
      lines.push("\u2022 " + tips[1]);
      lines.push("\u2022 If the passage isn't in the text box, add it \u2014 then I can quote exact evidence.");
    } else {
      lines.push("I don't have the passage this question refers to, so I won't guess an answer.");
      lines.push("Add the passage (paste or photograph it) and I'll answer with evidence from it.");
    }
    return lines.join("\n");
  }
  $("hw-next2").onclick = function(){
    /* auto-pick the subject; the student can change it on the next step */
    var sel = [];
    for(var i=0;i<hwQuestions.length;i++){ var cb = $("qq"+i); if(cb && cb.checked) sel.push(hwQuestions[i]); }
    if(!sel.length) sel = hwQuestions.slice(0,1);
    var guessed = detectSubject(sel.map(function(q){ return q.text; }).join(" "));
    hwSubject = guessed;
    var pills = $("hw-subject").getElementsByClassName("pill");
    for(var p=0;p<pills.length;p++) pills[p].classList.toggle("on", pills[p].getAttribute("data-subj") === guessed);
    $("hw-subject-note").textContent = "Picked \u201c" + SUBJECTS[guessed] + "\u201d from your questions \u2014 tap a different one if that's wrong.";
    setHwStep(3);
  };
  $("hw-back3").onclick = function(){ setHwStep(2); };
  $("hw-restart").onclick = function(){ $("hw-text").value=""; $("hw-prev").style.display="none"; $("hw-ocr").textContent=""; $("hw-opt").value=""; setHwStep(1); };
  var SUBJECTS = { math: "Math", science: "Science", english: "English / Reading", history: "History / Social Studies", general: "General" };
  function detectSubject(text){
    var t = text.toLowerCase();
    if(/\d\s*[\+\-\x\*\/=]|equation|solve for|algebra|geometry|fraction|percent|area of|volume|product of|sum of|quotient/.test(t)) return "math";
    if(/cell|photosynthesis|atom|gravity|force|energy|organism|hypothesis|biology|chemistry|physics|ecosystem|mars|planet/.test(t)) return "science";
    if(/essay|paragraph|theme|character|metaphor|poem|author|novel|chapter|grammar|thesis|fable|story|passage|narrator|plot|stanza/.test(t)) return "english";
    if(/war|century|civilization|revolution|president|empire|history|ancient|colony|amendment|constitution|dynasty/.test(t)) return "history";
    return "general";
  }
  function subjectTips(subj){
    if(subj==="math") return ["Math tips","• Write what is given and what to find","• Show each step","• Check units"];
    if(subj==="science") return ["Science tips","• Name the concept","• Cause → effect","• Use class vocabulary"];
    if(subj==="english") return ["English tips","• Claim + evidence + explanation","• Clear topic sentence"];
    if(subj==="history") return ["History tips","• Who / what / when / where","• Cause and effect","• Why it mattered"];
    return ["Study tips","• Restate the question","• Answer in complete thoughts"];
  }
  function styleGuide(s){
    if(s==="grade7") return "Write clearly for 7th grade and up.";
    if(s==="high") return "Write at high-school level.";
    return "Write like explaining to a friend.";
  }
  $("hw-go").onclick = function(){
    var selected = [];
    for(var i=0;i<hwQuestions.length;i++){ var cb = $("qq"+i); if(cb && cb.checked) selected.push(hwQuestions[i]); }
    if(!selected.length) selected = hwQuestions.slice(0,1);
    var opt = $("hw-opt").value.replace(/^\s+|\s+$/g,"");
    var allText = $("hw-text").value;
    var subj = hwSubject || detectSubject(allText);
    var styleLabel = hwStyle === "grade7" ? "7th grade+" : hwStyle === "high" ? "high school" : "everyday";
    var lines = [];
    lines.push("Plan — do in this order:");
    for(var i=0;i<selected.length;i++) lines.push("  "+(i+1)+". #"+selected[i].n+" — "+selected[i].text.slice(0,80));
    lines.push("");
    lines.push("Subject: "+SUBJECTS[subj]+(hwSubject ? " (you picked this)" : " (auto-detected)"));
    lines.push("Mode: "+({ explain: "Help me understand", answer: "Give me the answer", both: "Answer + Explanation", essay: "Essay mode" })[hwMode]);
    lines.push("Writing level: "+styleLabel);
    if(opt) lines.push("Your note: "+opt);
    lines.push("");
    for(var i=0;i<selected.length;i++){
      var q = selected[i];
      var task = classifyTask(q.text);
      lines.push("────────");
      lines.push("Question #"+q.n + "  ·  " + ({ math:"math", choice:"multiple choice", essay:"essay", "main-idea":"main idea", vocab:"vocabulary", explain:"explain", recall:"recall", general:"general" })[task]);
      lines.push(q.text); lines.push("");
      lines.push(buildAnswer(q, task, subj, hwMode, allText, styleLabel));
      lines.push("");
    }
    $("hw-out").innerHTML = '<div class="t">Homework help</div>'+esc(lines.join("\n")); setHwStep(4);
  };
  var noteStyle = "short";
  setupPills("note-modes", "data-s", function(v){ noteStyle = v; });
  function onNotesFile(input){ var f = input.files && input.files[0]; if(!f) return; runOCR(f, $("notes-ocr"), $("notes-text"), $("notes-prev")); }
  $("notes-cam").onchange = function(){ onNotesFile(this); };
  $("notes-up").onchange = function(){ onNotesFile(this); };
  $("notes-fetch").onclick = function(){
    var url = $("notes-url").value.replace(/^\s+|\s+$/g,"");
    if(!url){ $("notes-ocr").textContent = "Paste a link first."; return; }
    if(!/^https?:\/\//i.test(url)) url = "https://" + url;
    $("notes-ocr").textContent = "Loading page text…";
    fetch("https://r.jina.ai/" + url).then(function(r){ if(!r.ok) throw new Error("fail"); return r.text(); }).then(function(txt){
      txt = txt.replace(/^\s+|\s+$/g,"").slice(0,20000);
      if(txt.length < 40) throw new Error("Empty");
      $("notes-text").value = txt; $("notes-ocr").textContent = "Page text loaded.";
    }).catch(function(){ $("notes-ocr").textContent = "Could not open that link. Paste the text below."; });
  };
  function makeNotes(raw, style){
    raw = raw.replace(/^\s+|\s+$/g,""); if(!raw) return null;
    var parts = raw.replace(/\s+/g," ").replace(/([.!?])/g,"$1\n").split("\n"), sents = [];
    for(var i=0;i<parts.length;i++){ var s = parts[i].replace(/^\s+|\s+$/g,""); if(s.length > 20) sents.push(s); }
    if(!sents.length) sents = [raw.slice(0,200)];
    var base = Math.min(sents.length, Math.max(3, Math.floor(sents.length / (style==="short"?4:style==="medium"?3:2))));
    var n = style==="short" ? Math.min(base, 8) : style==="medium" ? Math.min(base, 12) : Math.min(base, 16);
    var picks = sents.slice(0, n), lines = [];
    if(style==="short"){ lines.push("Short notes"); lines.push(""); for(var i=0;i<picks.length;i++) lines.push("• "+picks[i].slice(0,120)); }
    else if(style==="medium"){ lines.push("Medium notes"); lines.push(""); for(var i=0;i<picks.length;i++) lines.push((i+1)+". "+picks[i].slice(0,180)); }
    else { lines.push("Longer notes"); lines.push(""); for(var i=0;i<picks.length;i+=3){ var group = picks.slice(i,i+3); lines.push("Note "+(Math.floor(i/3)+1)); for(var j=0;j<group.length;j++) lines.push(group[j].slice(0,200)); lines.push(""); } }
    lines.push("────────"); lines.push("Test tips: who/what/why · cause → effect");
    return lines.join("\n");
  }
  $("notes-btn").onclick = function(){
    var notes = makeNotes($("notes-text").value, noteStyle), out = $("notes-out");
    if(!notes){ out.className = "panel show"; out.innerHTML = '<div class="t">Notes</div>Add a photo, link, or text first.'; return; }
    out.className = "panel show"; out.innerHTML = '<div class="t">'+esc(noteStyle)+' notes</div>'+esc(notes);
  };
  var chat = $("chat");
  var liveEl = null;
  var outputMode = "normal";
  var attachText = "";
  var memory = { lastTitle: "", lastAuthor: "", lastTopic: "", lastKind: "", history: [], lastCandidates: [] };
  function bubble(who, text){
    var d = document.createElement("div");
    d.className = "b "+(who==="me"?"me":"ai");
    if(who === "me") d.textContent = text;
    else d.innerHTML = '<div class="body">'+esc(text)+'</div>';
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  function startLive(){
    var d = document.createElement("div"); d.className = "b ai";
    d.innerHTML = '<span class="live">Starting…</span>';
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; liveEl = d;
  }
  function setLive(msg){
    if(!liveEl) return;
    var el = liveEl.querySelector(".live"); if(el) el.textContent = msg;
    chat.scrollTop = chat.scrollHeight;
  }
  function endLive(){ if(liveEl && liveEl.parentNode) liveEl.parentNode.removeChild(liveEl); liveEl = null; }
  function formatTime(ms){ if(ms < 1000) return ms + " ms"; return (ms/1000).toFixed(1) + " s"; }
  function addActions(container, plainText, startedAt){
    var bar = document.createElement("div"); bar.className = "msg-actions";
    var left = document.createElement("div"); left.className = "left";
    var copyBtn = document.createElement("button"); copyBtn.type = "button"; copyBtn.className = "icon-btn"; copyBtn.title = "Copy";
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.onclick = function(){
      var t = plainText || container.innerText || "";
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function(){ copyBtn.style.color = "#4ade80"; setTimeout(function(){ copyBtn.style.color = ""; }, 1200); });
    };
    var shareBtn = document.createElement("button"); shareBtn.type = "button"; shareBtn.className = "icon-btn"; shareBtn.title = "Share";
    shareBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
    shareBtn.onclick = function(){
      var t = plainText || container.innerText || "";
      if(navigator.share) navigator.share({ text: t }).catch(function(){});
      else if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
    };
    left.appendChild(copyBtn); left.appendChild(shareBtn);
    var time = document.createElement("span"); time.className = "time"; time.textContent = formatTime(Date.now() - startedAt);
    bar.appendChild(left); bar.appendChild(time); container.appendChild(bar);
  }
  function bubbleResult(html, plainText, startedAt){
    var d = document.createElement("div"); d.className = "b ai fade-in";
    var body = document.createElement("div"); body.className = "body"; body.innerHTML = html;
    d.appendChild(body); addActions(d, plainText, startedAt);
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  bubble("ai", "Ask any subject — science, history, math, books, and more.\nI research topics and write a short clear answer.\nBooks: title first; if wrong, say the author. Follow-ups: more, simpler, causes…");
  var plusBtn = $("plus-btn"), attachMenu = $("attach-menu");
  if(plusBtn && attachMenu) plusBtn.onclick = function(){ attachMenu.classList.toggle("on"); };
  function wireAttach(btnId, inputId){
    var b = $(btnId), inp = $(inputId); if(!b || !inp) return;
    b.onclick = function(){ inp.click(); };
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; if(!f) return;
      if(attachMenu) attachMenu.classList.remove("on");
      // images are not auto-read in this build: pretrained OCR is not
      // allowed and the from-scratch OCR is not trained for photos yet.
      if(f.type.indexOf("image/") === 0){
        var input = $("learn-in");
        if(input && !input.value) input.value = "";
      }
    };
  }
  wireAttach("att-cam", "att-cam-input"); wireAttach("att-photo", "att-photo-input"); wireAttach("att-file", "att-file-input");
  var modeBtn = $("mode-btn");
  if(modeBtn) modeBtn.onclick = function(){
    if(outputMode === "normal"){ outputMode = "detailed"; modeBtn.textContent = "Detailed"; }
    else if(outputMode === "detailed"){ outputMode = "simple"; modeBtn.textContent = "Simple"; }
    else { outputMode = "normal"; modeBtn.textContent = "Normal"; }
  };
  var micBtn = $("mic-btn"), recognizing = false, recognition = null;
  if(micBtn){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SR){
      recognition = new SR(); recognition.lang = "en-US"; recognition.interimResults = false;
      recognition.onresult = function(ev){
        var t = ""; for(var i=0;i<ev.results.length;i++) t += ev.results[i][0].transcript;
        var input = $("learn-in"); if(input) input.value = (input.value ? input.value + " " : "") + t;
      };
      recognition.onend = function(){ recognizing = false; micBtn.classList.remove("mic-on"); };
      recognition.onerror = function(){ recognizing = false; micBtn.classList.remove("mic-on"); };
      micBtn.onclick = function(){
        if(recognizing){ recognition.stop(); return; }
        recognizing = true; micBtn.classList.add("mic-on");
        try{ recognition.start(); }catch(e){ recognizing = false; micBtn.classList.remove("mic-on"); }
      };
    }
  }
  function cleanQuery(msg){
    var q = msg.replace(/^\s+|\s+$/g,"");
    var prefixes = ["what is the ","what is ","explain ","tell me about ","about ","summarize ","i am reading ","i'm reading ","the book ","book called ","find ","search for ","look up "];
    var lower = q.toLowerCase();
    for(var i=0;i<prefixes.length;i++){ if(lower.indexOf(prefixes[i])===0){ q = q.slice(prefixes[i].length); lower = q.toLowerCase(); } }
    return q.replace(/[?.!]+$/g,"").replace(/^\s+|\s+$/g,"");
  }
  function extractBookHints(msg){
    var raw = msg.replace(/^\s+|\s+$/g,""); var title = null, author = null;
    var m = raw.match(/"([^"]{2,100})"/); if(m) title = m[1];
    var by = raw.match(/(.+?)\s+by\s+([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/);
    if(by){ var t = by[1].replace(/^[\s"']+|[\s"']+$/g,""); if(!title && t.length > 1) title = t.replace(/^(the book|book|novel)\s+/i,""); author = by[2].replace(/^\s+|\s+$/g,""); }
    if(!title) title = cleanQuery(raw);
    return { title: title, author: author };
  }
  function stripAuthorPrefix(m){
    // "the author Gordon Korman" -> "Gordon Korman" ("the author is X" also handled)
    return m.replace(/^(the\s+)?author\s+(is\s+)?/i, "").replace(/^(by|written by)\s+/i, "").replace(/^\s+|\s+$/g, "");
  }
  function isAuthorOnly(msg){
    var m = msg.replace(/^\s+|\s+$/g,"");
    if(/^(by|author|written by|the author is|author is)\s+/i.test(m)) return true;
    if(memory.lastTitle && /^[A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3}$/.test(m) && m.split(/\s+/).length <= 4) return true;
    if(memory.lastTitle && /^the author\b/i.test(m)) return true;
    return false;
  }
  function isCorrection(msg){
    var m = msg.replace(/^\s+/g,"");
    return /^(no|wrong|not that|actually|i meant|it'?s|the real|correct)/i.test(m) || /^(by|author)\s+/i.test(m);
  }
  function looksLikeBook(q, authorQ, kind){
    if(kind === "book" || authorQ) return true;
    if(/\b(book|novel|author|chapter)\b/i.test(q)) return true;
    return false;
  }
  function resolveQuery(msg){
    var hints = extractBookHints(msg);
    var titleQ = hints.title || "";
    var authorQ = hints.author || "";
    var raw = msg.replace(/^\s+|\s+$/g,"");
    // numeric reply picks from the last candidate list we offered
    if(memory.lastCandidates && memory.lastCandidates.length && /^\d{1,2}$/.test(raw)){
      var pick = memory.lastCandidates[parseInt(raw, 10) - 1];
      if(pick){
        return { titleQ: pick.title, authorQ: pick.authors || "", kind: "book",
                 note: "Using your pick: \u201c"+pick.title+"\u201d", candidate: pick };
      }
    }
    if(isAuthorOnly(raw) && memory.lastTitle){
      var a = authorQ || stripAuthorPrefix(raw);
      return { titleQ: memory.lastTitle, authorQ: a, kind: "book", note: "Using \""+memory.lastTitle+"\" + author "+a };
    }
    if(isCorrection(raw) && memory.lastTitle){
      var a2 = authorQ || raw.replace(/^(no[,.]?\s*|wrong[,.]?\s*|not that[,.]?\s*|actually\s*|i meant\s*|it'?s\s*|the real\s*|correct[,.]?\s*)/i,"").replace(/^(by|author is|the author is|written by)\s+/i,"").replace(/^\s+|\s+$/g,"");
      if(a2 && a2.length > 1) return { titleQ: memory.lastTitle, authorQ: a2, kind: "book", note: "Correcting author for \""+memory.lastTitle+"\"" };
    }
    if(/^(more|themes|characters|summary|simpler|tell me more|what about|who is|plot|setting|causes|examples)/i.test(raw) && (memory.lastTitle || memory.lastTopic)){
      var base = memory.lastTitle || memory.lastTopic;
      var author = memory.lastAuthor || "";
      return { titleQ: base+(author?" "+author:"")+" "+raw, authorQ: author, kind: memory.lastKind || "topic", note: "Follow-up on "+base };
    }
    if(!titleQ) titleQ = cleanQuery(msg);
    var kind = "topic";
    if(authorQ || /\b(book|novel|novella|memoir|biography)\b/i.test(msg) || /\bby\s+[A-Z]/i.test(msg)) kind = "book";
    return { titleQ: titleQ, authorQ: authorQ, kind: kind, note: "" };
  }
  function rememberResult(title, author, kind){
    // Does NOT touch memory.lastTitle: that is the REQUESTED title (set
    // when the student asks), and an author correction like "the author
    // Gordon Korman" must re-search the requested book, not whatever was
    // last displayed. Matched titles go to lastDisplayed and history.
    if(title){ memory.lastTopic = title; memory.lastDisplayed = title; }
    if(author) memory.lastAuthor = author;
    if(kind) memory.lastKind = kind;
    memory.history.push({ title: title, author: author, kind: kind, t: Date.now() });
    if(memory.history.length > 20) memory.history.shift();
  }
  function openLibrarySearch(q, title, author){
    var url = "https://openlibrary.org/search.json?limit=10&q=" + encodeURIComponent(q);
    if(title) url += "&title=" + encodeURIComponent(title);
    if(author) url += "&author=" + encodeURIComponent(author);
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error("Open Library unavailable"); return r.json();
    }).then(function(data){
      var docs = data.docs || [], hits = [];
      for(var i=0;i<docs.length;i++){
        var d = docs[i]; if(!d.title) continue;
        hits.push({ title:d.title, authors:(d.author_name||[]).slice(0,3).join(", "), year:d.first_publish_year||"", subjects:(d.subject||[]).slice(0,8), workKey:d.key||"", coverId:d.cover_i||null, editionCount:d.edition_count||0 });
      }
      return hits;
    });
  }
  function fetchBookDescription(workKey){
    if(!workKey) return Promise.resolve("");
    return fetch("https://openlibrary.org"+workKey+".json").then(function(r){ if(!r.ok) return ""; return r.json(); }).then(function(data){
      var desc = data.description; if(!desc) return "";
      if(typeof desc === "object" && desc.value) desc = desc.value;
      if(typeof desc !== "string") return "";
      return desc.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").slice(0,1200);
    }).catch(function(){ return ""; });
  }
  function wikiSearch(q){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(q)+"&srlimit=5&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var arr = (data.query && data.query.search) ? data.query.search : [];
      return arr.map(function(x){ return { title: x.title }; });
    });
  }
  function wikiExtract(title){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=2000&titles="+encodeURIComponent(title)+"&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var pages = data.query && data.query.pages ? data.query.pages : {}; var keys = Object.keys(pages);
      if(!keys.length) return null; var p = pages[keys[0]]; if(p.missing !== undefined) return null;
      var extract = (p.extract||"").trim(); if(!extract) return null;
      return { title: p.title, extract: extract.slice(0,2000) };
    });
  }
  function scoreBook(h, titleQ, authorQ){
    var t = (h.title||"").toLowerCase(), q = (titleQ||"").toLowerCase(), s = 0;
    if(t === q) s += 50; if(t.indexOf(q) === 0) s += 25; if(t.indexOf(q) !== -1) s += 15;
    var qw = q.split(/\s+/).filter(function(w){ return w.length > 2; });
    for(var i=0;i<qw.length;i++) if(t.indexOf(qw[i]) !== -1) s += 4;
    if(authorQ){ var a = (h.authors||"").toLowerCase(), ap = authorQ.toLowerCase().split(/\s+/); for(var i=0;i<ap.length;i++) if(a.indexOf(ap[i]) !== -1) s += 12; }
    if(h.editionCount > 20) s += 5; if(h.coverId) s += 3; if(h.year) s += 1;
    return s;
  }
  function rewriteDesc(raw, mode){
    if(!raw) return "";
    var clean = raw.replace(/\{\{[^}]*\}\}/g,"").replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g,"$1").replace(/\[\[|\]\]/g,"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
    var bits = clean.replace(/([.!?])/g,"$1\n").split("\n"), out = [];
    var limit = mode === "simple" ? 2 : (mode === "detailed" ? 6 : 4);
    for(var i=0;i<bits.length && out.length < limit;i++){ var s = bits[i].replace(/^\s+|\s+$/g,""); if(s.length > 28) out.push(s); }
    var joined = out.length ? out.join(" ") : clean.slice(0, mode==="simple"?220:500);
    if(mode === "simple" && joined.length > 280) joined = joined.slice(0, 280) + "…";
    return joined;
  }
  function coverUrl(coverId){ if(!coverId) return ""; return "https://covers.openlibrary.org/b/id/"+coverId+"-M.jpg"; }
  function delay(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function sendLearn(){
    var input = $("learn-in"); var msg = input.value.replace(/^\s+|\s+$/g,"");
    if(!msg && attachText) msg = attachText.slice(0, 120);
    if(!msg) return;
    var startedAt = Date.now();
    bubble("me", msg); input.value = ""; $("learn-btn").disabled = true; startLive();
    var resolved = resolveQuery(msg);
    var titleQ = resolved.titleQ; var authorQ = resolved.authorQ;
    if(titleQ && !resolved.note && !resolved.candidate){
      memory.lastTitle = titleQ; memory.lastTopic = titleQ;
      if(authorQ) memory.lastAuthor = authorQ;
      memory.lastKind = resolved.kind || "topic";
    }
    if(resolved.note) setLive(resolved.note);
    var wantBook = looksLikeBook(titleQ, authorQ, resolved.kind);
    var searchQ = titleQ + (authorQ ? " " + authorQ : "");
    Promise.resolve()
      .then(function(){
        if(wantBook) setLive('Searching books & topics for "'+titleQ+'"…');
        else setLive('Researching "'+titleQ+'" across subjects…');
        return delay(150);
      })
      .then(function(){
        var jobs = [];
        jobs.push(wikiSearch(searchQ).catch(function(){ return []; }));
        jobs.push(wikiSearch(titleQ).catch(function(){ return []; }));
        // exact title + author search is far more accurate than a generic q
        jobs.push(openLibrarySearch(searchQ, titleQ, authorQ).catch(function(){ return []; }));
        jobs.push(openLibrarySearch(searchQ, titleQ, "").catch(function(){ return []; }));
        return Promise.all(jobs);
      })
      .then(function(results){
        var wikiTitles = [], books = [], seenW = {}, seenB = {};
        for(var r=0;r<results.length;r++){
          var arr = results[r] || [];
          for(var i=0;i<arr.length;i++){
            var item = arr[i];
            if(item.workKey !== undefined || item.coverId !== undefined || (item.authors !== undefined && item.title)){
              // when the student gave an author, drop books by other authors
              if(authorQ){
                var al = (item.authors||"").toLowerCase();
                var asum = authorQ.toLowerCase().split(/\s+/).some(function(p){ return p.length > 2 && al.indexOf(p) !== -1; });
                if(!asum) continue;
              }
              var bk = (item.title||"").toLowerCase();
              if(!seenB[bk]){ seenB[bk]=1; books.push(item); }
            } else if(item.title){
              var wk = item.title.toLowerCase();
              if(!seenW[wk]){ seenW[wk]=1; wikiTitles.push(item); }
            }
          }
        }
        setLive("Found "+wikiTitles.length+" topic pages · "+books.length+" book records…");
        books.sort(function(a,b){ return scoreBook(b, titleQ, authorQ) - scoreBook(a, titleQ, authorQ); });
        // if the best match isn't close to the typed title, ask instead of guessing
        if(wantBook && books.length){
          var bt = (books[0].title||"").toLowerCase();
          var tq = (titleQ||"").toLowerCase();
          if(bt !== tq && bt.indexOf(tq) === -1 && tq.indexOf(bt) === -1){
            var cand = books.slice(0, 3);
            memory.lastCandidates = cand;
            endLive(); $("learn-btn").disabled = false; input.focus();
            var picks = cand.map(function(b, bi){
              return (bi+1)+". \u201c"+b.title+"\u201d by "+(b.authors||"?")+(b.year?" ("+b.year+")":"");
            });
            bubbleResult("I found some books, but none is an exact match for \u201c"+esc(titleQ)+"\u201d.<br/><br/>Pick one (send 1, 2, or 3), or send: <b>the author [name]</b> to narrow it down.<br/><br/>"+picks.join("<br/>"), "Pick: \n"+picks.join("\n"), startedAt);
            // keep the requested title so an author correction re-searches it
            if(!memory.lastTitle) memory.lastTitle = titleQ;
            return;
          }
        }
        memory.lastCandidates = [];
        return { books: books, wikiTitles: wikiTitles, earlyReturn: true };
      })
      .then(function(pack){
        if(!pack) return; // early return already answered the student
        var wikiJobs = [];
        var tops = (pack.wikiTitles || []).slice(0, wantBook ? 2 : 3);
        for(var i=0;i<tops.length;i++){
          (function(t){ wikiJobs.push(wikiExtract(t.title).then(function(ex){ return ex; }).catch(function(){ return null; })); })(tops[i]);
        }
        var bookJob = Promise.resolve(null);
        if(wantBook && pack.books && pack.books.length){
          var top = pack.books[0];
          setLive("Best book match: "+top.title+(top.authors?" — "+top.authors:"")+"…");
          bookJob = fetchBookDescription(top.workKey).then(function(desc){ top.description = desc; return top; });
        } else if(!wantBook && pack.wikiTitles.length){
          setLive("Reading: "+pack.wikiTitles[0].title+"…");
        } else if(pack.books && pack.books.length && !pack.wikiTitles.length){
          var top2 = pack.books[0];
          bookJob = fetchBookDescription(top2.workKey).then(function(desc){ top2.description = desc; return top2; });
        }
        return Promise.all([Promise.all(wikiJobs), bookJob, Promise.resolve(pack)]);
      })
      .then(function(triple){
        if(!triple) return; // early return already answered the student
        endLive(); $("learn-btn").disabled = false; input.focus();
        var extracts = (triple[0] || []).filter(function(x){ return x && x.extract; });
        var book = triple[1];
        var pack = triple[2] || { books: [], wikiTitles: [] };
        if(!extracts.length && !book && !(pack.books && pack.books.length)){
          bubbleResult("I could not find solid info on that yet.<br/><br/>Try a clearer topic (e.g. photosynthesis, French Revolution, Pythagorean theorem).", "No match", startedAt);
          return;
        }
        if(extracts.length && !wantBook){
          for(var i=0;i<extracts.length;i++){
            var ex = extracts[i];
            var wdesc = rewriteDesc(ex.extract, outputMode);
            if(!wdesc) continue;
            bubbleResult("<strong>"+esc(ex.title)+"</strong><br/><br/>"+esc(wdesc), ex.title+"\n\n"+wdesc, startedAt);
            rememberResult(ex.title, "", "topic");
          }
          bubble("ai", "Ask a follow-up (causes, examples, simpler, more) — I remember this topic.");
          return;
        }
        if(book || (pack.books && pack.books.length)){
          var b = book || pack.books[0];
          var desc = rewriteDesc(b.description, outputMode);
          if(!desc && extracts.length) desc = rewriteDesc(extracts[0].extract, outputMode);
          if(!desc && b.subjects && b.subjects.length) desc = "Often tagged: "+b.subjects.slice(0,5).join(", ")+". "+(b.year?"Around "+b.year+". ":"");
          if(!desc) desc = "Listed in Open Library"+(b.year?" (about "+b.year+")":"")+".";
          var cover = coverUrl(b.coverId);
          var plain = b.title+" — "+(b.authors||"")+(b.year?" ("+b.year+")":"")+"\n\n"+desc;
          var html = "";
          if(cover){
            html += '<div class="book-card"><img src="'+esc(cover)+'" alt="cover" onerror="this.style.display=\'none\'" />';
            html += '<div class="info"><strong>'+esc(b.title)+'</strong><div class="meta">'+esc((b.authors||"Unknown author")+(b.year?" · "+b.year:""))+'</div>'+esc(desc)+'</div></div>';
          } else {
            html += '<strong>'+esc(b.title)+'</strong><br/><span style="color:#a1a1aa;font-size:12px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc);
          }
          bubbleResult(html, plain, startedAt);
          rememberResult(b.title, b.authors, "book");
        }
        if(extracts.length && wantBook){
          for(var i=0;i<Math.min(extracts.length,2);i++){
            var ex2 = extracts[i];
            var wdesc2 = rewriteDesc(ex2.extract, outputMode);
            if(wdesc2 && wdesc2.length > 60) bubbleResult("<strong>"+esc(ex2.title)+"</strong><br/><br/>"+esc(wdesc2), ex2.title+"\n\n"+wdesc2, startedAt);
          }
        }
        if(!book && !(pack.books && pack.books.length) && extracts.length){
          for(var i=0;i<extracts.length;i++){
            var ex3 = extracts[i];
            var wdesc3 = rewriteDesc(ex3.extract, outputMode);
            if(!wdesc3) continue;
            bubbleResult("<strong>"+esc(ex3.title)+"</strong><br/><br/>"+esc(wdesc3), ex3.title+"\n\n"+wdesc3, startedAt);
            rememberResult(ex3.title, "", "topic");
          }
        }
        bubble("ai", "Follow-ups: more, simpler, causes, examples, themes…");
      })
      .catch(function(e){
        endLive(); $("learn-btn").disabled = false;
        bubbleResult("Something went wrong: "+esc(String(e && e.message ? e.message : e)), "Error", startedAt);
      });
  }
  $("learn-btn").onclick = sendLearn;
  $("learn-in").onkeydown = function(e){ if(e.key === "Enter"){ e.preventDefault(); sendLearn(); } };
  setHwStep(1);
})();
