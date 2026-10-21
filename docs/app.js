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
    var root = $(id);
    if(!root) return;
    var pills = root.getElementsByClassName("pill");
    for(var i=0;i<pills.length;i++){
      pills[i].onclick = (function(btn){
        return function(){
          for(var k=0;k<pills.length;k++) pills[k].classList.remove("on");
          btn.classList.add("on");
          cb(btn.getAttribute(attr));
        };
      })(pills[i]);
    }
  }

  var hwMode = "explain";
  var hwStyle = "grade7";
  var hwQuestions = [];
  setupPills("hw-modes", "data-m", function(v){ hwMode = v; });
  setupPills("hw-style", "data-s", function(v){ hwStyle = v; });

  function setHwStep(n){
    var labels = ["Step 1 · Add the worksheet","Step 2 · Pick questions","Step 3 · How to help","Step 4 · Result"];
    $("hw-step-label").textContent = labels[n-1] || "";
    var dots = $("hw-dots").children;
    for(var i=0;i<dots.length;i++){
      dots[i].className = "step-dot" + (i+1 < n ? " done" : (i+1 === n ? " on" : ""));
    }
    $("hw-s1").style.display = n===1 ? "block" : "none";
    $("hw-s2").style.display = n===2 ? "block" : "none";
    $("hw-s3").style.display = n===3 ? "block" : "none";
    $("hw-s4").style.display = n===4 ? "block" : "none";
  }

  function isGibberish(text){
    if(!text || text.length < 8) return true;
    var letters = (text.match(/[a-zA-Z]/g) || []).length;
    var ratio = letters / text.length;
    if(ratio < 0.45) return true;
    var words = text.split(/\s+/).filter(function(w){ return w.length > 0; });
    if(words.length < 3) return true;
    var weird = 0;
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(w.length >= 3 && !/[aeiouAEIOU]/.test(w) && /[a-zA-Z]{3,}/.test(w)) weird++;
    }
    if(weird / words.length > 0.35) return true;
    var singles = 0;
    for(var i=0;i<words.length;i++) if(words[i].length === 1) singles++;
    if(singles / words.length > 0.25) return true;
    return false;
  }

  function preprocessImage(file){
    return new Promise(function(resolve){
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function(){
        try {
          var maxW = 1600;
          var scale = img.width > maxW ? maxW / img.width : (img.width < 600 ? 2 : 1.25);
          var w = Math.round(img.width * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          var id = ctx.getImageData(0, 0, w, h);
          var d = id.data;
          for(var i=0;i<d.length;i+=4){
            var g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
            g = (g - 128) * 1.35 + 128;
            if(g < 0) g = 0; if(g > 255) g = 255;
            if(g > 200) g = 255; else if(g < 90) g = 0;
            d[i]=d[i+1]=d[i+2]=g;
          }
          ctx.putImageData(id, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(function(blob){ resolve(blob || file); }, "image/png");
        } catch(e){ URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  function runOCR(file, statusEl, textEl, prevEl){
    if(prevEl){
      try{ prevEl.src = URL.createObjectURL(file); prevEl.style.display = "block"; }catch(e){}
    }
    statusEl.textContent = "Improving photo & reading text… (10–30 sec)";
    if(typeof Tesseract === "undefined"){
      statusEl.textContent = "Photo added. Type the questions in the box — auto-read is offline.";
      return;
    }
    preprocessImage(file).then(function(imgForOcr){
      return Tesseract.recognize(imgForOcr, "eng", {
        logger: function(m){
          if(m && m.status === "recognizing text" && m.progress){
            statusEl.textContent = "Reading text… " + Math.round(m.progress * 100) + "%";
          }
        }
      });
    }).then(function(result){
      var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
      var conf = result && result.data && typeof result.data.confidence === "number" ? result.data.confidence : 0;
      if(text && text.length > 5 && !isGibberish(text) && conf >= 35){
        textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        statusEl.textContent = "Text ready — fix any mistakes, then continue.";
      } else if(text && text.length > 5 && !isGibberish(text)){
        textEl.value = textEl.value ? (textEl.value + "\n\n" + text) : text;
        statusEl.textContent = "Partial read — please fix the text before continuing.";
      } else {
        statusEl.textContent = "Could not read that photo clearly (blurry, dark, or handwriting). Type the questions in the box, or retake with brighter light and the page filling the frame.";
      }
    }).catch(function(){
      statusEl.textContent = "Could not read photo. Type the questions below.";
    });
  }

  function onHwFile(input){
    var f = input.files && input.files[0];
    if(!f) return;
    runOCR(f, $("hw-ocr"), $("hw-text"), $("hw-prev"));
  }
  $("hw-cam").onchange = function(){ onHwFile(this); };
  $("hw-up").onchange = function(){ onHwFile(this); };

  function parseQuestions(text){
    var lines = text.split(/\n/);
    var qs = [];
    var buf = "";
    var reStart = /^\s*(?:(?:question\s*)?\d+[\).\:\-]|[Qq]\d+[\).\:\-]|[A-D][\).]|\(\d+\))/;
    for(var i=0;i<lines.length;i++){
      var line = lines[i].replace(/\s+$/g,"");
      if(!line.replace(/\s/g,"")) continue;
      if(reStart.test(line) && buf){
        qs.push(buf.replace(/^\s+|\s+$/g,""));
        buf = line;
      } else {
        buf = buf ? (buf + " " + line) : line;
      }
    }
    if(buf.replace(/^\s+|\s+$/g,"")) qs.push(buf.replace(/^\s+|\s+$/g,""));
    if(qs.length <= 1 && text.length > 80){
      var parts = text.replace(/\s+/g," ").split(/(?=\b\d+[\).])/);
      qs = [];
      for(var i=0;i<parts.length;i++){
        var p = parts[i].replace(/^\s+|\s+$/g,"");
        if(p.length > 12) qs.push(p);
      }
    }
    if(!qs.length) qs = [text.replace(/^\s+|\s+$/g,"").slice(0,500)];
    return qs.slice(0,12).map(function(q, idx){
      return { n: idx+1, text: q.slice(0,300), suggested: idx+1 };
    });
  }

  $("hw-next1").onclick = function(){
    var t = $("hw-text").value.replace(/^\s+|\s+$/g,"");
    if(!t){ $("hw-ocr").textContent = "Add a photo or type the worksheet text first."; return; }
    if(isGibberish(t)){
      $("hw-ocr").textContent = "That text looks unreadable. Fix it or type the real questions before analyzing.";
      return;
    }
    hwQuestions = parseQuestions(t);
    var box = $("hw-qlist");
    box.innerHTML = "";
    for(var i=0;i<hwQuestions.length;i++){
      var q = hwQuestions[i];
      var div = document.createElement("div");
      div.className = "q-item";
      div.innerHTML = '<input type="checkbox" id="qq'+i+'" checked /><label for="qq'+i+'"><strong>#'+q.n+'</strong> (do in order) — '+esc(q.text)+'</label>';
      box.appendChild(div);
    }
    setHwStep(2);
  };
  $("hw-back2").onclick = function(){ setHwStep(1); };
  $("hw-next2").onclick = function(){ setHwStep(3); };
  $("hw-back3").onclick = function(){ setHwStep(2); };
  $("hw-restart").onclick = function(){
    $("hw-text").value = "";
    $("hw-prev").style.display = "none";
    $("hw-ocr").textContent = "";
    $("hw-opt").value = "";
    setHwStep(1);
  };

  function styleGuide(s){
    if(s==="grade7") return "Write clearly for a 7th grade student and up: short sentences, simple words, explain any hard term.";
    if(s==="high") return "Write at a high-school level: clear structure, some academic words OK.";
    return "Write like a normal person explaining to a friend: natural and plain.";
  }

  $("hw-go").onclick = function(){
    var selected = [];
    for(var i=0;i<hwQuestions.length;i++){
      var cb = $("qq"+i);
      if(cb && cb.checked) selected.push(hwQuestions[i]);
    }
    if(!selected.length) selected = hwQuestions.slice(0,1);
    var opt = $("hw-opt").value.replace(/^\s+|\s+$/g,"");
    var lines = [];
    lines.push("Plan");
    lines.push("Do these in order:");
    for(var i=0;i<selected.length;i++) lines.push("  "+(i+1)+". #"+selected[i].n+" — "+selected[i].text.slice(0,80));
    lines.push("");
    lines.push("Mode: "+(hwMode==="explain"?"Explanation":hwMode==="answer"?"Answer":"Answer + Explanation"));
    lines.push(styleGuide(hwStyle));
    if(opt) lines.push("Your note: "+opt);
    lines.push("");
    for(var i=0;i<selected.length;i++){
      var q = selected[i];
      lines.push("────────");
      lines.push("Question #"+q.n);
      lines.push(q.text);
      lines.push("");
      if(hwMode==="explain"){
        lines.push("Explanation");
        lines.push("1. What this is asking in plain words");
        lines.push("2. What you need to know / use");
        lines.push("3. Steps to think through");
        lines.push("4. Common mistakes to avoid");
      } else if(hwMode==="answer"){
        lines.push("Answer approach");
        lines.push("• State the answer clearly when the question allows");
        lines.push("• For math: show the steps");
        lines.push("• For reading: point to evidence");
        lines.push("Draft: _______________");
      } else {
        lines.push("Answer + Explanation");
        lines.push("Answer: _______________");
        lines.push("Why: (1–3 sentences in the chosen writing style)");
        lines.push("Evidence / steps:");
      }
      if(/essay|paragraph|write about|compose/i.test(q.text)){
        lines.push("");
        lines.push("Essay scaffold ("+hwStyle+")");
        lines.push("• Hook / intro sentence");
        lines.push("• Main idea");
        lines.push("• 2–3 supporting points");
        lines.push("• Short conclusion");
      }
      lines.push("");
    }
    var out = $("hw-out");
    out.innerHTML = '<div class="t">Homework help</div>'+esc(lines.join("\n"));
    setHwStep(4);
  };

  var noteStyle = "short";
  setupPills("note-modes", "data-s", function(v){ noteStyle = v; });

  function onNotesFile(input){
    var f = input.files && input.files[0];
    if(!f) return;
    runOCR(f, $("notes-ocr"), $("notes-text"), $("notes-prev"));
  }
  $("notes-cam").onchange = function(){ onNotesFile(this); };
  $("notes-up").onchange = function(){ onNotesFile(this); };

  $("notes-fetch").onclick = function(){
    var url = $("notes-url").value.replace(/^\s+|\s+$/g,"");
    if(!url){ $("notes-ocr").textContent = "Paste a link first."; return; }
    if(!/^https?:\/\//i.test(url)) url = "https://" + url;
    $("notes-ocr").textContent = "Loading page text…";
    var proxy = "https://r.jina.ai/" + url;
    fetch(proxy).then(function(r){
      if(!r.ok) throw new Error("Could not load");
      return r.text();
    }).then(function(txt){
      txt = txt.replace(/^\s+|\s+$/g,"").slice(0,20000);
      if(txt.length < 40) throw new Error("Empty");
      $("notes-text").value = txt;
      $("notes-ocr").textContent = "Page text loaded. Scroll the box and Make notes.";
    }).catch(function(){
      $("notes-ocr").textContent = "Could not open that link here. Open it in Safari, copy the text, and paste below.";
    });
  };

  function makeNotes(raw, style){
    raw = raw.replace(/^\s+|\s+$/g,"");
    if(!raw) return null;
    var parts = raw.replace(/\s+/g," ").replace(/([.!?])/g,"$1\n").split("\n");
    var sents = [];
    for(var i=0;i<parts.length;i++){
      var s = parts[i].replace(/^\s+|\s+$/g,"");
      if(s.length > 20) sents.push(s);
    }
    if(!sents.length) sents = [raw.slice(0,200)];
    var base = Math.min(sents.length, Math.max(3, Math.floor(sents.length / (style==="short"?4:style==="medium"?3:2))));
    var n = style==="short" ? Math.min(base, 8) : style==="medium" ? Math.min(base, 12) : Math.min(base, 16);
    var picks = sents.slice(0, n);
    var lines = [];
    if(style==="short"){
      lines.push("Short notes (for quick review)"); lines.push("");
      for(var i=0;i<picks.length;i++) lines.push("• "+picks[i].slice(0,120));
    } else if(style==="medium"){
      lines.push("Medium notes (study + quiz ready)"); lines.push("");
      for(var i=0;i<picks.length;i++) lines.push((i+1)+". "+picks[i].slice(0,180));
    } else {
      lines.push("Longer notes (~3 sentences per idea)"); lines.push("");
      for(var i=0;i<picks.length;i+=3){
        var group = picks.slice(i, i+3);
        lines.push("Note "+(Math.floor(i/3)+1));
        for(var j=0;j<group.length;j++) lines.push(group[j].slice(0,200));
        lines.push("");
      }
    }
    lines.push("────────");
    lines.push("Test tips: who/what/why · cause → effect · key names & dates");
    return lines.join("\n");
  }

  $("notes-btn").onclick = function(){
    var notes = makeNotes($("notes-text").value, noteStyle);
    var out = $("notes-out");
    if(!notes){
      out.className = "panel show";
      out.innerHTML = '<div class="t">Notes</div>Add a photo, load a link, or paste text first.';
      return;
    }
    out.className = "panel show";
    out.innerHTML = '<div class="t">'+esc(noteStyle)+' notes</div>'+esc(notes);
  };

  var chat = $("chat");
  function bubble(who, text, meta){
    var d = document.createElement("div");
    d.className = "b "+(who==="me"?"me":"ai");
    d.innerHTML = esc(text)+(meta?"<small>"+esc(meta)+"</small>":"");
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }
  bubble("ai","Ask about a book or topic. I search several Wikipedia pages.");

  var STOP = {the:1,a:1,an:1,and:1,or:1,of:1,in:1,on:1,to:1,for:1,is:1,it:1,this:1,that:1,with:1,from:1,by:1,as:1,at:1,be:1,was:1,were:1,are:1,about:1,book:1,novel:1,story:1,read:1,reading:1,its:1,his:1,her:1,their:1,they:1,who:1,what:1,when:1,where:1,which:1,how:1,can:1,you:1,i:1,me:1,my:1,we:1,our:1,so:1,but:1,if:1,then:1,than:1,also:1,just:1,like:1,one:1,some:1,have:1,has:1,had:1,do:1,does:1,did:1,not:1,please:1,help:1,need:1,want:1,tell:1,explain:1,summary:1};

  function extractQueries(msg){
    var raw = msg.replace(/^\s+|\s+$/g,"");
    var queries = [];
    var qm = raw.match(/"([^"]{2,80})"/);
    if(qm) queries.push(qm[1]);
    var q = raw;
    var prefixes = ["what is the ","what is ","explain ","tell me about ","about ","summarize ","i am reading ","i'm reading ","the book ","book called "];
    var lower = q.toLowerCase();
    for(var i=0;i<prefixes.length;i++){
      if(lower.indexOf(prefixes[i])===0){ q = q.slice(prefixes[i].length); lower = q.toLowerCase(); }
    }
    q = q.replace(/[?.!]+$/g,"").replace(/^\s+|\s+$/g,"");
    if(q) queries.push(q);
    var first = q.split(/[.!?]/)[0].replace(/^\s+|\s+$/g,"");
    if(first && first.length>3 && first!==q) queries.push(first);
    var words = q.replace(/[^a-zA-Z0-9\s\-']/g," ").split(/\s+/);
    var keys = [];
    for(var i=0;i<words.length;i++){
      if(words[i].length<3) continue;
      if(STOP[words[i].toLowerCase()]) continue;
      keys.push(words[i]);
    }
    if(keys.length>=2){ queries.push(keys.slice(0,5).join(" ")); queries.push(keys.slice(0,3).join(" ")); }
    if(keys.length) queries.push(keys.slice(0,4).join(" ")+" book");
    var seen={}, out=[];
    for(var i=0;i<queries.length;i++){
      var item = queries[i].replace(/^\s+|\s+$/g,"");
      if(!item||item.length<2) continue;
      var k=item.toLowerCase(); if(seen[k]) continue; seen[k]=1; out.push(item);
    }
    return out.length?out:[raw.slice(0,80)];
  }

  function wikiOpenSearch(query){
    var url="https://en.wikipedia.org/w/api.php?action=opensearch&search="+encodeURIComponent(query)+"&limit=8&namespace=0&format=json&origin=*";
    return fetch(url).then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var titles=data[1]||[], urls=data[3]||[], hits=[];
      for(var i=0;i<titles.length;i++) hits.push({title:titles[i],url:urls[i]});
      return hits;
    });
  }
  function wikiFullSearch(query){
    var url="https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(query)+"&srlimit=8&format=json&origin=*";
    return fetch(url).then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var arr=(data.query&&data.query.search)?data.query.search:[], hits=[];
      for(var i=0;i<arr.length;i++) hits.push({title:arr[i].title,url:"https://en.wikipedia.org/wiki/"+encodeURIComponent(arr[i].title.replace(/ /g,"_"))});
      return hits;
    });
  }
  function wikiExtract(title){
    var url="https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1400&titles="+encodeURIComponent(title)+"&format=json&origin=*";
    return fetch(url).then(function(r){ if(!r.ok) throw new Error("fail"); return r.json(); }).then(function(data){
      var pages=data.query&&data.query.pages?data.query.pages:{}; var keys=Object.keys(pages);
      if(!keys.length) return null; var p=pages[keys[0]]; if(p.missing!==undefined) return null;
      var extract=(p.extract||"").trim(); if(!extract) return null;
      return {title:p.title,extract:extract.slice(0,1500),url:"https://en.wikipedia.org/wiki/"+encodeURIComponent(p.title.replace(/ /g,"_"))};
    });
  }
  function mergeHits(arrays){
    var seen={}, out=[];
    for(var a=0;a<arrays.length;a++){ var hits=arrays[a]||[]; for(var i=0;i<hits.length;i++){ if(!seen[hits[i].title]){ seen[hits[i].title]=1; out.push(hits[i]); } } }
    return out;
  }

  function sendLearn(){
    var input=$("learn-in"); var msg=input.value.replace(/^\s+|\s+$/g,""); if(!msg) return;
    bubble("me",msg); input.value=""; $("learn-btn").disabled=true; bubble("ai","…","searching…");
    function done(text,links,meta){
      if(chat.lastChild) chat.removeChild(chat.lastChild);
      bubble("ai",text,meta||"");
      var box=$("srcs"); box.innerHTML="";
      if(links) for(var i=0;i<links.length;i++){ var a=document.createElement("a"); a.href=links[i].url; a.target="_blank"; a.rel="noopener"; a.textContent="["+(i+1)+"] "+links[i].title; box.appendChild(a); }
      $("learn-btn").disabled=false; input.focus();
    }
    var queries=extractQueries(msg).slice(0,5); var jobs=[];
    for(var i=0;i<queries.length;i++){ jobs.push(wikiOpenSearch(queries[i]).catch(function(){return[];})); jobs.push(wikiFullSearch(queries[i]).catch(function(){return[];})); }
    Promise.all(jobs).then(function(results){
      var hits=mergeHits(results);
      if(!hits.length){ done("Nothing found.\nTry the exact title in quotes, or author + title.\nTried: "+queries.slice(0,3).join(" | "),[],""); return null; }
      var keyWords=msg.replace(/[^a-zA-Z0-9\s]/g," ").split(/\s+/).filter(function(w){return w.length>2&&!STOP[w.toLowerCase()];});
      hits.sort(function(a,b){
        function sc(h){ var t=h.title.toLowerCase(),s=0; for(var i=0;i<keyWords.length;i++) if(t.indexOf(keyWords[i].toLowerCase())!==-1)s+=2; return s; }
        return sc(b)-sc(a);
      });
      var top=hits.slice(0,5); var chain=Promise.resolve([]);
      top.forEach(function(h){ chain=chain.then(function(acc){ return wikiExtract(h.title).then(function(ex){ if(ex)acc.push(ex); return acc; }).catch(function(){return acc;}); }); });
      return chain;
    }).then(function(extracts){
      if(extracts===null||extracts===undefined) return;
      if(!extracts.length){ done("Found titles but no page text. Try quoted title.",[],""); return; }
      var parts=["Opened "+extracts.length+" page(s):",""];
      for(var i=0;i<extracts.length;i++){ parts.push("["+(i+1)+"] "+extracts[i].title); parts.push(extracts[i].extract); parts.push(""); }
      done(parts.join("\n"),extracts,extracts.length+" pages");
    }).catch(function(e){ done("Error: "+e.message,[],""); });
  }
  $("learn-btn").onclick=sendLearn;
  $("learn-in").onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); sendLearn(); } };

  setHwStep(1);
})();
