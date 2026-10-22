/* v22 — clean organized homework answers */
SUBJECTS=[
  {id:"english",label:"English / Reading"},
  {id:"math",label:"Math"},
  {id:"science",label:"Science"},
  {id:"social",label:"Social Studies"},
  {id:"history",label:"History"},
  {id:"spanish",label:"Spanish / Language"},
  {id:"general",label:"General"}
];

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
    {keys:/swollen/i, title:"The Swollen Fox"},
    {keys:/honey|flies/i, title:"The Flies and the Honey-Pot"},
    {keys:/golden|hen\s*and/i, title:"The Hen and the Golden Eggs"},
    {keys:/grasshopper|ants?\s*and/i, title:"The Ants and the Grasshopper"},
    {keys:/wolf|sheep/i, title:"The Wolf in Sheep's Clothing"},
    {keys:/woodcutter|wood\s*cutter/i, title:"The Fox and the Woodcutter"},
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
  if(!t){ $("hw-st").textContent="Tap Aesop list or type titles."; $("hw-st").className="status warn"; return; }
  hwQs=parseHomeworkQs(t);
  if(/fable|aesop|fox|ant|grasshopper|wolf|sheep|moral|woodcutter|swollen|flies|honey|hen|golden|miser|story/i.test(t))
    hwSubj="english";
  else if(/\d\s*[+\-×÷=*/]|solve|equation/i.test(t))
    hwSubj="math";
  else if(/cell|atom|planet|force|energy|habitat/i.test(t))
    hwSubj="science";
  else if(/government|map|culture|civil|geography/i.test(t))
    hwSubj="social";
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

function hwGo(){
  var selected=[];
  for(var i=0;i<hwQs.length;i++){
    var cb=$("qq"+i);
    if(cb&&cb.checked) selected.push(hwQs[i]);
  }
  if(!selected.length) selected=hwQs.slice(0,1);
  var lab="General";
  for(var i=0;i<SUBJECTS.length;i++) if(SUBJECTS[i].id===hwSubj) lab=SUBJECTS[i].label;

  var html="";
  html+="<div style='font-size:12px;color:#8e8e8e;margin-bottom:16px'>"+esc(lab)+" · "+esc(modeLabel())+"</div>";

  for(var i=0;i<selected.length;i++){
    var q=selected[i];
    var fable=matchFable(q.text);

    html+="<div style='margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #3a3a3a'>";
    html+="<div style='font-size:15px;font-weight:700;color:#fff;margin-bottom:10px'>"+(i+1)+". "+esc(q.text)+"</div>";

    if(fable){
      if(hwMode!=="solve"){
        html+="<div style='color:#8e8e8e;font-size:11px;font-weight:700;text-transform:uppercase;margin:0 0 6px'>What happened</div>";
        html+="<ul style='margin:0 0 12px 0;padding-left:18px;color:#c8c8c8;font-size:14px;line-height:1.55'>";
        for(var p=0;p<fable.points.length-1;p++){
          html+="<li style='margin-bottom:4px'>"+esc(fable.points[p])+"</li>";
        }
        html+="</ul>";
      }
      html+="<div style='background:#161616;border-left:3px solid #4ade80;border-radius:0 10px 10px 0;padding:12px 14px;margin:8px 0'>";
      html+="<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px'>Answer</div>";
      html+="<div style='font-size:16px;font-weight:700;color:#fff;line-height:1.45'>"+esc(fable.moral)+"</div>";
      html+="</div>";
      html+="<div style='margin-top:8px;font-size:13px;color:#a0a0a0;line-height:1.5'>";
      html+="<span style='color:#8e8e8e'>You can write:</span> ";
      html+="“In <em>"+esc(fable.title)+"</em>, "+esc(fable.moral.toLowerCase())+"”";
      html+="</div>";
    } else {
      html+="<div style='background:#161616;border-left:3px solid #4ade80;border-radius:0 10px 10px 0;padding:12px 14px'>";
      html+="<div style='color:#4ade80;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px'>Answer</div>";
      html+="<div style='color:#fff'>Write 2–4 complete sentences.</div>";
      html+="</div>";
    }
    html+="</div>";
  }

  $("hw-out").innerHTML=html;
  $("hw-out").className="panel show";
  hwStep(4);
}

function hwPhoto(input){
  var f=input.files&&input.files[0]; if(!f) return;
  if(f.type && f.type.indexOf("image")===0){
    try{ $("hw-img").src=URL.createObjectURL(f); $("hw-img").style.display="block"; }catch(e){}
    runOCR(f, function(text){
      if(text){
        var cleaned=typeof cleanOcrHomework==="function"?cleanOcrHomework(text):text;
        var qs=parseHomeworkQs(cleaned);
        var real=qs.filter(function(q){ return /Swollen|Flies|Honey|Hen|Golden|Miser|Woodcutter|Ants|Grasshopper|Wolf|Sheep/i.test(q.text); });
        if(real.length>=2){
          $("hw-text").value=real.map(function(q){return q.text;}).join("\n");
          $("hw-st").textContent="Found "+real.length+" fables. Continue.";
          $("hw-st").className="status ok";
        } else {
          $("hw-text").value="";
          $("hw-st").textContent="Photo unclear. Tap Use Aesop list.";
          $("hw-st").className="status warn";
        }
      }
    }, $("hw-st"));
  }
}
