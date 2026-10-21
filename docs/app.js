(function(){
  function $(id){ return document.getElementById(id); }
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

  var hwMode = "help";
  var noteStyle = "light";
  function setupPills(id, attr, cb){
    var root = $(id);
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
  setupPills("hw-modes", "data-m", function(v){ hwMode = v; });
  setupPills("note-modes", "data-s", function(v){ noteStyle = v; });

  function esc(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  $("hw-file").onchange = function(){
    var f = this.files && this.files[0];
    if(!f) return;
    var status = $("hw-ocr-status");
    var prev = $("hw-prev");
    if(f.type.indexOf("image") === 0 || !f.type){
      try {
        var url = URL.createObjectURL(f);
        prev.src = url;
        prev.style.display = "block";
      } catch(e) {}
      status.textContent = "Reading text from photo…";
      if(typeof Tesseract === "undefined"){
        status.textContent = "Photo added. Type the question if text is not filled in.";
        return;
      }
      Tesseract.recognize(f, "eng").then(function(result){
        var text = (result && result.data && result.data.text) ? result.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim() : "";
        if(text && text.length > 5){
          var box = $("hw-text");
          box.value = box.value ? (box.value + "\n\n" + text) : text;
          status.textContent = "Text from photo is ready. Edit if needed, then Solve.";
        } else {
          status.textContent = "Hard to read that photo. Type the question below.";
        }
      }).catch(function(){
        status.textContent = "Could not read photo. Type the question below.";
      });
    } else {
      status.textContent = "Use a photo of the page for best results.";
    }
  };

  $("hw-btn").onclick = function(){
    var t = $("hw-text").value.replace(/^\s+|\s+$/g,"");
    var nums = $("hw-nums").value.replace(/^\s+|\s+$/g,"");
    var out = $("hw-out");
    if(!t){ out.className="out show"; out.innerHTML="<b>Result</b>Add a photo with + or type the question."; return; }
    var lines = ["What you are being asked","- Read the question carefully."];
    if(nums) lines.push("- Focus on #: "+nums);
    lines.push("","Break it down","- Key words: what / why / how / calculate / explain","- What do you already know?","- What is missing?","");
    if(hwMode==="help"){
      lines.push("Help me understand","1. Restate in your own words","2. Name the topic","3. One fact or formula","4. First small step only","5. If stuck, say what is confusing","","Your question:",t.slice(0,1200));
    } else if(hwMode==="answer"){
      lines.push("Direct approach","- Use the question + your materials","- Math: show steps","- Reading: cite a sentence","","Draft answer: _______________","","Question:",t.slice(0,1200));
    } else {
      lines.push("Answer + explain","1. One-sentence answer","2. Why","3. Evidence or steps","","Answer: ...","Because: ...","Evidence: ...","","Question:",t.slice(0,1200));
    }
    out.className="out show";
    out.innerHTML="<b>Result</b>"+esc(lines.join("\n"));
  };

  $("notes-btn").onclick = function(){
    var raw = $("notes-text").value.replace(/^\s+|\s+$/g,"");
    var out = $("notes-out");
    if(!raw){ out.className="out show"; out.innerHTML="<b>Notes</b>Paste text first."; return; }
    var parts = raw.replace(/\s+/g," ").replace(/([.!?])/g,"$1\n").split("\n");
    var sentences = [];
    for(var i=0;i<parts.length;i++){
      var s = parts[i].replace(/^\s+|\s+$/g,"");
      if(s.length>15) sentences.push(s);
    }
    var n = (noteStyle==="light"||noteStyle==="short")?5:(noteStyle==="medium"?10:16);
    var bullets = sentences.slice(0,n);
    var lines = [];
    if(noteStyle==="light"){
      lines.push("Light notes","");
      for(var i=0;i<bullets.length;i++) lines.push((i+1)+". "+bullets[i]);
    } else if(noteStyle==="short"){
      lines.push("Short review","");
      for(var i=0;i<bullets.length;i++) lines.push("• "+bullets[i].slice(0,110));
    } else if(noteStyle==="medium"){
      lines.push("Medium notes","","Main ideas");
      for(var i=0;i<Math.min(4,bullets.length);i++) lines.push("• "+bullets[i]);
      lines.push("","Details");
      for(var i=4;i<bullets.length;i++) lines.push("• "+bullets[i]);
    } else {
      lines.push("Test-prep notes","");
      for(var i=0;i<bullets.length;i++) lines.push((i+1)+". "+bullets[i]);
      lines.push("","Prompts: causes? effects? names/dates?");
    }
    out.className="out show";
    out.innerHTML="<b>"+esc(noteStyle)+"</b>"+esc(lines.join("\n"));
  };

  var chat = $("chat");
  function bubble(who, text, meta){
    var d = document.createElement("div");
    d.className = "b "+(who==="me"?"me":"ai");
    d.innerHTML = esc(text)+(meta?"<small>"+esc(meta)+"</small>":"");
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }
  bubble("ai","Describe a book or topic in your own words. I search Wikipedia with several queries and open multiple pages.");

  var STOP = {the:1,a:1,an:1,and:1,or:1,of:1,in:1,on:1,to:1,for:1,is:1,it:1,this:1,that:1,with:1,from:1,by:1,as:1,at:1,be:1,was:1,were:1,are:1,about:1,book:1,novel:1,story:1,read:1,reading:1,its:1,his:1,her:1,their:1,they:1,them:1,who:1,what:1,when:1,where:1,which:1,how:1,can:1,you:1,i:1,me:1,my:1,we:1,our:1,so:1,but:1,if:1,then:1,than:1,also:1,just:1,like:1,one:1,some:1,into:1,over:1,after:1,before:1,there:1,have:1,has:1,had:1,do:1,does:1,did:1,not:1,no:1,yes:1,very:1,really:1,please:1,help:1,need:1,want:1,tell:1,explain:1,summary:1,summarize:1};

  function extractQueries(msg){
    var raw = msg.replace(/^\s+|\s+$/g,"");
    var queries = [];
    var qm = raw.match(/"([^"]{2,80})"/);
    if(qm) queries.push(qm[1]);
    var q = raw;
    var prefixes = ["what is the ","what is ","what are ","who is ","who was ","explain ","define ","tell me about ","about ","summarize ","summary of ","i need help with ","help me with ","can you explain ","i am reading ","im reading ","i'm reading ","the book ","a book called ","book called ","novel called "];
    var lower = q.toLowerCase();
    for(var i=0;i<prefixes.length;i++){
      if(lower.indexOf(prefixes[i])===0){
        q = q.slice(prefixes[i].length);
        lower = q.toLowerCase();
      }
    }
    q = q.replace(/[?.!]+$/g,"").replace(/^\s+|\s+$/g,"");
    if(q) queries.push(q);
    var first = q.split(/[.!?]/)[0].replace(/^\s+|\s+$/g,"");
    if(first && first.length > 3 && first !== q) queries.push(first);
    var words = q.replace(/[^a-zA-Z0-9\s\-']/g," ").split(/\s+/);
    var keys = [];
    for(var i=0;i<words.length;i++){
      var w = words[i];
      if(w.length < 3) continue;
      if(STOP[w.toLowerCase()]) continue;
      keys.push(w);
    }
    if(keys.length >= 2){
      queries.push(keys.slice(0,6).join(" "));
      queries.push(keys.slice(0,4).join(" "));
      queries.push(keys.slice(0,3).join(" "));
    }
    if(keys.length >= 1) queries.push(keys[0]);
    var core = keys.slice(0,4).join(" ");
    if(core){
      queries.push(core + " book");
      queries.push(core + " novel");
    }
    var seen = {};
    var out = [];
    for(var i=0;i<queries.length;i++){
      var item = queries[i].replace(/^\s+|\s+$/g,"");
      if(!item || item.length < 2) continue;
      var k = item.toLowerCase();
      if(seen[k]) continue;
      seen[k] = 1;
      out.push(item);
    }
    return out.length ? out : [raw.slice(0,80)];
  }

  function wikiOpenSearch(query){
    var url = "https://en.wikipedia.org/w/api.php?action=opensearch&search="+encodeURIComponent(query)+"&limit=8&namespace=0&format=json&origin=*";
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error("Search failed");
      return r.json();
    }).then(function(data){
      var titles = data[1]||[];
      var urls = data[3]||[];
      var hits = [];
      for(var i=0;i<titles.length;i++) hits.push({title:titles[i], url:urls[i]});
      return hits;
    });
  }

  function wikiFullSearch(query){
    var url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(query)+"&srlimit=8&format=json&origin=*";
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error("Search failed");
      return r.json();
    }).then(function(data){
      var arr = (data.query && data.query.search) ? data.query.search : [];
      var hits = [];
      for(var i=0;i<arr.length;i++){
        hits.push({
          title: arr[i].title,
          url: "https://en.wikipedia.org/wiki/"+encodeURIComponent(arr[i].title.replace(/ /g,"_"))
        });
      }
      return hits;
    });
  }

  function wikiExtract(title){
    var url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1400&titles="+encodeURIComponent(title)+"&format=json&origin=*";
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error("Page failed");
      return r.json();
    }).then(function(data){
      var pages = data.query && data.query.pages ? data.query.pages : {};
      var keys = Object.keys(pages);
      if(!keys.length) return null;
      var p = pages[keys[0]];
      if(p.missing !== undefined) return null;
      var extract = (p.extract||"").trim();
      if(!extract) return null;
      return {
        title: p.title,
        extract: extract.slice(0,1500),
        url: "https://en.wikipedia.org/wiki/"+encodeURIComponent(p.title.replace(/ /g,"_"))
      };
    });
  }

  function mergeHits(arrays){
    var seen = {};
    var out = [];
    for(var a=0;a<arrays.length;a++){
      var hits = arrays[a]||[];
      for(var i=0;i<hits.length;i++){
        var t = hits[i].title;
        if(!seen[t]){ seen[t]=1; out.push(hits[i]); }
      }
    }
    return out;
  }

  function scoreHit(h, keys){
    var t = h.title.toLowerCase();
    var s = 0;
    for(var i=0;i<keys.length;i++){
      if(t.indexOf(keys[i].toLowerCase()) !== -1) s += 2;
    }
    if(t.indexOf("book")!==-1 || t.indexOf("novel")!==-1) s += 1;
    return s;
  }

  function sendLearn(){
    var input = $("learn-in");
    var msg = input.value.replace(/^\s+|\s+$/g,"");
    if(!msg) return;
    var useWeb = $("web-on").checked;
    bubble("me", msg);
    input.value = "";
    $("learn-btn").disabled = true;
    bubble("ai", "…", useWeb ? "searching many pages…" : "");

    function done(text, links, meta){
      if(chat.lastChild) chat.removeChild(chat.lastChild);
      bubble("ai", text, meta||"");
      var box = $("srcs");
      box.innerHTML = "";
      if(links && links.length){
        for(var i=0;i<links.length;i++){
          var a = document.createElement("a");
          a.href = links[i].url;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = "["+(i+1)+"] "+links[i].title;
          box.appendChild(a);
        }
      }
      $("learn-btn").disabled = false;
      input.focus();
    }

    if(!useWeb){
      done("Turn on Web research.\n\nYou asked: "+msg, [], "");
      return;
    }

    var queries = extractQueries(msg).slice(0,5);
    var jobs = [];
    for(var i=0;i<queries.length;i++){
      jobs.push(wikiOpenSearch(queries[i]).catch(function(){ return []; }));
      jobs.push(wikiFullSearch(queries[i]).catch(function(){ return []; }));
    }

    Promise.all(jobs).then(function(results){
      var hits = mergeHits(results);
      var keyWords = msg.replace(/[^a-zA-Z0-9\s\-']/g," ").split(/\s+/).filter(function(w){
        return w.length>2 && !STOP[w.toLowerCase()];
      });

      if(!hits.length){
        done("Still nothing on Wikipedia for that wording.\n\nTry:\n• Exact book title in quotes: \"The Giver\"\n• Author name + title\n• Main character + book\n\nQueries tried: "+queries.slice(0,4).join(" | "), [], "");
        return null;
      }

      hits.sort(function(a,b){ return scoreHit(b, keyWords) - scoreHit(a, keyWords); });
      var top = hits.slice(0,5);

      var chain = Promise.resolve([]);
      top.forEach(function(h){
        chain = chain.then(function(acc){
          return wikiExtract(h.title).then(function(ex){
            if(ex) acc.push(ex);
            return acc;
          }).catch(function(){ return acc; });
        });
      });
      return chain.then(function(extracts){
        return { extracts: extracts, queries: queries };
      });
    }).then(function(pack){
      if(!pack) return;
      var extracts = pack.extracts;
      if(!extracts || !extracts.length){
        done("Found titles but could not load page text. Try the exact book title in quotes.", [], "");
        return;
      }
      var parts = ["About what you described:", "", "Opened "+extracts.length+" Wikipedia page(s):", ""];
      for(var i=0;i<extracts.length;i++){
        parts.push("["+(i+1)+"] "+extracts[i].title);
        parts.push(extracts[i].extract);
        parts.push("");
      }
      parts.push("Links below open the full pages.");
      done(parts.join("\n"), extracts, extracts.length+" pages");
    }).catch(function(e){
      done("Error: "+e.message+"\nCheck internet and try again.", [], "");
    });
  }

  $("learn-btn").onclick = sendLearn;
  $("learn-in").onkeydown = function(e){
    if(e.key==="Enter"){ e.preventDefault(); sendLearn(); }
  };
})();
