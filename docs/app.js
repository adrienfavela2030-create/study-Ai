(function(){
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
    statusEl.textContent = "Improving photo & reading text…";
    if(typeof Tesseract === "undefined"){ statusEl.textContent = "Photo added. Type the questions in the box."; return; }
    preprocessImage(file).then(function(imgForOcr){
      return Tesseract.recognize(imgForOcr, "eng", { logger: function(m){
        if(m && m.status === "recognizing text" && m.progress) statusEl.textContent = "Reading text… "+Math.round(m.progress*100)+"%";
      }});
    }).then(function(result){
      var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
      if(text && text.length > 5 && !isGibberish(text)){
        textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        statusEl.textContent = "Text ready — fix any mistakes, then continue.";
      } else {
        statusEl.textContent = "Could not read that photo clearly. Type the questions in the box.";
      }
    }).catch(function(){ statusEl.textContent = "Could not read photo. Type the questions below."; });
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
      if(hwMode==="explain"){ lines.push("Explanation"); lines.push("1. What this asks in plain words"); lines.push("2. What you need to know"); lines.push("3. Steps to think through"); lines.push("4. Common mistakes"); }
      else if(hwMode==="answer"){ lines.push("Answer approach"); lines.push("• State the answer clearly"); lines.push("• Math: show steps · Reading: cite evidence"); lines.push("Draft: _______________"); }
      else { lines.push("Answer + Explanation"); lines.push("Answer: _______________"); lines.push("Why: (1–3 sentences)"); lines.push("Evidence / steps:"); }
      if(/essay|paragraph|write about|compose/i.test(q.text)){ lines.push(""); lines.push("Essay scaffold ("+hwStyle+")"); lines.push("• Hook / intro"); lines.push("• Main idea"); lines.push("• 2–3 supporting points"); lines.push("• Short conclusion"); }
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
  function bubble(who, text, meta){
    var d = document.createElement("div");
    d.className = "b "+(who==="me"?"me":"ai");
    d.innerHTML = esc(text)+(meta?"<small>"+esc(meta)+"</small>":"");
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  function startLive(){
    var d = document.createElement("div"); d.className = "b ai";
    d.innerHTML = '<span class="live" id="live-status">Starting…</span>';
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; liveEl = d; return d;
  }
  function setLive(msg){
    if(!liveEl) return;
    var el = liveEl.querySelector(".live"); if(el) el.textContent = msg;
    chat.scrollTop = chat.scrollHeight;
  }
  function endLive(){ if(liveEl && liveEl.parentNode) liveEl.parentNode.removeChild(liveEl); liveEl = null; }
  function bubbleHTML(html){
    var d = document.createElement("div"); d.className = "b ai fade-in"; d.innerHTML = html;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  bubble("ai","Type a book title (author optional).\nI search Open Library & Wikipedia and write a short description with the cover.");
  var STOP = {the:1,a:1,an:1,and:1,or:1,of:1,in:1,on:1,to:1,for:1,is:1,it:1,this:1,that:1,with:1,from:1,by:1,as:1,at:1,be:1,was:1,were:1,are:1,about:1,book:1,novel:1,story:1,read:1,reading:1,written:1,author:1,its:1,his:1,her:1,their:1,they:1,who:1,what:1,when:1,where:1,which:1,how:1,can:1,you:1,i:1,me:1,my:1,we:1,our:1,so:1,but:1,if:1,then:1,than:1,also:1,just:1,like:1,one:1,some:1,have:1,has:1,had:1,do:1,does:1,did:1,not:1,please:1,help:1,need:1,want:1,tell:1,explain:1,summary:1,called:1,named:1,find:1,search:1};
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
  function openLibrarySearch(q){
    return fetch("https://openlibrary.org/search.json?q="+encodeURIComponent(q)+"&limit=8").then(function(r){
      if(!r.ok) throw new Error("Open Library unavailable"); return r.json();
    }).then(function(data){
      var docs = data.docs || [], hits = [];
      for(var i=0;i<docs.length;i++){
        var d = docs[i]; if(!d.title) continue;
        hits.push({ kind:"book", title:d.title, authors:(d.author_name||[]).slice(0,3).join(", "), year:d.first_publish_year||"", subjects:(d.subject||[]).slice(0,8), workKey:d.key||"", coverId:d.cover_i||null, editionCount:d.edition_count||0 });
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
  function rewriteDesc(raw){
    if(!raw) return "";
    var clean = raw.replace(/\{\{[^}]*\}\}/g,"").replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g,"$1").replace(/\[\[|\]\]/g,"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
    var bits = clean.replace(/([.!?])/g,"$1\n").split("\n"), out = [];
    for(var i=0;i<bits.length && out.length < 4;i++){ var s = bits[i].replace(/^\s+|\s+$/g,""); if(s.length > 28) out.push(s); }
    return out.length ? out.join(" ") : clean.slice(0, 450);
  }
  function coverUrl(coverId){ if(!coverId) return ""; return "https://covers.openlibrary.org/b/id/"+coverId+"-M.jpg"; }
  function delay(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function sendLearn(){
    var input = $("learn-in"); var msg = input.value.replace(/^\s+|\s+$/g,""); if(!msg) return;
    bubble("me", msg); input.value = ""; $("learn-btn").disabled = true; startLive();
    var hints = extractBookHints(msg); var titleQ = hints.title || cleanQuery(msg); var authorQ = hints.author || "";
    Promise.resolve()
      .then(function(){ setLive('Searching Open Library for "'+titleQ+'"…'); return delay(200); })
      .then(function(){ return openLibrarySearch(titleQ+(authorQ?" "+authorQ:"")); })
      .then(function(books){
        setLive("Open Library: "+books.length+" matches · ranking best title…");
        books.sort(function(a,b){ return scoreBook(b, titleQ, authorQ) - scoreBook(a, titleQ, authorQ); });
        return books;
      })
      .then(function(books){
        if(!books.length){
          setLive("No Open Library hit · trying Wikipedia…");
          return wikiSearch(titleQ).then(function(w){ return { books: [], wikiTitles: w }; });
        }
        var top = books[0];
        setLive("Best match: "+top.title+(top.authors?" — "+top.authors:"")+" · loading description…");
        return fetchBookDescription(top.workKey).then(function(desc){
          top.description = desc;
          return { books: books.slice(0,1), wikiTitles: [] };
        });
      })
      .then(function(pack){
        setLive("Checking Wikipedia for more detail…");
        var wikiQ = pack.books.length ? pack.books[0].title+(pack.books[0].authors?" "+pack.books[0].authors.split(",")[0]:"") : titleQ;
        return wikiSearch(wikiQ).then(function(titles){
          pack.wikiTitles = titles;
          if(!titles.length) return pack;
          setLive("Reading Wikipedia: "+titles[0].title+"…");
          return wikiExtract(titles[0].title).then(function(ex){ pack.wiki = ex; return pack; }).catch(function(){ return pack; });
        }).catch(function(){ return pack; });
      })
      .then(function(pack){
        endLive(); $("learn-btn").disabled = false; input.focus();
        if((!pack.books || !pack.books.length) && !pack.wiki){
          bubble("ai", "I could not find a solid match for that title.\n\nTry the full title, or add the author:\n\"Title\" by Author");
          return;
        }
        if(pack.books && pack.books.length){
          var b = pack.books[0];
          var desc = rewriteDesc(b.description);
          if(!desc && pack.wiki) desc = rewriteDesc(pack.wiki.extract);
          if(!desc && b.subjects && b.subjects.length){
            desc = "A book often filed under: "+b.subjects.slice(0,5).join(", ")+". "+(b.year?"First published around "+b.year+". ":"")+"This is the closest Open Library match for your title.";
          }
          if(!desc) desc = "Matched on Open Library"+(b.year?" (about "+b.year+")":"")+", but no long blurb was listed.";
          var cover = coverUrl(b.coverId);
          var html = "";
          if(cover){
            html += '<div class="book-card"><img src="'+esc(cover)+'" alt="cover" onerror="this.style.display=\'none\'" />';
            html += '<div class="info"><strong>'+esc(b.title)+'</strong>';
            html += '<div class="meta">'+esc((b.authors||"Unknown author")+(b.year?" · "+b.year:""))+'</div>';
            html += esc(desc)+'</div></div>';
          } else {
            html += '<strong>'+esc(b.title)+'</strong><br/>';
            html += '<span style="color:#a1a1aa;font-size:12px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc);
          }
          if(b.subjects && b.subjects.length) html += '<br/><br/><small>Topics: '+esc(b.subjects.slice(0,6).join(", "))+'</small>';
          bubbleHTML(html);
        }
        if(pack.wiki && pack.wiki.extract){
          var wdesc = rewriteDesc(pack.wiki.extract);
          if(wdesc && (!pack.books || !pack.books.length || wdesc.length > 80)){
            bubbleHTML("<strong>"+esc(pack.wiki.title)+"</strong><br/><br/>"+esc(wdesc));
          }
        }
        bubble("ai", "Want themes, characters, or a simpler summary? Just ask.");
      })
      .catch(function(e){
        endLive(); $("learn-btn").disabled = false;
        bubble("ai", "Something went wrong: "+e.message+"\nCheck your connection and try again.");
      });
  }
  $("learn-btn").onclick = sendLearn;
  $("learn-in").onkeydown = function(e){ if(e.key === "Enter"){ e.preventDefault(); sendLearn(); } };
  setHwStep(1);
})();
