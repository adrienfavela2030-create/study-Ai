(function(){
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">"); }
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
  var hwMode = "explain", hwStyle = "grade7", hwQuestions = [];
  setupPills("hw-modes", "data-m", function(v){ hwMode = v; });
  setupPills("hw-style", "data-s", function(v){ hwStyle = v; });
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
  function isGibberish(text){
    if(!text || text.length < 8) return true;
    var letters = (text.match(/[a-zA-Z]/g) || []).length;
    if(letters / text.length < 0.45) return true;
    var words = text.split(/\s+/).filter(function(w){ return w.length > 0; });
    if(words.length < 3) return true;
    var weird = 0, singles = 0;
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(w.length === 1) singles++;
      if(w.length >= 3 && !/[aeiouAEIOU]/.test(w) && /[a-zA-Z]{3,}/.test(w)) weird++;
    }
    return weird / words.length > 0.35 || singles / words.length > 0.25;
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
    if(statusEl && statusEl.textContent !== undefined) statusEl.textContent = "Improving photo & reading text…";
    if(typeof Tesseract === "undefined"){ if(statusEl) statusEl.textContent = "Photo added. Type the questions."; return; }
    preprocessImage(file).then(function(imgForOcr){
      return Tesseract.recognize(imgForOcr, "eng", { logger: function(m){
        if(statusEl && m && m.status === "recognizing text" && m.progress) statusEl.textContent = "Reading text… "+Math.round(m.progress*100)+"%";
      }});
    }).then(function(result){
      var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
      if(text && text.length > 5 && !isGibberish(text)){
        if(textEl) textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        if(statusEl) statusEl.textContent = "Text ready — fix any mistakes, then continue.";
      } else if(statusEl) statusEl.textContent = "Could not read that photo clearly. Type the questions.";
    }).catch(function(){ if(statusEl) statusEl.textContent = "Could not read photo. Type the questions below."; });
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
    if(isGibberish(t)){ $("hw-ocr").textContent = "That text looks unreadable. Fix it or type the real questions."; return; }
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
  $("hw-next2").onclick = function(){ setHwStep(3); };
  $("hw-back3").onclick = function(){ setHwStep(2); };
  $("hw-restart").onclick = function(){ $("hw-text").value=""; $("hw-prev").style.display="none"; $("hw-ocr").textContent=""; $("hw-opt").value=""; setHwStep(1); };
  function detectSubject(text){
    var t = text.toLowerCase();
    if(/\d\s*[\+\-\x\*\/=]|equation|solve for|algebra|geometry|fraction|percent|area of|volume/.test(t)) return "math";
    if(/cell|photosynthesis|atom|gravity|force|energy|organism|hypothesis|biology|chemistry|physics/.test(t)) return "science";
    if(/essay|paragraph|theme|character|metaphor|poem|author|novel|chapter|grammar|thesis/.test(t)) return "english";
    if(/war|century|civilization|revolution|president|empire|history|ancient|colony/.test(t)) return "history";
    return "general";
  }
  function subjectTips(subj){
    if(subj==="math") return ["Math tips","• Write what is given and what to find","• Show each step","• Check units","• Plug the answer back in"];
    if(subj==="science") return ["Science tips","• Name the concept","• Cause → effect","• Use class vocabulary","• Give one real example"];
    if(subj==="english") return ["English tips","• Claim + evidence + explanation","• Point to a line from the text","• Clear topic sentence"];
    if(subj==="history") return ["History tips","• Who / what / when / where","• Cause and effect","• Why it mattered","• Specific names and dates"];
    return ["Study tips","• Restate the question","• Use notes or the text","• Answer in complete thoughts"];
  }
  function styleGuide(s){
    if(s==="grade7") return "Write clearly for 7th grade and up: short sentences, simple words.";
    if(s==="high") return "Write at high-school level: clear structure, some academic words OK.";
    return "Write like a normal person explaining to a friend.";
  }
  $("hw-go").onclick = function(){
    var selected = [];
    for(var i=0;i<hwQuestions.length;i++){ var cb = $("qq"+i); if(cb && cb.checked) selected.push(hwQuestions[i]); }
    if(!selected.length) selected = hwQuestions.slice(0,1);
    var opt = $("hw-opt").value.replace(/^\s+|\s+$/g,"");
    var allText = selected.map(function(q){ return q.text; }).join(" ");
    var subj = detectSubject(allText), lines = [];
    lines.push("Plan — do in this order:");
    for(var i=0;i<selected.length;i++) lines.push("  "+(i+1)+". #"+selected[i].n+" — "+selected[i].text.slice(0,80));
    lines.push(""); lines.push("Subject focus: "+subj);
    var tips = subjectTips(subj); for(var ti=0;ti<tips.length;ti++) lines.push(tips[ti]);
    lines.push(""); lines.push("Mode: "+(hwMode==="explain"?"Explanation":hwMode==="answer"?"Answer":"Answer + Explanation"));
    lines.push(styleGuide(hwStyle)); if(opt) lines.push("Your note: "+opt); lines.push("");
    for(var i=0;i<selected.length;i++){
      var q = selected[i];
      lines.push("────────"); lines.push("Question #"+q.n); lines.push(q.text); lines.push("");
      if(hwMode==="explain"){ lines.push("Explanation"); lines.push("1. What this asks"); lines.push("2. What you need to know"); lines.push("3. Steps"); lines.push("4. Common mistakes"); }
      else if(hwMode==="answer"){ lines.push("Answer approach"); lines.push("• State the answer clearly"); lines.push("Draft: _______________"); }
      else { lines.push("Answer + Explanation"); lines.push("Answer: _______________"); lines.push("Why: (1–3 sentences)"); }
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
    lines.push("────────"); lines.push("Test tips: who/what/why · cause → effect · key names & dates");
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
  var memory = { lastTitle: "", lastAuthor: "", lastTopic: "", lastKind: "", history: [] };
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
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(t).then(function(){ copyBtn.style.color = "#4ade80"; setTimeout(function(){ copyBtn.style.color = ""; }, 1200); });
      }
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
  bubble("ai", "Type a book title (author optional).\nIf I get the wrong book, just say the author — I remember the title.\nAsk follow-ups: themes, characters, plot, more.");
  var plusBtn = $("plus-btn"), attachMenu = $("attach-menu");
  if(plusBtn && attachMenu) plusBtn.onclick = function(){ attachMenu.classList.toggle("on"); };
  function wireAttach(btnId, inputId){
    var b = $(btnId), inp = $(inputId); if(!b || !inp) return;
    b.onclick = function(){ inp.click(); };
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; if(!f) return;
      if(attachMenu) attachMenu.classList.remove("on");
      if(f.type.indexOf("image/") === 0 && typeof Tesseract !== "undefined"){
        Tesseract.recognize(f, "eng").then(function(result){
          var text = (result && result.data && result.data.text) ? result.data.text.trim() : "";
          if(text){ attachText = text.slice(0, 2000); var input = $("learn-in"); if(input && !input.value) input.value = text.slice(0, 80).replace(/\n/g," "); }
        }).catch(function(){});
      } else {
        var reader = new FileReader();
        reader.onload = function(){ attachText = String(reader.result || "").slice(0, 4000); };
        try{ reader.readAsText(f); }catch(e){}
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
    } else micBtn.onclick = function(){ bubble("ai", "Speech input is not supported on this browser."); };
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
  function isAuthorOnly(msg){
    var m = msg.replace(/^\s+|\s+$/g,"");
    if(/^(by|author|written by|the author is|author is)\s+/i.test(m)) return true;
    if(memory.lastTitle && /^[A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3}$/.test(m) && m.split(/\s+/).length <= 4) return true;
    return false;
  }
  function isCorrection(msg){
    var m = msg.replace(/^\s+/g,"");
    return /^(no|wrong|not that|actually|i meant|it'?s|the real|correct)/i.test(m) || /^(by|author)\s+/i.test(m);
  }
  function resolveQuery(msg){
    var hints = extractBookHints(msg);
    var titleQ = hints.title || "";
    var authorQ = hints.author || "";
    var raw = msg.replace(/^\s+|\s+$/g,"");
    if(isAuthorOnly(raw) && memory.lastTitle){
      var a = authorQ || raw.replace(/^(by|author|written by|the author is|author is)\s+/i,"").replace(/^\s+|\s+$/g,"");
      return { titleQ: memory.lastTitle, authorQ: a, kind: "book", note: "Using \""+memory.lastTitle+"\" + author "+a };
    }
    if(isCorrection(raw) && memory.lastTitle){
      var a2 = authorQ || raw.replace(/^(no[,.]?\s*|wrong[,.]?\s*|not that[,.]?\s*|actually\s*|i meant\s*|it'?s\s*|the real\s*|correct[,.]?\s*)/i,"").replace(/^(by|author is|the author is|written by)\s+/i,"").replace(/^\s+|\s+$/g,"");
      if(a2 && a2.length > 1) return { titleQ: memory.lastTitle, authorQ: a2, kind: "book", note: "Correcting author for \""+memory.lastTitle+"\"" };
    }
    if(/^(more|themes|characters|summary|simpler|tell me more|what about|who is|plot|setting)/i.test(raw) && (memory.lastTitle || memory.lastTopic)){
      var base = memory.lastTitle || memory.lastTopic;
      var author = memory.lastAuthor || "";
      return { titleQ: base+(author?" "+author:"")+" "+raw, authorQ: author, kind: memory.lastKind || "topic", note: "Follow-up on "+base };
    }
    if(!titleQ) titleQ = cleanQuery(msg);
    return { titleQ: titleQ, authorQ: authorQ, kind: (authorQ || /book|novel|read/i.test(msg)) ? "book" : "topic", note: "" };
  }
  function rememberResult(title, author, kind){
    if(title){ memory.lastTitle = title; memory.lastTopic = title; }
    if(author) memory.lastAuthor = author;
    if(kind) memory.lastKind = kind;
    memory.history.push({ title: title, author: author, kind: kind, t: Date.now() });
    if(memory.history.length > 20) memory.history.shift();
  }
  function openLibrarySearch(q){
    return fetch("https://openlibrary.org/search.json?q="+encodeURIComponent(q)+"&limit=8").then(function(r){
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
    return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(q)+"&srlimit=4&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var arr = (data.query && data.query.search) ? data.query.search : [];
      return arr.map(function(x){ return { title: x.title }; });
    });
  }
  function wikiExtract(title){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1800&titles="+encodeURIComponent(title)+"&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var pages = data.query && data.query.pages ? data.query.pages : {}; var keys = Object.keys(pages);
      if(!keys.length) return null; var p = pages[keys[0]]; if(p.missing !== undefined) return null;
      var extract = (p.extract||"").trim(); if(!extract) return null;
      return { title: p.title, extract: extract.slice(0,1800) };
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
    var joined = out.length ? out.join(" ") : clean.slice(0, mode==="simple"?220:450);
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
    if(titleQ && !resolved.note){
      memory.lastTitle = titleQ; memory.lastTopic = titleQ;
      if(authorQ) memory.lastAuthor = authorQ;
      memory.lastKind = resolved.kind || "book";
    }
    if(resolved.note) setLive(resolved.note);
    Promise.resolve()
      .then(function(){ setLive('Searching Open Library for "'+titleQ+'"'+(authorQ?' by '+authorQ:'')+'…'); return delay(180); })
      .then(function(){ return openLibrarySearch(titleQ+(authorQ?" "+authorQ:"")); })
      .then(function(books){
        setLive("Open Library: "+books.length+" matches · ranking best title…");
        books.sort(function(a,b){ return scoreBook(b, titleQ, authorQ) - scoreBook(a, titleQ, authorQ); });
        return books;
      })
      .then(function(books){
        if(!books.length){
          setLive("No Open Library hit · trying Wikipedia…");
          return wikiSearch(titleQ+(authorQ?" "+authorQ:"")).then(function(){ return { books: [] }; });
        }
        var top = books[0];
        setLive("Best match: "+top.title+(top.authors?" — "+top.authors:"")+" · loading description…");
        return fetchBookDescription(top.workKey).then(function(desc){ top.description = desc; return { books: books.slice(0,1) }; });
      })
      .then(function(pack){
        setLive("Checking Wikipedia for more detail…");
        var wikiQ = pack.books.length ? pack.books[0].title+(pack.books[0].authors?" "+pack.books[0].authors.split(",")[0]:"") : (titleQ+(authorQ?" "+authorQ:""));
        return wikiSearch(wikiQ).then(function(titles){
          if(!titles.length) return pack;
          setLive("Reading Wikipedia: "+titles[0].title+"…");
          return wikiExtract(titles[0].title).then(function(ex){ pack.wiki = ex; return pack; }).catch(function(){ return pack; });
        }).catch(function(){ return pack; });
      })
      .then(function(pack){
        endLive(); $("learn-btn").disabled = false; input.focus();
        if((!pack.books || !pack.books.length) && !pack.wiki){
          bubbleResult("I could not find a solid match.<br/><br/>Try the full title, or add the author (I remember your last title).", "No match", startedAt);
          return;
        }
        if(pack.books && pack.books.length){
          var b = pack.books[0];
          var desc = rewriteDesc(b.description, outputMode);
          if(!desc && pack.wiki) desc = rewriteDesc(pack.wiki.extract, outputMode);
          if(!desc && b.subjects && b.subjects.length) desc = "A book often filed under: "+b.subjects.slice(0,5).join(", ")+". "+(b.year?"First published around "+b.year+". ":"");
          if(!desc) desc = "Matched on Open Library"+(b.year?" (about "+b.year+")":"")+".";
          var cover = coverUrl(b.coverId);
          var plain = b.title+" — "+(b.authors||"")+(b.year?" ("+b.year+")":"")+"\n\n"+desc;
          var html = "";
          if(cover){
            html += '<div class="book-card"><img src="'+esc(cover)+'" alt="cover" onerror="this.style.display=\'none\'" />';
            html += '<div class="info"><strong>'+esc(b.title)+'</strong><div class="meta">'+esc((b.authors||"Unknown author")+(b.year?" · "+b.year:""))+'</div>'+esc(desc)+'</div></div>';
          } else {
            html += '<strong>'+esc(b.title)+'</strong><br/><span style="color:#a1a1aa;font-size:12px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc);
          }
          if(b.subjects && b.subjects.length && outputMode !== "simple"){
            html += '<br/><br/><span style="color:#71717a;font-size:12px">Topics: '+esc(b.subjects.slice(0,6).join(", "))+'</span>';
          }
          bubbleResult(html, plain, startedAt);
          rememberResult(b.title, b.authors, "book");
        }
        if(pack.wiki && pack.wiki.extract && outputMode !== "simple"){
          var wdesc = rewriteDesc(pack.wiki.extract, outputMode);
          if(wdesc && (!pack.books || !pack.books.length || wdesc.length > 80)){
            bubbleResult("<strong>"+esc(pack.wiki.title)+"</strong><br/><br/>"+esc(wdesc), pack.wiki.title+"\n\n"+wdesc, startedAt);
            rememberResult(pack.wiki.title, "", "topic");
          }
        }
      })
      .catch(function(e){
        endLive(); $("learn-btn").disabled = false;
        bubbleResult("Something went wrong: "+esc(String(e && e.message ? e.message : e))+"<br/>Check your connection and try again.", "Error", startedAt);
      });
  }
  $("learn-btn").onclick = sendLearn;
  $("learn-in").onkeydown = function(e){ if(e.key === "Enter"){ e.preventDefault(); sendLearn(); } };
  setHwStep(1);
})();
