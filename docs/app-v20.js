/* v21 patch */
SUBJECTS=[{id:"english",label:"English / Reading"},{id:"math",label:"Math"},{id:"science",label:"Science"},{id:"social",label:"Social Studies"},{id:"history",label:"History"},{id:"spanish",label:"Spanish / Language"},{id:"general",label:"General"}];

function parseHomeworkQs(text){
  var raw=text||"";
  var knownTitles=[
    "The Swollen Fox","The Flies and the Honey-Pot","The Flies and the Honey",
    "The Hen and the Golden Eggs","The Miser","The Fox and the Woodcutter",
    "The Ants and the Grasshopper","The Wolf in Sheep's Clothing"
  ];
  var found=[], seen={};
  var lines=raw.split(/\n/);
  for(var i=0;i<lines.length;i++){
    var line=lines[i].replace(/^\s*#?\d+[\).:\-]\s*/,"").trim();
    if(line.length<5||line.length>90) continue;
    for(var k=0;k<knownTitles.length;k++){
      var kt=knownTitles[k];
      if(line.toLowerCase()===kt.toLowerCase() || (line.length<60 && line.toLowerCase().indexOf(kt.toLowerCase())>=0)){
        var title=kt==="The Flies and the Honey"?"The Flies and the Honey-Pot":kt;
        if(!seen[title]){ seen[title]=1; found.push(title); }
      }
    }
  }
  if(found.length>=1){
    return found.map(function(title,i){ return {n:i+1, text:title}; });
  }
  var checks=[
    {keys:/swollen|swol+en/i, title:"The Swollen Fox"},
    {keys:/honey|flies/i, title:"The Flies and the Honey-Pot"},
    {keys:/golden|hen\s*and/i, title:"The Hen and the Golden Eggs"},
    {keys:/grass\s*h?opper|ants?\s*and/i, title:"The Ants and the Grasshopper"},
    {keys:/wolf|sheep/i, title:"The Wolf in Sheep's Clothing"},
    {keys:/wood\s*cutter|woodcutter/i, title:"The Fox and the Woodcutter"},
    {keys:/miser/i, title:"The Miser"}
  ];
  for(var i=0;i<checks.length;i++){
    if(checks[i].keys.test(raw) && !seen[checks[i].title]){
      seen[checks[i].title]=1; found.push(checks[i].title);
    }
  }
  if(found.length) return found.map(function(title,i){ return {n:i+1, text:title}; });
  return [{n:1, text:"(Hard to read) — tap Use Aesop list"}];
}

function fillAesop(){
  var list=["The Swollen Fox","The Flies and the Honey-Pot","The Hen and the Golden Eggs","The Miser","The Fox and the Woodcutter","The Ants and the Grasshopper","The Wolf in Sheep's Clothing"];
  $("hw-text").value=list.join("\n");
  $("hw-st").textContent="Aesop list loaded. Tap Continue.";
  $("hw-st").className="status ok";
}

function hwNext1(){
  var t=$("hw-text").value.trim();
  if(!t){ $("hw-st").textContent="Add text or tap Aesop list."; $("hw-st").className="status warn"; return; }
  hwQs=parseHomeworkQs(t);
  if(/fable|aesop|fox|ant|grasshopper|wolf|sheep|moral|woodcutter|swollen|flies|honey|hen|golden|miser|story|theme/i.test(t))
    hwSubj="english";
  else if(/\d\s*[+\-×÷=*/]|solve|equation|fraction/i.test(t))
    hwSubj="math";
  else if(/cell|atom|planet|force|energy|habitat|ecosystem/i.test(t))
    hwSubj="science";
  else if(/government|constitution|map|culture|civil|colony|geography/i.test(t))
    hwSubj="social";
  else if(/history|president|ancient|egypt|rome/i.test(t))
    hwSubj="history";
  else
    hwSubj="general";
  var box=$("hw-qs"); box.innerHTML="";
  for(var i=0;i<hwQs.length;i++){
    var d=document.createElement("div"); d.className="qitem";
    d.innerHTML='<input type="checkbox" id="qq'+i+'" checked/><label for="qq'+i+'"><strong>#'+hwQs[i].n+'</strong> — '+esc(hwQs[i].text)+'</label>';
    box.appendChild(d);
  }
  hwStep(2);
}

function buildFableHelp(fable){
  var html = "";
  html += "<div style='margin:12px 0 4px;font-size:16px;font-weight:700;color:#fff'>" + esc(fable.title) + "</div>";
  if(hwMode !== "solve"){
    html += "<div style='color:#8e8e8e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 6px'>Story</div>";
    html += "<ol style='margin:0 0 10px 18px;padding:0;color:#d4d4d4;font-size:14px;line-height:1.5'>";
    for(var i=0;i<fable.points.length;i++){
      html += "<li style='margin-bottom:4px'>" + esc(fable.points[i]) + "</li>";
    }
    html += "</ol>";
  }
  if(hwMode !== "explain"){
    html += "<div style='background:#1a1a1a;border:1px solid #4ade80;border-radius:12px;padding:14px;margin:10px 0'>";
    html += "<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px'>Answer</div>";
    html += "<div style='font-size:16px;line-height:1.55;color:#fff'><strong>" + esc(fable.moral) + "</strong></div>";
    html += "<div style='margin-top:10px;font-size:14px;color:#d4d4d4;line-height:1.5'>You can write: <em>\"In " + esc(fable.title) + ", " + esc(fable.moral.toLowerCase()) + "\"</em></div>";
    html += "</div>";
  }
  return html;
}

function hwGo(){
  var selected=[];
  for(var i=0;i<hwQs.length;i++){ var cb=$("qq"+i); if(cb&&cb.checked) selected.push(hwQs[i]); }
  if(!selected.length) selected=hwQs.slice(0,1);
  var lab=hwSubj; for(var i=0;i<SUBJECTS.length;i++) if(SUBJECTS[i].id===hwSubj) lab=SUBJECTS[i].label;
  var html = "<div class='meta'>Homework · " + esc(lab) + " · " + esc(modeLabel()) + "</div>";
  for(var i=0;i<selected.length;i++){
    var q=selected[i];
    var fable=matchFable(q.text);
    html += "<div style='border-top:1px solid #3a3a3a;margin-top:14px;padding-top:12px'>";
    html += "<div style='font-size:12px;color:#8e8e8e;margin-bottom:4px'>Question #" + q.n + "</div>";
    html += "<div style='font-weight:600;margin-bottom:8px'>" + esc(q.text) + "</div>";
    if(fable){
      html += buildFableHelp(fable);
    } else if(hwSubj==="english"){
      html += "<div style='background:#1a1a1a;border-radius:12px;padding:14px;margin-top:8px'>";
      html += "<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px'>Answer frame</div>";
      html += "<div><strong>Characters:</strong> _______________</div>";
      html += "<div style='margin-top:6px'><strong>What happens:</strong> _______________</div>";
      html += "<div style='margin-top:6px'><strong>Moral:</strong> _______________</div>";
      html += "</div>";
    } else if(hwSubj==="math"){
      html += "<div style='background:#1a1a1a;border-radius:12px;padding:14px;margin-top:8px'>";
      html += "<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px'>Solve</div>";
      html += "<div>1. What you know<br>2. What to find<br>3. Show work<br>4. Check</div>";
      html += "<div style='margin-top:10px'><strong>Final answer:</strong> _______________</div>";
      html += "</div>";
    } else {
      html += "<div style='background:#1a1a1a;border-radius:12px;padding:14px;margin-top:8px'>";
      html += "<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px'>Answer</div>";
      html += "<div>Write 2–4 complete sentences using a detail from the page.</div>";
      html += "</div>";
    }
    html += "</div>";
  }
  $("hw-out").innerHTML = html;
  hwStep(4);
}

function hwPhoto(input){
  var f=input.files&&input.files[0]; if(!f) return;
  if(f.type && f.type.indexOf("image")===0){
    try{ $("hw-img").src=URL.createObjectURL(f); $("hw-img").style.display="block"; }catch(e){}
    runOCR(f, function(text){
      if(text){
        var cleaned=cleanOcrHomework(text);
        var qs=parseHomeworkQs(cleaned);
        var realTitles=qs.filter(function(q){ return /Swollen|Flies|Honey|Hen|Golden|Miser|Woodcutter|Ants|Grasshopper|Wolf|Sheep/i.test(q.text); });
        if(realTitles.length>=2){
          $("hw-text").value = realTitles.map(function(q){ return q.text; }).join("\n");
          $("hw-st").textContent = "Found " + realTitles.length + " fables. Check, then Continue.";
          $("hw-st").className = "status ok";
        } else if(typeof isMostlyGibberish==="function" && isMostlyGibberish(cleaned)){
          $("hw-text").value = "";
          $("hw-st").textContent = "Photo too unclear. Tap Use Aesop list.";
          $("hw-st").className = "status warn";
        } else {
          $("hw-text").value = cleaned;
        }
      }
    }, $("hw-st"));
  } else {
    $("hw-st").textContent="File: "+f.name+". Type the questions.";
  }
}
