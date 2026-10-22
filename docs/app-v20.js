/* v20 patch — clean title parsing (loaded after app-v19.js) */
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
  return [{n:1, text:"(Hard to read) — tap Use Aesop list or type only the titles"}];
}

function fillAesop(){
  var list=["The Swollen Fox","The Flies and the Honey-Pot","The Hen and the Golden Eggs","The Miser","The Fox and the Woodcutter","The Ants and the Grasshopper","The Wolf in Sheep's Clothing"];
  $("hw-text").value=list.join("\n");
  $("hw-st").textContent="Aesop list loaded — only clean titles. Tap Continue.";
  $("hw-st").className="status ok";
}

function hwNext1(){
  var t=$("hw-text").value.trim();
  if(!t){ $("hw-st").textContent="Add a photo or type text."; $("hw-st").className="status warn"; return; }
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
