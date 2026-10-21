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
    statusEl.textContent = "Improving photo & reading text…";
    if(typeof Tesseract === "undefined"){ statusEl.textContent = "Photo added. Type the questions in the box."; return; }
    preprocessImage(file).then(function(imgForOcr){
      return Tesseract.recognize(imgForOcr, "eng", { logger: function(m){
        if(m && m.status === "recognizing text" && m.progress) statusEl.textContent = "Reading text… "+Math.round(m.progress*100)+"%";
      }});
    }).then(function(result){
      var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
      var conf = result && result.data && typeof result.data.confidence === "number" ? result.data.confidence : 0;
      if(text && text.length > 5 && !isGibberish(text)){
        textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        statusEl.textContent = conf >= 35 ? "Text ready — fix any mistakes, then continue." : "Partial read — please fix the text.";
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
    fetch("https://r.jina.ai/" + url).then(function(r){ if(!r.ok) throw new Error("Could not load"); return r.text(); }).then(function(txt){
      txt = txt.replace(/^\s+|\s+$/g,"").slice(0,20000);
      if(txt.length < 40) throw new Error("Empty");
      $("notes-text").value = txt; $("notes-ocr").textContent = "Page text loaded. Make notes when ready.";
    }).catch(function(){ $("notes-ocr").textContent = "Could not open that link. Copy the text in Safari and paste below."; });
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
    else { lines.push("Longer notes (~3 sentences per idea)"); lines.push(""); for(var i=0;i<picks.length;i+=3){ var group = picks.slice(i,i+3); lines.push("Note "+(Math.floor(i/3)+1)); for(var j=0;j<group.length;j++) lines.push(group[j].slice(0,200)); lines.push(""); } }
    lines.push("────────"); lines.push("Test tips: who/what/why · cause → effect · key names & dates");
    return lines.join("\n");
  }
  $("notes-btn").onclick = function(){
    var notes = makeNotes($("notes-text").value, noteStyle), out = $("notes-out");
    if(!notes){ out.className = "panel show"; out.innerHTML = '<div class="t">Notes</div>Add a photo, load a link, or paste text first.'; return; }
    out.className = "panel show"; out.innerHTML = '<div class="t">'+esc(noteStyle)+' notes</div>'+esc(notes);
  };
  var chat = $("chat");
  function bubble(who, text, meta){
    var d = document.createElement("div"); d.className = "b "+(who==="me"?"me":"ai");
    d.innerHTML = esc(text)+(meta?"<small>"+esc(meta)+"</small>":""); chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
  }
  bubble("ai","For books type: \"Title\" by Author\nI write a short description you can read here — not just links.");
  var STOP = {the:1,a:1,an:1,and:1,or:1,of:1,in:1,on:1,to:1,for:1,is:1,it:1,this:1,that:1,with:1,from:1,by:1,as:1,at:1,be:1,was:1,were:1,are:1,about:1,book:1,novel:1,story:1,read:1,reading:1,written:1,author:1,its:1,his:1,her:1,their:1,they:1,who:1,what:1,when:1,where:1,which:1,how:1,can:1,you:1,i:1,me:1,my:1,we:1,our:1,so:1,but:1,if:1,then:1,than:1,also:1,just:1,like:1,one:1,some:1,have:1,has:1,had:1,do:1,does:1,did:1,not:1,please:1,help:1,need:1,want:1,tell:1,explain:1,summary:1,called:1,named:1,find:1,search:1};
  function extractBookHints(msg){
    var raw = msg.replace(/^\s+|\s+$/g,""), title = null, author = null;
    var m = raw.match(/"([^"]{2,100})"/); if(m) title = m[1];
    var by = raw.match(/(.+?)\s+by\s+([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/);
    if(by){ var t = by[1].replace(/^[\s"']+|[\s"']+$/g,""); if(!title && t.length > 1) title = t.replace(/^(the book|book|novel)\s+/i,""); author = by[2].replace(/^\s+|\s+$/g,""); }
    var auth = raw.match(/(?:author|written by|wrote)\s*[:\-]?\s*([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/i);
    if(auth && !author) author = auth[1].replace(/^\s+|\s+$/g,"");
    return { title: title, author: author, raw: raw };
  }
  function extractQueries(msg){
    var raw = msg.replace(/^\s+|\s+$/g,""), queries = [], hints = extractBookHints(msg);
    if(hints.title) queries.push(hints.title);
    if(hints.title && hints.author) queries.push(hints.title + " " + hints.author);
    if(hints.author) queries.push(hints.author);
    var qm = raw.match(/"([^"]{2,80})"/); if(qm) queries.push(qm[1]);
    var q = raw, prefixes = ["what is the ","what is ","explain ","tell me about ","about ","summarize ","i am reading ","i'm reading ","the book ","book called ","find ","search for ","look up "];
    var lower = q.toLowerCase();
    for(var i=0;i<prefixes.length;i++){ if(lower.indexOf(prefixes[i])===0){ q = q.slice(prefixes[i].length); lower = q.toLowerCase(); } }
    q = q.replace(/[?.!]+$/g,"").replace(/^\s+|\s+$/g,""); if(q) queries.push(q);
    var first = q.split(/[.!?]/)[0].replace(/^\s+|\s+$/g,""); if(first && first.length>3 && first!==q) queries.push(first);
    var words = q.replace(/[^a-zA-Z0-9\s\-']/g," ").split(/\s+/), keys = [];
    for(var i=0;i<words.length;i++){ if(words[i].length<2) continue; if(STOP[words[i].toLowerCase()]) continue; keys.push(words[i]); }
    if(keys.length>=2){ queries.push(keys.slice(0,6).join(" ")); queries.push(keys.slice(0,4).join(" ")); }
    if(keys.length) queries.push(keys.slice(0,5).join(" ")+" book");
    var seen={}, out=[];
    for(var i=0;i<queries.length;i++){ var item = queries[i].replace(/^\s+|\s+$/g,""); if(!item||item.length<2) continue; var k=item.toLowerCase(); if(seen[k]) continue; seen[k]=1; out.push(item); }
    return out.length?out:[raw.slice(0,80)];
  }
  function openLibrarySearch(q){
    return fetch("https://openlibrary.org/search.json?q="+encodeURIComponent(q)+"&limit=6").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var docs = data.docs || [], hits = [];
      for(var i=0;i<docs.length;i++){
        var d = docs[i]; if(!d.title) continue;
        hits.push({ kind:"book", title:d.title, authors:(d.author_name||[]).slice(0,3).join(", "), year:d.first_publish_year||"", subjects:(d.subject||[]).slice(0,6).join(", "), workKey:d.key||"", url:d.key?("https://openlibrary.org"+d.key):("https://openlibrary.org/search?q="+encodeURIComponent(d.title)) });
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
      return desc.replace(/\s+/g," ").replace(/^\s+|\s+$/g,"").slice(0,900);
    }).catch(function(){ return ""; });
  }
  function rewriteShort(title, authors, year, subjects, rawDesc){
    var lines = [], head = title;
    if(authors) head += " — " + authors; if(year) head += " (" + year + ")";
    lines.push(head); lines.push("");
    if(rawDesc && rawDesc.length > 40){
      var clean = rawDesc.replace(/\{\{[^}]*\}\}/g,"").replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g,"$1").replace(/\[\[|\]\]/g,"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
      var bits = clean.replace(/([.!?])/g,"$1\n").split("\n"), out = [];
      for(var i=0;i<bits.length && out.length < 3;i++){ var s = bits[i].replace(/^\s+|\s+$/g,""); if(s.length > 25) out.push(s); }
      lines.push("What it is about:");
      if(out.length) for(var i=0;i<out.length;i++) lines.push(out[i]);
      else lines.push(clean.slice(0,320)+(clean.length>320?"…":""));
    } else if(subjects){
      lines.push("What it is about:");
      lines.push("This book is often tagged: " + subjects.split(", ").slice(0,4).join(", ") + ".");
      lines.push("Use the title and author above with your class notes or library.");
    } else {
      lines.push("What it is about:");
      lines.push("A listed work by "+(authors||"the author")+". Open Library has this title on record"+(year?" from around "+year:"")+".");
    }
    if(subjects){ lines.push(""); lines.push("Themes / topics: " + subjects.split(", ").slice(0,5).join(", ")); }
    return lines.join("\n");
  }
  function rewriteWiki(title, extract){
    var clean = (extract||"").replace(/\s+/g," ").replace(/^\s+|\s+$/g,"");
    var bits = clean.replace(/([.!?])/g,"$1\n").split("\n"), out = [];
    for(var i=0;i<bits.length && out.length < 4;i++){ var s = bits[i].replace(/^\s+|\s+$/g,""); if(s.length > 30) out.push(s); }
    return title + "\n\n" + (out.length ? out.join(" ") : clean.slice(0,500));
  }
  function wikiOpenSearch(query){
    return fetch("https://en.wikipedia.org/w/api.php?action=opensearch&search="+encodeURIComponent(query)+"&limit=6&namespace=0&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var titles=data[1]||[], urls=data[3]||[], hits=[]; for(var i=0;i<titles.length;i++) hits.push({kind:"wiki", title:titles[i], url:urls[i]}); return hits;
    });
  }
  function wikiFullSearch(query){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(query)+"&srlimit=6&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var arr=(data.query&&data.query.search)?data.query.search:[], hits=[]; for(var i=0;i<arr.length;i++) hits.push({kind:"wiki", title:arr[i].title, url:"https://en.wikipedia.org/wiki/"+encodeURIComponent(arr[i].title.replace(/ /g,"_"))}); return hits;
    });
  }
  function wikiExtract(title){
    return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1600&titles="+encodeURIComponent(title)+"&format=json&origin=*").then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var pages=data.query&&data.query.pages?data.query.pages:{}; var keys=Object.keys(pages); if(!keys.length) return null;
      var p=pages[keys[0]]; if(p.missing!==undefined) return null; var extract=(p.extract||"").trim(); if(!extract) return null;
      return {kind:"wiki", title:p.title, extract:extract.slice(0,1600), url:"https://en.wikipedia.org/wiki/"+encodeURIComponent(p.title.replace(/ /g,"_"))};
    });
  }
  function mergeHits(arrays){
    var seen={}, out=[]; for(var a=0;a<arrays.length;a++){ var hits=arrays[a]||[]; for(var i=0;i<hits.length;i++){ var id=(hits[i].kind||"")+"|"+hits[i].title; if(!seen[id]){ seen[id]=1; out.push(hits[i]); } } } return out;
  }
  function scoreHit(h, keyWords, hints){
    var t=(h.title||"").toLowerCase(), s=0;
    for(var i=0;i<keyWords.length;i++) if(t.indexOf(keyWords[i].toLowerCase())!==-1) s+=3;
    if(hints.title && t.indexOf(hints.title.toLowerCase().slice(0,10))!==-1) s+=10;
    if(hints.author && (h.authors||"").toLowerCase().indexOf(hints.author.toLowerCase().split(/\s+/).pop())!==-1) s+=10;
    if(h.kind==="book") s+=3; return s;
  }
  function sendLearn(){
    var input=$("learn-in"); var msg=input.value.replace(/^\s+|\s+$/g,""); if(!msg) return;
    bubble("me",msg); input.value=""; $("learn-btn").disabled=true;
    bubble("ai","…","finding books & writing short descriptions…");
    function done(text, meta){
      if(chat.lastChild) chat.removeChild(chat.lastChild);
      bubble("ai", text, meta||""); $("srcs").innerHTML = ""; $("learn-btn").disabled=false; input.focus();
    }
    var hints=extractBookHints(msg), queries=extractQueries(msg).slice(0,5), jobs=[];
    for(var i=0;i<queries.length;i++){
      jobs.push(openLibrarySearch(queries[i]).catch(function(){return[];}));
      jobs.push(wikiOpenSearch(queries[i]).catch(function(){return[];}));
      jobs.push(wikiFullSearch(queries[i]).catch(function(){return[];}));
    }
    if(hints.title){
      jobs.push(openLibrarySearch(hints.title).catch(function(){return[];}));
      if(hints.author){
        jobs.push(openLibrarySearch(hints.title+" "+hints.author).catch(function(){return[];}));
        jobs.push(openLibrarySearch(hints.author+" "+hints.title).catch(function(){return[];}));
      }
    }
    Promise.all(jobs).then(function(results){
      var hits=mergeHits(results);
      var keyWords=msg.replace(/[^a-zA-Z0-9\s\-']/g," ").split(/\s+/).filter(function(w){return w.length>2&&!STOP[w.toLowerCase()];});
      if(!hits.length){ done("I could not find that yet.\n\nTry:\n\"Exact Title\" by Author Name\n\nExample: \"The Giver\" by Lois Lowry", ""); return null; }
      hits.sort(function(a,b){ return scoreHit(b,keyWords,hints)-scoreHit(a,keyWords,hints); });
      var books=hits.filter(function(h){return h.kind==="book";}).slice(0,3);
      var wikis=hits.filter(function(h){return h.kind==="wiki";}).slice(0,2);
      var descJobs = books.map(function(b){ return fetchBookDescription(b.workKey).then(function(desc){ b.description = desc; return b; }); });
      var wikiJobs = wikis.map(function(h){ return wikiExtract(h.title).then(function(ex){ return ex; }).catch(function(){ return null; }); });
      return Promise.all([Promise.all(descJobs), Promise.all(wikiJobs)]);
    }).then(function(pair){
      if(!pair) return;
      var books = pair[0] || [], extracts = (pair[1] || []).filter(function(x){ return x; }), parts = [];
      if(books.length){
        parts.push("Here is a short description of what I found:"); parts.push("");
        for(var i=0;i<books.length;i++){ parts.push("--- Book "+(i+1)+" ---"); parts.push(rewriteShort(books[i].title, books[i].authors, books[i].year, books[i].subjects, books[i].description)); parts.push(""); }
      }
      if(extracts.length){
        if(!books.length) parts.push("Short overview:"); else parts.push("Extra background:"); parts.push("");
        for(var i=0;i<extracts.length;i++){ parts.push(rewriteWiki(extracts[i].title, extracts[i].extract)); parts.push(""); }
      }
      if(!parts.length){ done("Found a title but no description. Try another wording.", ""); return; }
      parts.push("Ask me for themes, characters, or an even simpler summary if you need it.");
      done(parts.join("\n"), books.length ? (books.length+" book"+(books.length>1?"s":"")) : "overview");
    }).catch(function(e){ done("Error: "+e.message, ""); });
  }
  $("learn-btn").onclick=sendLearn;
  $("learn-in").onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); sendLearn(); } };
  setHwStep(1);
})();
