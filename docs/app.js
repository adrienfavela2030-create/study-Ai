(function(){
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">"); }
  function show(name){
    var pages = document.querySelectorAll(".page");
    for(var i=0;i<pages.length;i++) pages[i].classList.remove("on");
    var tabs = document.querySelectorAll(".nav-btn");
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
  function setupChips(id, attr, cb){
    var root = $(id); if(!root) return;
    var chips = root.getElementsByClassName("chip");
    for(var i=0;i<chips.length;i++){
      chips[i].onclick = (function(btn){ return function(){
        for(var k=0;k<chips.length;k++) chips[k].classList.remove("on");
        btn.classList.add("on"); cb(btn.getAttribute(attr));
      }; })(chips[i]);
    }
  }
  var hwMode = "explain", hwStyle = "grade7", hwQuestions = [], hwSubject = "";
  var SUBJECTS = [
    {id:"english", label:"English / Reading", tip:"Stories, fables, poems, essays"},
    {id:"math", label:"Math", tip:"Numbers, equations, word problems"},
    {id:"science", label:"Science", tip:"Biology, chemistry, physics, earth"},
    {id:"history", label:"History / Social studies", tip:"People, events, places"},
    {id:"general", label:"General", tip:"When nothing else fits"}
  ];
  setupChips("hw-modes", "data-m", function(v){ hwMode = v; });
  setupChips("hw-style", "data-s", function(v){ hwStyle = v; });
  function setHwStep(n){
    var labels = ["Step 1 · Add the worksheet","Step 2 · Pick questions","Step 3 · How to help","Step 4 · Your help"];
    $("hw-step-label").textContent = labels[n-1] || "";
    var dots = $("hw-dots").children;
    for(var i=0;i<dots.length;i++) dots[i].className = "step" + (i+1 < n ? " done" : (i+1 === n ? " on" : ""));
    $("hw-s1").style.display = n===1 ? "block" : "none";
    $("hw-s2").style.display = n===2 ? "block" : "none";
    $("hw-s3").style.display = n===3 ? "block" : "none";
    $("hw-s4").style.display = n===4 ? "block" : "none";
  }
  function isGibberish(text){
    if(!text || text.length < 8) return true;
    var letters = (text.match(/[a-zA-Z]/g) || []).length;
    if(letters / text.length < 0.4) return true;
    var words = text.split(/\s+/).filter(function(w){ return w.length > 0; });
    if(words.length < 3) return true;
    var weird = 0, singles = 0;
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(w.length === 1 && !/[aAI]/.test(w)) singles++;
      if(w.length >= 3 && !/[aeiouAEIOU]/.test(w) && /[a-zA-Z]{3,}/.test(w)) weird++;
    }
    return weird / words.length > 0.35 || singles / words.length > 0.3;
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
    statusEl.textContent = "Improving photo & reading text…"; statusEl.className = "status";
    if(typeof Tesseract === "undefined"){ statusEl.textContent = "Photo added. Type the questions in the box."; return; }
    preprocessImage(file).then(function(imgForOcr){
      return Tesseract.recognize(imgForOcr, "eng", { logger: function(m){
        if(m && m.status === "recognizing text" && m.progress) statusEl.textContent = "Reading text… "+Math.round(m.progress*100)+"%";
      }});
    }).then(function(result){
      var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
      if(text && text.length > 5 && !isGibberish(text)){
        textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        statusEl.textContent = "Text ready — fix any mistakes, then continue."; statusEl.className = "status ok";
      } else {
        statusEl.textContent = "Could not read that photo clearly. Type or fix the questions in the box."; statusEl.className = "status warn";
      }
    }).catch(function(){ statusEl.textContent = "Could not read photo. Type the questions below."; statusEl.className = "status err"; });
  }
  function onHwFile(input){ var f = input.files && input.files[0]; if(!f) return; runOCR(f, $("hw-ocr"), $("hw-text"), $("hw-prev")); }
  $("hw-cam").onchange = function(){ onHwFile(this); };
  $("hw-up").onchange = function(){ onHwFile(this); };
  function parseQuestions(text){
    var lines = text.split(/\n/), qs = [], buf = "";
    var reStart = /^\s*(?:(?:question\s*)?\d+[\).\:\-]|[Qq]\d+[\).\:\-]|#\s*\d+|The\s+[A-Z][a-z]+(?:\s+and\s+the\s+[A-Z][a-z]+)?)/;
    for(var i=0;i<lines.length;i++){
      var line = lines[i].replace(/\s+$/g,"");
      if(!line.replace(/\s/g,"")) continue;
      if(reStart.test(line) && buf){ qs.push(buf.replace(/^\s+|\s+$/g,"")); buf = line; }
      else buf = buf ? (buf + " " + line) : line;
    }
    if(buf.replace(/^\s+|\s+$/g,"")) qs.push(buf.replace(/^\s+|\s+$/g,""));
    if(qs.length <= 1 && text.length > 80){
      var parts = text.replace(/\s+/g," ").split(/(?=\b\d+[\).]|#\s*\d+)/); qs = [];
      for(var i=0;i<parts.length;i++){ var p = parts[i].replace(/^\s+|\s+$/g,""); if(p.length > 12) qs.push(p); }
    }
    if(!qs.length) qs = [text.replace(/^\s+|\s+$/g,"").slice(0,500)];
    return qs.slice(0,12).map(function(q, idx){ return { n: idx+1, text: q.slice(0,350) }; });
  }
  function detectSubject(text){
    var t = text.toLowerCase();
    if(/aesop|fable|fox|grasshopper|swollen|theme|character|poem|metaphor|paragraph|essay|story|moral/.test(t)) return "english";
    if(/\d\s*[\+\-\x\*\/=]|equation|solve for|algebra|geometry|fraction|percent/.test(t)) return "math";
    if(/cell|photosynthesis|atom|gravity|force|energy|organism|biology|chemistry|physics/.test(t)) return "science";
    if(/war|century|revolution|president|empire|history|ancient|colony/.test(t)) return "history";
    return "general";
  }
  function subjectLabel(id){ for(var i=0;i<SUBJECTS.length;i++) if(SUBJECTS[i].id===id) return SUBJECTS[i].label; return id; }
  $("hw-next1").onclick = function(){
    var t = $("hw-text").value.replace(/^\s+|\s+$/g,"");
    if(!t){ $("hw-ocr").textContent = "Add a photo or type the worksheet text first."; $("hw-ocr").className = "status warn"; return; }
    if(isGibberish(t)){ $("hw-ocr").textContent = "That text looks unreadable. Fix it or type the real questions."; $("hw-ocr").className = "status warn"; return; }
    hwQuestions = parseQuestions(t); hwSubject = detectSubject(t);
    var box = $("hw-qlist"); box.innerHTML = "";
    for(var i=0;i<hwQuestions.length;i++){
      var q = hwQuestions[i], div = document.createElement("div"); div.className = "q-item on";
      div.innerHTML = '<input type="checkbox" id="qq'+i+'" checked /><label for="qq'+i+'"><strong>#'+q.n+'</strong> — '+esc(q.text)+'</label>';
      box.appendChild(div);
    }
    setHwStep(2);
  };
  $("hw-back2").onclick = function(){ setHwStep(1); };
  $("hw-next2").onclick = function(){
    $("hw-subject-label").textContent = "Suggested: "+subjectLabel(hwSubject)+" — tap to change if wrong";
    $("hw-subject-btn").textContent = subjectLabel(hwSubject);
    setHwStep(3);
  };
  $("hw-back3").onclick = function(){ setHwStep(2); };
  $("hw-restart").onclick = function(){
    $("hw-text").value=""; $("hw-prev").style.display="none"; $("hw-ocr").textContent=""; $("hw-opt").value="";
    $("hw-essay").checked=false; hwSubject=""; setHwStep(1);
  };
  function openSubjectModal(){
    var list = $("subject-list"); list.innerHTML = "";
    for(var i=0;i<SUBJECTS.length;i++){
      var s = SUBJECTS[i];
      var b = document.createElement("button");
      b.type = "button"; b.className = "modal-item"+(s.id===hwSubject?" on":"");
      b.innerHTML = esc(s.label)+"<small>"+esc(s.tip)+"</small>";
      b.onclick = (function(id,label){ return function(){
        hwSubject = id; $("hw-subject-btn").textContent = label; $("hw-subject-label").textContent = "Subject: "+label;
        $("subject-modal").classList.remove("on");
      }; })(s.id, s.label);
      list.appendChild(b);
    }
    $("subject-modal").classList.add("on");
  }
  $("hw-subject-btn").onclick = openSubjectModal;
  $("subject-close").onclick = function(){ $("subject-modal").classList.remove("on"); };
  $("subject-modal").onclick = function(e){ if(e.target === $("subject-modal")) $("subject-modal").classList.remove("on"); };
  function styleGuide(s){
    if(s==="grade7") return "Write for 7th grade and up: short clear sentences.";
    if(s==="high") return "Write at high-school level.";
    return "Write like explaining to a friend.";
  }
  function buildHomeworkHelp(selected, subj, mode, essay, opt){
    var lines = [];
    lines.push("Subject: "+subjectLabel(subj));
    lines.push("Mode: "+(mode==="explain"?"Explanation":mode==="answer"?"Answer":"Answer + Explanation"));
    lines.push(styleGuide(hwStyle));
    if(opt) lines.push("Your note: "+opt);
    lines.push("");
    for(var i=0;i<selected.length;i++){
      var q = selected[i], qt = q.text;
      lines.push("────────"); lines.push("Question #"+q.n); lines.push(qt); lines.push("");
      if(subj === "english"){
        if(/fable|aesop|fox|grasshopper|swollen|flies|hen and|wolf in|miser|ants and|moral/i.test(qt) || /fable|aesop/i.test(selected.map(function(x){return x.text;}).join(" "))){
          if(mode === "explain" || mode === "both"){
            lines.push("How to think about this fable");
            lines.push("1. Who are the characters?");
            lines.push("2. What happens (plot in 1–2 sentences)?");
            lines.push("3. What does the main character want or do wrong?");
            lines.push("4. What is the moral (lesson)?");
            lines.push("5. One example of that lesson in real life."); lines.push("");
          }
          if(mode === "answer" || mode === "both"){
            lines.push("Answer guide");
            if(/swollen fox/i.test(qt)){ lines.push("• Fox eats, gets too fat to leave the hollow."); lines.push("• Moral: greed can trap you — think ahead."); }
            else if(/flies.*honey|honey-pot/i.test(qt)){ lines.push("• Flies stick to honey and cannot leave."); lines.push("• Moral: pleasure without care can be dangerous."); }
            else if(/hen.*golden|golden eggs/i.test(qt)){ lines.push("• Owner kills the hen for all the gold at once and loses everything."); lines.push("• Moral: greed can destroy what you already have."); }
            else if(/miser/i.test(qt)){ lines.push("• Miser hides gold and gains nothing from it."); lines.push("• Moral: wealth unused is useless."); }
            else if(/ants.*grasshopper|grasshopper/i.test(qt)){ lines.push("• Ants work and store food; grasshopper plays and is hungry later."); lines.push("• Moral: prepare for the future."); }
            else if(/wolf.*sheep/i.test(qt)){ lines.push("• Wolf in sheep's skin tricks others but is found out."); lines.push("• Moral: don't trust looks alone."); }
            else { lines.push("• Name characters and what goes wrong."); lines.push("• State the moral in one clear sentence."); lines.push("• Add one real-life example."); }
            lines.push(""); lines.push("Draft: Characters / What happens / Moral");
          }
        } else {
          if(mode === "explain" || mode === "both"){ lines.push("Explanation"); lines.push("1. Restate the question."); lines.push("2. Point to evidence from the text."); lines.push("3. Explain how evidence answers it."); }
          if(mode === "answer" || mode === "both"){ lines.push("Answer"); lines.push("Write 2–4 clear sentences with a detail from the text."); lines.push("Draft: _______________"); }
        }
      } else if(subj === "math"){
        lines.push("Math steps"); lines.push("1. What is given?"); lines.push("2. What to find?"); lines.push("3. Equation or method"); lines.push("4. Solve step by step"); lines.push("5. Check"); lines.push("Draft work: _______________");
      } else if(subj === "science"){
        lines.push("Science"); lines.push("1. Name the concept"); lines.push("2. Cause → effect"); lines.push("3. Vocabulary"); lines.push("4. Real example"); lines.push("Draft: _______________");
      } else if(subj === "history"){
        lines.push("History"); lines.push("1. Who / what / when / where"); lines.push("2. Cause and effect"); lines.push("3. Why it mattered"); lines.push("Draft: _______________");
      } else {
        lines.push("1. Restate the question"); lines.push("2. Answer in complete sentences"); lines.push("3. Support with a detail from the page"); lines.push("Draft: _______________");
      }
      if(essay || /essay|paragraph|write about|compose/i.test(qt)){
        lines.push(""); lines.push("Essay structure"); lines.push("• Hook / intro"); lines.push("• Main idea"); lines.push("• 2–3 supporting points"); lines.push("• Short conclusion");
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  $("hw-go").onclick = function(){
    var selected = [];
    for(var i=0;i<hwQuestions.length;i++){ var cb = $("qq"+i); if(cb && cb.checked) selected.push(hwQuestions[i]); }
    if(!selected.length) selected = hwQuestions.slice(0,1);
    if(!hwSubject) hwSubject = detectSubject(selected.map(function(q){return q.text;}).join(" "));
    var opt = $("hw-opt").value.replace(/^\s+|\s+$/g,"");
    var essay = $("hw-essay").checked;
    var body = buildHomeworkHelp(selected, hwSubject, hwMode, essay, opt);
    $("hw-out").innerHTML = '<div class="meta">Homework help · '+esc(subjectLabel(hwSubject))+'</div><div class="answer-body">'+esc(body)+'</div>';
    setHwStep(4);
  };
  var noteStyle = "short";
  setupChips("note-modes", "data-s", function(v){ noteStyle = v; });
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
      $("notes-text").value = txt; $("notes-ocr").textContent = "Page text loaded."; $("notes-ocr").className = "status ok";
    }).catch(function(){ $("notes-ocr").textContent = "Could not open that link. Paste the text below."; $("notes-ocr").className = "status warn"; });
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
    if(!notes){ out.className = "panel show"; out.innerHTML = '<div class="meta">Notes</div><div class="answer-body">Add a photo, link, or text first.</div>'; return; }
    out.className = "panel show"; out.innerHTML = '<div class="meta">'+esc(noteStyle)+' notes</div><div class="answer-body">'+esc(notes)+'</div>';
  };
  var chat = $("chat"), liveEl = null, outputMode = "normal", attachText = "";
  var memory = { lastTitle: "", lastAuthor: "", lastTopic: "", lastKind: "" };
  function bubble(who, text){
    var d = document.createElement("div"); d.className = "msg "+(who==="me"?"me":"ai");
    if(who==="me") d.textContent = text; else d.innerHTML = '<div class="body">'+esc(text)+'</div>';
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  function startLive(){ var d = document.createElement("div"); d.className = "msg ai"; d.innerHTML = '<span class="live">Starting…</span>'; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; liveEl = d; }
  function setLive(msg){ if(!liveEl) return; var el = liveEl.querySelector(".live"); if(el) el.textContent = msg; chat.scrollTop = chat.scrollHeight; }
  function endLive(){ if(liveEl && liveEl.parentNode) liveEl.parentNode.removeChild(liveEl); liveEl = null; }
  function formatTime(ms){ if(ms < 1000) return ms+" ms"; return (ms/1000).toFixed(1)+" s"; }
  function addActions(container, plainText, startedAt){
    var bar = document.createElement("div"); bar.className = "msg-actions";
    var left = document.createElement("div"); left.className = "left";
    var copyBtn = document.createElement("button"); copyBtn.type="button"; copyBtn.className="icon-btn"; copyBtn.title="Copy"; copyBtn.setAttribute("aria-label","Copy");
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.onclick = function(){ var t = plainText || container.innerText || ""; if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t); };
    var shareBtn = document.createElement("button"); shareBtn.type="button"; shareBtn.className="icon-btn"; shareBtn.title="Share"; shareBtn.setAttribute("aria-label","Share");
    shareBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
    shareBtn.onclick = function(){ var t = plainText || container.innerText || ""; if(navigator.share) navigator.share({ text: t }).catch(function(){}); else if(navigator.clipboard) navigator.clipboard.writeText(t); };
    left.appendChild(copyBtn); left.appendChild(shareBtn);
    var time = document.createElement("span"); time.className="time"; time.textContent = formatTime(Date.now()-startedAt);
    bar.appendChild(left); bar.appendChild(time); container.appendChild(bar);
  }
  function bubbleResult(html, plainText, startedAt){
    var d = document.createElement("div"); d.className = "msg ai";
    var body = document.createElement("div"); body.className = "body"; body.innerHTML = html;
    d.appendChild(body); addActions(d, plainText, startedAt);
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  bubble("ai", "Ask any subject or a book title.\nIf the book is wrong, type the author — I remember the title.\nExample: Restart  then  Gordon Korman");
  var plusBtn = $("plus-btn"), attachMenu = $("attach-menu");
  if(plusBtn && attachMenu) plusBtn.onclick = function(){ attachMenu.classList.toggle("on"); };
  function wireAttach(btnId, inputId){
    var b = $(btnId), inp = $(inputId); if(!b||!inp) return;
    b.onclick = function(){ inp.click(); };
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; if(!f) return;
      if(attachMenu) attachMenu.classList.remove("on");
      if(f.type.indexOf("image/")===0 && typeof Tesseract !== "undefined"){
        Tesseract.recognize(f,"eng").then(function(result){
          var text = (result && result.data && result.data.text) ? result.data.text.trim() : "";
          if(text){ attachText = text.slice(0,2000); var input=$("learn-in"); if(input&&!input.value) input.value = text.slice(0,80).replace(/\n/g," "); }
        }).catch(function(){});
      }
    };
  }
  wireAttach("att-cam","att-cam-input"); wireAttach("att-photo","att-photo-input");
  var modeBtn = $("mode-btn");
  if(modeBtn) modeBtn.onclick = function(){
    if(outputMode==="normal"){ outputMode="detailed"; modeBtn.textContent="Detailed"; }
    else if(outputMode==="detailed"){ outputMode="simple"; modeBtn.textContent="Simple"; }
    else { outputMode="normal"; modeBtn.textContent="Normal"; }
  };
  function cleanQuery(msg){
    var q = msg.replace(/^\s+|\s+$/g,"");
    var prefixes = ["what is the ","what is ","explain ","tell me about ","about ","summarize ","the book ","book called ","find ","search for ","look up "];
    var lower = q.toLowerCase();
    for(var i=0;i<prefixes.length;i++){ if(lower.indexOf(prefixes[i])===0){ q=q.slice(prefixes[i].length); lower=q.toLowerCase(); } }
    return q.replace(/[?.!]+$/g,"").replace(/^\s+|\s+$/g,"");
  }
  function extractBookHints(msg){
    var raw = msg.replace(/^\s+|\s+$/g,""); var title=null, author=null;
    var m = raw.match(/"([^"]{2,100})"/); if(m) title=m[1];
    var by = raw.match(/(.+?)\s+by\s+([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/);
    if(by){ var t=by[1].replace(/^[\s"']+|[\s"']+$/g,""); if(!title&&t.length>1) title=t.replace(/^(the book|book|novel)\s+/i,""); author=by[2].replace(/^\s+|\s+$/g,""); }
    if(!title) title = cleanQuery(raw);
    return { title:title, author:author };
  }
  function isAuthorOnly(msg){
    var m = msg.replace(/^\s+|\s+$/g,"");
    if(/^(by|author|written by|the author is|author is)\s+/i.test(m)) return true;
    if(memory.lastTitle && /^[A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3}$/.test(m) && m.split(/\s+/).length<=4) return true;
    return false;
  }
  function resolveQuery(msg){
    var hints = extractBookHints(msg);
    var titleQ = hints.title||"", authorQ = hints.author||"", raw = msg.replace(/^\s+|\s+$/g,"");
    if(isAuthorOnly(raw) && memory.lastTitle){
      var a = authorQ || raw.replace(/^(by|author|written by|the author is|author is)\s+/i,"").replace(/^\s+|\s+$/g,"");
      return { titleQ: memory.lastTitle, authorQ: a, kind:"book", note:'Using "'+memory.lastTitle+'" by '+a };
    }
    if(/^(no|wrong|not that|actually|i meant)/i.test(raw) && memory.lastTitle){
      var a2 = authorQ || raw.replace(/^(no[,.]?\s*|wrong[,.]?\s*|not that[,.]?\s*|actually\s*|i meant\s*)/i,"").replace(/^(by|author is)\s+/i,"").replace(/^\s+|\s+$/g,"");
      if(a2 && a2.length>1) return { titleQ: memory.lastTitle, authorQ: a2, kind:"book", note:'Correcting: "'+memory.lastTitle+'" by '+a2 };
    }
    if(/^(more|themes|characters|summary|simpler|causes|examples|plot)/i.test(raw) && (memory.lastTitle||memory.lastTopic)){
      var base = memory.lastTitle||memory.lastTopic;
      return { titleQ: base+(memory.lastAuthor?" "+memory.lastAuthor:"")+" "+raw, authorQ: memory.lastAuthor||"", kind: memory.lastKind||"topic", note:"Follow-up on "+base };
    }
    if(!titleQ) titleQ = cleanQuery(msg);
    var kind = "topic";
    if(authorQ || /\b(book|novel)\b/i.test(msg) || /\bby\s+[A-Z]/i.test(msg)) kind = "book";
    return { titleQ:titleQ, authorQ:authorQ, kind:kind, note:"" };
  }
  function looksLikeBook(q, authorQ, kind){ return kind==="book" || !!authorQ || /\b(book|novel|author)\b/i.test(q); }
  function rememberResult(title, author, kind){
    if(title){ memory.lastTitle=title; memory.lastTopic=title; }
    if(author) memory.lastAuthor=author;
    if(kind) memory.lastKind=kind;
  }
  function openLibrarySearch(q, title, author){
    var url = (title && author)
      ? "https://openlibrary.org/search.json?title="+encodeURIComponent(title)+"&author="+encodeURIComponent(author)+"&limit=8"
      : "https://openlibrary.org/search.json?q="+encodeURIComponent(q)+"&limit=8";
    return fetch(url).then(function(r){ if(!r.ok) throw new Error("Open Library unavailable"); return r.json(); }).then(function(data){
      var docs = data.docs||[], hits=[];
      for(var i=0;i<docs.length;i++){
        var d=docs[i]; if(!d.title) continue;
        hits.push({ title:d.title, authors:(d.author_name||[]).slice(0,3).join(", "), year:d.first_publish_year||"", subjects:(d.subject||[]).slice(0,8), workKey:d.key||"", coverId:d.cover_i||null, editionCount:d.edition_count||0 });
      }
      return hits;
    });
  }
  function fetchBookDescription(workKey){
    if(!workKey) return Promise.resolve("");
    return fetch("https://openlibrary.org"+workKey+".json").then(function(r){ if(!r.ok) return ""; return r.json(); }).then(function(data){
      var desc=data.description; if(!desc) return "";
      if(typeof desc==="object"&&desc.value) desc=desc.value;
      if(typeof desc!=="string") return "";
      return desc.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").slice(0,1200);
    }).catch(function(){ return ""; });
  }
  function wikiSearch(q){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(q)+"&srlimit=5&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var arr=(data.query&&data.query.search)?data.query.search:[]; return arr.map(function(x){ return { title:x.title }; });
    });
  }
  function wikiExtract(title){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=2000&titles="+encodeURIComponent(title)+"&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var pages=data.query&&data.query.pages?data.query.pages:{}; var keys=Object.keys(pages);
      if(!keys.length) return null; var p=pages[keys[0]]; if(p.missing!==undefined) return null;
      var extract=(p.extract||"").trim(); if(!extract) return null;
      return { title:p.title, extract:extract.slice(0,2000) };
    });
  }
  function scoreBook(h, titleQ, authorQ){
    var t=(h.title||"").toLowerCase(), q=(titleQ||"").toLowerCase(), s=0;
    if(t===q) s+=80; else if(t.indexOf(q)===0) s+=40; else if(t.indexOf(q)!==-1) s+=20;
    if(q.length<=12 && t.length>q.length*3 && t.indexOf(q)===-1) s-=30;
    var qw=q.split(/\s+/).filter(function(w){ return w.length>2; });
    for(var i=0;i<qw.length;i++) if(t.indexOf(qw[i])!==-1) s+=6;
    if(authorQ){
      var a=(h.authors||"").toLowerCase(), ap=authorQ.toLowerCase().split(/\s+/), authorHits=0;
      for(var i=0;i<ap.length;i++) if(a.indexOf(ap[i])!==-1){ s+=20; authorHits++; }
      if(authorHits===0) s-=40;
      if(authorHits>=2 && t===q) s+=30;
    }
    if(/guys write|write for guys|collection|anthology|omnibus/i.test(h.title) && q.length<20) s-=25;
    if(h.editionCount>20) s+=3; if(h.coverId) s+=2;
    return s;
  }
  function rewriteDesc(raw, mode){
    if(!raw) return "";
    var clean=raw.replace(/\{\{[^}]*\}\}/g,"").replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g,"$1").replace(/\[\[|\]\]/g,"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
    var bits=clean.replace(/([.!?])/g,"$1\n").split("\n"), out=[], limit=mode==="simple"?2:(mode==="detailed"?6:4);
    for(var i=0;i<bits.length&&out.length<limit;i++){ var s=bits[i].replace(/^\s+|\s+$/g,""); if(s.length>28) out.push(s); }
    var joined=out.length?out.join(" "):clean.slice(0,mode==="simple"?220:500);
    if(mode==="simple"&&joined.length>280) joined=joined.slice(0,280)+"…";
    return joined;
  }
  function coverUrl(coverId){ if(!coverId) return ""; return "https://covers.openlibrary.org/b/id/"+coverId+"-M.jpg"; }
  function delay(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  function sendLearn(){
    var input=$("learn-in"); var msg=input.value.replace(/^\s+|\s+$/g,"");
    if(!msg&&attachText) msg=attachText.slice(0,120);
    if(!msg) return;
    var startedAt=Date.now();
    bubble("me", msg); input.value=""; $("learn-btn").disabled=true; startLive();
    var resolved=resolveQuery(msg);
    var titleQ=resolved.titleQ, authorQ=resolved.authorQ;
    if(titleQ && !resolved.note){ memory.lastTitle=titleQ; memory.lastTopic=titleQ; if(authorQ) memory.lastAuthor=authorQ; memory.lastKind=resolved.kind||"topic"; }
    if(authorQ) memory.lastAuthor=authorQ;
    if(resolved.note) setLive(resolved.note);
    var wantBook=looksLikeBook(titleQ, authorQ, resolved.kind);
    var searchQ=titleQ+(authorQ?" "+authorQ:"");
    Promise.resolve()
      .then(function(){ setLive(wantBook?('Looking up "'+titleQ+'"'+(authorQ?' by '+authorQ:'')+'…'):('Researching "'+titleQ+'"…')); return delay(120); })
      .then(function(){
        var jobs=[wikiSearch(searchQ).catch(function(){return[];}), wikiSearch(titleQ).catch(function(){return[];})];
        if(titleQ && authorQ) jobs.push(openLibrarySearch(searchQ, titleQ, authorQ).catch(function(){return[];}));
        jobs.push(openLibrarySearch(searchQ, null, null).catch(function(){return[];}));
        return Promise.all(jobs);
      })
      .then(function(results){
        var wikiTitles=[], books=[], seenW={}, seenB={};
        for(var r=0;r<results.length;r++){
          var arr=results[r]||[];
          for(var i=0;i<arr.length;i++){
            var item=arr[i];
            if(item.workKey!==undefined||item.coverId!==undefined||(item.authors!==undefined&&item.title)){
              var bk=(item.title||"").toLowerCase()+"|"+(item.authors||"").toLowerCase();
              if(!seenB[bk]){ seenB[bk]=1; books.push(item); }
            } else if(item.title){
              var wk=item.title.toLowerCase();
              if(!seenW[wk]){ seenW[wk]=1; wikiTitles.push(item); }
            }
          }
        }
        books.sort(function(a,b){ return scoreBook(b,titleQ,authorQ)-scoreBook(a,titleQ,authorQ); });
        setLive("Ranked "+books.length+" books · "+wikiTitles.length+" topics…");
        return { books:books, wikiTitles:wikiTitles };
      })
      .then(function(pack){
        var wikiJobs=[], tops=(pack.wikiTitles||[]).slice(0, wantBook?2:3);
        for(var i=0;i<tops.length;i++){ (function(t){ wikiJobs.push(wikiExtract(t.title).catch(function(){return null;})); })(tops[i]); }
        var bookJob=Promise.resolve(null);
        if(wantBook && pack.books.length){
          var top=pack.books[0];
          setLive("Best match: "+top.title+(top.authors?" — "+top.authors:"")+"…");
          bookJob=fetchBookDescription(top.workKey).then(function(desc){ top.description=desc; return top; });
        } else if(!wantBook && pack.wikiTitles.length) setLive("Reading: "+pack.wikiTitles[0].title+"…");
        return Promise.all([Promise.all(wikiJobs), bookJob, Promise.resolve(pack)]);
      })
      .then(function(triple){
        endLive(); $("learn-btn").disabled=false; input.focus();
        var extracts=(triple[0]||[]).filter(function(x){ return x&&x.extract; });
        var book=triple[1], pack=triple[2]||{books:[],wikiTitles:[]};
        if(!extracts.length && !book && !(pack.books&&pack.books.length)){
          bubbleResult("No solid match.<br/><br/>Try full title and author, e.g. Restart by Gordon Korman.", "No match", startedAt); return;
        }
        if(extracts.length && !wantBook){
          for(var i=0;i<extracts.length;i++){
            var ex=extracts[i], wdesc=rewriteDesc(ex.extract, outputMode); if(!wdesc) continue;
            bubbleResult("<strong>"+esc(ex.title)+"</strong><br/><br/>"+esc(wdesc), ex.title+"\n\n"+wdesc, startedAt);
            rememberResult(ex.title,"","topic");
          }
          bubble("ai","Follow-up: more, simpler, causes…"); return;
        }
        if(book || (pack.books&&pack.books.length)){
          var b=book||pack.books[0];
          var desc=rewriteDesc(b.description, outputMode);
          if(!desc && extracts.length) desc=rewriteDesc(extracts[0].extract, outputMode);
          if(!desc && b.subjects&&b.subjects.length) desc="Often tagged: "+b.subjects.slice(0,5).join(", ")+". "+(b.year?"Around "+b.year+".":"");
          if(!desc) desc="Matched in Open Library"+(b.year?" (about "+b.year+")":"")+".";
          var cover=coverUrl(b.coverId), plain=b.title+" — "+(b.authors||"")+(b.year?" ("+b.year+")":"")+"\n\n"+desc, html="";
          if(cover){
            html+='<div class="book-card"><img src="'+esc(cover)+'" alt="cover" onerror="this.style.display=\'none\'"/>';
            html+='<div class="info"><strong>'+esc(b.title)+'</strong><div class="meta">'+esc((b.authors||"Unknown")+(b.year?" · "+b.year:""))+'</div>'+esc(desc)+'</div></div>';
          } else html+='<strong>'+esc(b.title)+'</strong><br/><span style="color:var(--text-2);font-size:13px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc);
          bubbleResult(html, plain, startedAt); rememberResult(b.title, b.authors, "book");
        }
        if(extracts.length && wantBook){
          for(var i=0;i<Math.min(extracts.length,2);i++){
            var ex2=extracts[i], wdesc2=rewriteDesc(ex2.extract, outputMode);
            if(wdesc2&&wdesc2.length>60) bubbleResult("<strong>"+esc(ex2.title)+"</strong><br/><br/>"+esc(wdesc2), ex2.title+"\n\n"+wdesc2, startedAt);
          }
        }
        bubble("ai","Follow-ups: more, simpler, themes…");
      })
      .catch(function(e){ endLive(); $("learn-btn").disabled=false; bubbleResult("Error: "+esc(String(e&&e.message?e.message:e)), "Error", startedAt); });
  }
  $("learn-btn").onclick = sendLearn;
  $("learn-in").onkeydown = function(e){ if(e.key==="Enter"){ e.preventDefault(); sendLearn(); } };
  setHwStep(1);
})();
