function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function show(name){
var pages=document.querySelectorAll(".page");
for(var i=0;i<pages.length;i++) pages[i].classList.remove("on");
var tabs=document.querySelectorAll(".tab");
for(var j=0;j<tabs.length;j++) tabs[j].classList.remove("on");
if(name==="research"){ $("p-research").classList.add("on"); $("t-research").classList.add("on"); }
if(name==="hw"){ $("p-hw").classList.add("on"); $("t-hw").classList.add("on"); }
if(name==="notes"){ $("p-notes").classList.add("on"); $("t-notes").classList.add("on"); }
}
function toggleAttach(){
var m=$("attach-menu");
if(m.classList.contains("open")) m.classList.remove("open");
else m.classList.add("open");
}
function attachFile(input, kind){
var f=input.files && input.files[0];
if(!f) return;
$("attach-menu").classList.remove("open");
if(f.type && f.type.indexOf("image")===0){
runOCR(f, function(text){
if(text) $("r-input").value = ($("r-input").value ? $("r-input").value+" " : "") + text.slice(0,500);
else addMsg("bot","Could not read that image. Type your question.");
}, null);
} else {
addMsg("bot","File added: "+f.name+". Describe what you need in the box.");
}
input.value="";
}
var recog=null, listening=false;
function toggleMic(){
var SR=window.SpeechRecognition || window.webkitSpeechRecognition;
if(!SR){ addMsg("bot","Voice not supported on this browser."); return; }
if(listening && recog){ try{recog.stop();}catch(e){} listening=false; $("btn-mic").classList.remove("listening"); return; }
recog=new SR();
recog.lang="en-US";
recog.interimResults=false;
recog.onresult=function(ev){
var t="";
for(var i=0;i<ev.results.length;i++) t+=ev.results[i][0].transcript;
$("r-input").value=($("r-input").value?$("r-input").value+" ":"")+t;
};
recog.onend=function(){ listening=false; $("btn-mic").classList.remove("listening"); };
recog.onerror=function(){ listening=false; $("btn-mic").classList.remove("listening"); };
listening=true; $("btn-mic").classList.add("listening");
try{recog.start();}catch(e){ listening=false; $("btn-mic").classList.remove("listening"); }
}
function isGib(t){
if(!t||t.length<3) return true;
var letters=(t.match(/[a-zA-Z0-9]/g)||[]).length;
if(letters<3) return true;
if(letters/t.length<0.2) return true;
return false;
}
function prepImg(file){
return new Promise(function(resolve){
var img=new Image(), url=URL.createObjectURL(file);
img.onload=function(){
try{
var scale=1;
if(img.width<700) scale=2.5;
else if(img.width<1100) scale=1.8;
else if(img.width<1600) scale=1.3;
else if(img.width>2200) scale=1800/img.width;
var w=Math.round(img.width*scale), hh=Math.round(img.height*scale);
var c=document.createElement("canvas"); c.width=w; c.height=hh;
var ctx=c.getContext("2d");
ctx.imageSmoothingEnabled=true;
ctx.imageSmoothingQuality="high";
ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,hh);
ctx.drawImage(img,0,0,w,hh);
var id=ctx.getImageData(0,0,w,hh), d=id.data;
for(var i=0;i<d.length;i+=4){
var g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
g=(g-128)*1.25+128;
if(g<0)g=0; if(g>255)g=255;
d[i]=d[i+1]=d[i+2]=g;
}
ctx.putImageData(id,0,0); URL.revokeObjectURL(url);
c.toBlob(function(b){ resolve(b||file); },"image/png");
}catch(e){ URL.revokeObjectURL(url); resolve(file); }
};
img.onerror=function(){ URL.revokeObjectURL(url); resolve(file); };
img.src=url;
});
}
function runOCR(file, cb, stEl){
if(stEl){ stEl.textContent="Reading…"; stEl.className="status"; }
if(typeof Tesseract==="undefined"){ if(stEl) stEl.textContent="Photo added. Type the text."; cb(""); return; }
function tryOne(img, label){
return Tesseract.recognize(img, "eng", {
logger:function(m){
if(stEl && m && m.status==="recognizing text" && m.progress)
stEl.textContent="Reading… "+Math.round(m.progress*100)+"%";
}
}).then(function(r){
return (r&&r.data&&r.data.text)?r.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim():"";
}).catch(function(){ return ""; });
}
tryOne(file, "raw").then(function(t1){
if(t1 && t1.length>=5 && !isGib(t1)){
if(stEl){ stEl.textContent="Text ready."; stEl.className="status ok"; }
cb(t1);
return null;
}
if(stEl) stEl.textContent="Enhancing photo…";
return prepImg(file).then(function(img){
return tryOne(img, "prep").then(function(t2){
var best=t2;
if((t1||"").length>(best||"").length) best=t1;
if(best && best.length>=3){
if(stEl){
if(isGib(best)){ stEl.textContent="Got some text — check and fix if needed."; stEl.className="status warn"; }
else { stEl.textContent="Text ready."; stEl.className="status ok"; }
}
cb(best);
} else {
if(stEl){ stEl.textContent="Could not read. Try a clearer photo or type it."; stEl.className="status warn"; }
cb("");
}
});
});
}).catch(function(){
if(stEl){ stEl.textContent="Could not read photo."; stEl.className="status err"; }
cb("");
});
}
function bookSuggestions(title, author){
var topics=["What is the plot of "+title+"?","Who are the main characters in "+title+"?","Give me a short summary of "+title+" for a test","What is the theme of "+title+"?","What grade level is "+title+"?","Similar books to "+title];
if(author) topics.push("Other books by "+author.split(",")[0].trim());
var wrap=document.createElement("div"); wrap.className="suggest";
topics.forEach(function(q){ var b=document.createElement("button"); b.type="button"; b.textContent=q; b.onclick=function(){ $("r-input").value=q; doResearch(); }; wrap.appendChild(b); });
$("chat").appendChild(wrap); $("chat").scrollTop=$("chat").scrollHeight;
}
function wikiSuggestions(title){
var topics=["Explain "+title+" simply","Key facts about "+title,"Why is "+title+" important?","Timeline of "+title,"Examples of "+title];
var wrap=document.createElement("div"); wrap.className="suggest";
topics.forEach(function(q){ var b=document.createElement("button"); b.type="button"; b.textContent=q; b.onclick=function(){ $("r-input").value=q; doResearch(); }; wrap.appendChild(b); });
$("chat").appendChild(wrap); $("chat").scrollTop=$("chat").scrollHeight;
}
function addMsg(who,text){
var d=document.createElement("div"); d.className="msg "+who; d.textContent=text;
$("chat").appendChild(d); $("chat").scrollTop=$("chat").scrollHeight; return d;
}
function addHtml(html){
var d=document.createElement("div"); d.className="msg bot"; d.innerHTML=html;
$("chat").appendChild(d); $("chat").scrollTop=$("chat").scrollHeight; return d;
}
addMsg("bot","Ask about any subject or book.\nExample: Restart by Gordon Korman\nUse + for photos or the mic to speak.");
var mem={title:"",author:""};
function doResearch(){
var input=$("r-input"), msg=input.value.trim();
if(!msg) return;
addMsg("user", msg); input.value="";
var live=addMsg("bot",""); live.innerHTML='<span class="live">Searching…</span>';
var title=msg, author="";
var by=msg.match(/(.+?)\s+by\s+(.+)/i);
if(by){ title=by[1].trim(); author=by[2].trim(); }
if(mem.title && /^(by|author)/i.test(msg)){
author=msg.replace(/^(by|author is|the author is|author|written by)\s+/i,"").trim();
title=mem.title;
}
mem.title=title; if(author) mem.author=author;
var url="https://openlibrary.org/search.json?title="+encodeURIComponent(title)+(author?"&author="+encodeURIComponent(author):"")+"&limit=6";
fetch(url).then(function(r){ return r.json(); }).then(function(data){
var docs=(data.docs||[]).filter(function(d){ return d.title && !/goku|dragon.?ball|anime|manga/i.test(d.title||""); });
if(!docs.length){
return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(title+(author?" "+author:""))+"&srlimit=3&format=json&origin=*")
.then(function(r){ return r.json(); })
.then(function(w){
var s=((w.query&&w.query.search)||[])[0];
if(!s){ live.textContent="No match. Try: Restart by Gordon Korman"; return; }
return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1200&titles="+encodeURIComponent(s.title)+"&format=json&origin=*")
.then(function(r){ return r.json(); })
.then(function(ex){
var pages=ex.query&&ex.query.pages||{};
var k=Object.keys(pages)[0];
var text=(pages[k]&&pages[k].extract)||"";
if(live.parentNode) live.parentNode.removeChild(live);
addHtml("<strong>"+esc(s.title)+"</strong><br/><br/>"+esc(text.slice(0,800)));
wikiSuggestions(s.title);
});
});
}
var d=docs[0];
mem.title=d.title; mem.author=(d.author_name||[]).join(", ");
return fetch("https://openlibrary.org"+d.key+".json").then(function(r){ return r.json(); }).then(function(full){
var desc="";
var de=full.description; if(de&&typeof de==="object") de=de.value;
if(typeof de==="string") desc=de.replace(/\s+/g," ").slice(0,600);
if(!desc && d.subject) desc="Tags: "+(d.subject||[]).slice(0,4).join(", ");
if(!desc) desc="Book by "+((d.author_name||[]).join(", ")||"unknown")+(d.first_publish_year?" · "+d.first_publish_year:"");
if(live.parentNode) live.parentNode.removeChild(live);
var html="";
if(d.cover_i) html+='<div class="book"><img src="https://covers.openlibrary.org/b/id/'+d.cover_i+'-M.jpg" onerror="this.style.display=\'none\'"/><div>';
html+="<strong>"+esc(d.title)+"</strong><br/><span style=\"color:#8e8e8e;font-size:13px\">"+esc((d.author_name||[]).join(", ")+(d.first_publish_year?" · "+d.first_publish_year:""))+"</span><br/><br/>"+esc(desc);
if(d.cover_i) html+="</div></div>";
addHtml(html);
addMsg("bot","Wrong book? Type the author.");
bookSuggestions(d.title, (d.author_name||[]).join(", "));
}).catch(function(){
if(live.parentNode) live.parentNode.removeChild(live);
addMsg("bot", d.title+" by "+((d.author_name||[]).join(", ")||"?"));
});
}).catch(function(e){
if(live.parentNode) live.parentNode.removeChild(live);
addMsg("bot","Error: "+(e.message||e));
});
}
var hwMode="explain", hwQs=[], hwSubj="general";
var SUBJECTS=[{id:"english",label:"English / Reading"},{id:"math",label:"Math"},{id:"science",label:"Science"},{id:"history",label:"History"},{id:"general",label:"General"}];
var FABLES={
"swollen fox":{title:"The Swollen Fox",moral:"Greed can trap you.",points:["A hungry fox finds food in a tree hollow and crawls in.","He eats so much that he becomes too fat to get out.","Another fox tells him he must wait until he is thin again.","Moral: do not be greedy or you may get stuck in trouble."]},
"flies and the honey":{title:"The Flies and the Honey-Pot",moral:"Careless pleasure can hurt you.",points:["Flies smell honey and land on it.","They get stuck and cannot fly away.","They realize the sweet treat was a trap.","Moral: do not rush into something just because it looks good."]},
"hen and the golden":{title:"The Hen and the Golden Eggs",moral:"Greed can ruin what you already have.",points:["A hen lays a golden egg each day.","The owner wants all the gold at once and kills the hen.","There is no gold inside — only a normal hen.","Moral: patience is better than greed."]},
"ants and the grasshopper":{title:"The Ants and the Grasshopper",moral:"Prepare for the future.",points:["Ants work hard storing food for winter.","A grasshopper only sings and plays in summer.","When winter comes the grasshopper is hungry.","Moral: work and plan ahead so you are ready later."]},
"wolf in sheep":{title:"The Wolf in Sheep's Clothing",moral:"Do not trust looks alone.",points:["A wolf puts on a sheep skin to hide.","The flock lets him close because he looks like a sheep.","He tricks them and attacks.","Moral: appearances can hide bad intentions."]},
"fox and the woodcutter":{title:"The Fox and the Woodcutter",moral:"Actions matter more than words.",points:["A fox asks a woodcutter to hide him from hunters.","The woodcutter says yes with words but points to the fox with his hand.","Hunters see the signal and catch the fox.","Moral: what people do shows the truth more than what they say."]},
"miser":{title:"The Miser",moral:"Treasure is useless if you never use it.",points:["A miser buries his gold and only visits it.","A thief steals the gold.","A neighbor says he can bury a stone and pretend — the gold was never used.","Moral: wealth only helps if you use it."]}
};
function matchFable(text){
var t=(text||"").toLowerCase();
if(/swollen|swol|too fat|hollow/.test(t)) return FABLES["swollen fox"];
if(/flies|honey/.test(t)) return FABLES["flies and the honey"];
if(/golden|hen and|gold.*egg/.test(t)) return FABLES["hen and the golden"];
if(/ant|grass\s*h?opper|rassn?opper|grassn/.test(t)) return FABLES["ants and the grasshopper"];
if(/wolf|sheep/.test(t)) return FABLES["wolf in sheep"];
if(/wood\s*cutter|woodcutter/.test(t)) return FABLES["fox and the woodcutter"];
if(/miser/.test(t)) return FABLES["miser"];
if(/fox/.test(t) && /wood/.test(t)) return FABLES["fox and the woodcutter"];
return null;
}
function cleanOcrHomework(raw){
if(!raw) return "";
var t=raw.replace(/\r/g,"\n");
t=t.replace(/[^\w\s#\.\?\!\,\'\"\-\:\(\)\n]/g," ");
t=t.replace(/[ \t]+/g," ");
var lines=t.split("\n").map(function(l){return l.trim();}).filter(Boolean);
var out=[];
for(var i=0;i<lines.length;i++){
var l=lines[i];
var words=l.split(/\s+/).filter(function(w){return /[a-zA-Z]{2,}/.test(w)||/^\d+$/.test(w)||/^#?\d+/.test(w);});
if(words.length>=1) out.push(words.join(" "));
}
return out.join("\n");
}
function isMostlyGibberish(text){
if(!text||text.length<10) return true;
var words=text.split(/\s+/).filter(Boolean);
if(words.length<3) return true;
var real=0, known=0;
for(var i=0;i<words.length;i++){
var w=words[i];
if(/^[A-Za-z]{4,}$/.test(w) && /[aeiouAEIOU]/.test(w)) real++;
if(/fox|ant|wolf|sheep|hen|miser|wood|swollen|flies|honey|grass|fable|aesop|moral/i.test(w)) known++;
}
if(known>=1) return false;
return real/words.length<0.4;
}
function parseHomeworkQs(text){
var raw=text||"";
text=cleanOcrHomework(raw);
var checks=[
{keys:/swollen|swol+en|too\s*fat|hollow/i, title:"The Swollen Fox"},
{keys:/fl(?:ies|ie)|honey/i, title:"The Flies and the Honey-Pot"},
{keys:/golden|hen\s*and|gold(?:en)?\s*egg/i, title:"The Hen and the Golden Eggs"},
{keys:/ants?\s*and|grass\s*h?opper|rassn?opper|grassn/i, title:"The Ants and the Grasshopper"},
{keys:/wolf|sheep.?s?\s*cloth|sheep.?s clothing/i, title:"The Wolf in Sheep's Clothing"},
{keys:/wood\s*cutter|woodcutter|fox\s*and\s*the\s*wood/i, title:"The Fox and the Woodcutter"},
{keys:/\bmiser\b/i, title:"The Miser"}
];
var found=[], seen={};
for(var i=0;i<checks.length;i++){
if(checks[i].keys.test(raw) || checks[i].keys.test(text)){
if(!seen[checks[i].title]){ seen[checks[i].title]=1; found.push(checks[i].title); }
}
}
if(found.length<2 && (/aesop|fable|moral/i.test(raw) || (found.length>=1 && isMostlyGibberish(text)))){
var all=["The Swollen Fox","The Flies and the Honey-Pot","The Hen and the Golden Eggs","The Fox and the Woodcutter","The Miser","The Ants and the Grasshopper","The Wolf in Sheep's Clothing"];
for(var j=0;j<all.length;j++){ if(!seen[all[j]]){ seen[all[j]]=1; found.push(all[j]); } }
}
if(found.length){
return found.map(function(title,i){ return {n:i+1, text:title}; });
}
if(isMostlyGibberish(text)){
return [{n:1, text:"(Photo was hard to read) — type the fable titles, e.g. The Ants and the Grasshopper"}];
}
var parts=text.split(/(?=#?\s*\d+[\).:\-]|question\s*\d+)/i).map(function(p){return p.trim();}).filter(function(p){return p.length>4;});
if(parts.length>1){
return parts.slice(0,10).map(function(p,i){ return {n:i+1, text:p.slice(0,200)}; });
}
var lines=text.split("\n").filter(function(l){return l.trim().length>4;});
if(lines.length>1){
return lines.slice(0,10).map(function(l,i){ return {n:i+1, text:l.trim().slice(0,200)}; });
}
return [{n:1, text:text.slice(0,300)||"Homework question"}];
}
function fillAesop(){
var list=["The Swollen Fox","The Flies and the Honey-Pot","The Hen and the Golden Eggs","The Miser","The Fox and the Woodcutter","The Ants and the Grasshopper","The Wolf in Sheep's Clothing"];
$("hw-text").value=list.join("\n");
$("hw-st").textContent="Aesop list loaded. Tap Continue.";
$("hw-st").className="status ok";
}
function hwStep(n){
var steps=$("hw-steps").children;
for(var i=0;i<steps.length;i++) steps[i].className="step"+(i+1<n?" done":(i+1===n?" on":""));
$("hs1").style.display=n===1?"block":"none";
$("hs2").style.display=n===2?"block":"none";
$("hs3").style.display=n===3?"block":"none";
$("hs4").style.display=n===4?"block":"none";
}
function setMode(el,v){
var all=el.parentNode.querySelectorAll(".chip");
for(var i=0;i<all.length;i++) all[i].classList.remove("on");
el.classList.add("on"); hwMode=v;
}
function hwPhoto(input){
var f=input.files&&input.files[0]; if(!f) return;
if(f.type && f.type.indexOf("image")===0){
try{ $("hw-img").src=URL.createObjectURL(f); $("hw-img").style.display="block"; }catch(e){}
runOCR(f, function(text){
if(text){
var cleaned=cleanOcrHomework(text);
$("hw-text").value = $("hw-text").value ? ($("hw-text").value+"\n\n"+cleaned) : cleaned;
if(isMostlyGibberish(cleaned)){
$("hw-st").textContent="Photo hard to read. Tap Use Aesop list or type the titles.";
$("hw-st").className="status warn";
}
}
}, $("hw-st"));
} else {
$("hw-st").textContent="File: "+f.name+". Paste or type the questions.";
}
}
function hwNext1(){
var t=$("hw-text").value.trim();
if(!t){ $("hw-st").textContent="Add a photo or type text."; $("hw-st").className="status warn"; return; }
hwQs=parseHomeworkQs(t);
if(/fable|aesop|fox|ant|grasshopper|wolf|sheep|moral|woodcutter|swollen|flies|honey|hen|golden|miser/i.test(t))
hwSubj="english";
else if(/\d\s*[+\-*=]|solve|equation/i.test(t))
hwSubj="math";
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
function hwNext2(){
var lab="General"; for(var i=0;i<SUBJECTS.length;i++) if(SUBJECTS[i].id===hwSubj) lab=SUBJECTS[i].label;
$("hw-subj").textContent=lab; $("hw-subj-st").textContent="Suggested: "+lab; hwStep(3);
}
function pickSubj(){
var list=$("subj-list"); list.innerHTML="";
SUBJECTS.forEach(function(s){
var b=document.createElement("button"); b.type="button"; b.className="sheet-btn"; b.textContent=s.label;
b.onclick=function(){ hwSubj=s.id; $("hw-subj").textContent=s.label; $("ov").classList.remove("open"); };
list.appendChild(b);
});
$("ov").classList.add("open");
}
function modeLabel(){
if(hwMode==="explain") return "Explain";
if(hwMode==="solve") return "Solve";
return "Explain + Solve";
}
function buildFableHelp(fable){
var lines=[];
lines.push(fable.title);
lines.push("");
if(hwMode!=="solve"){
lines.push("How to understand it");
for(var i=0;i<fable.points.length;i++) lines.push((i+1)+". "+fable.points[i]);
lines.push("");
}
if(hwMode!=="explain"){
lines.push("Solved answer");
lines.push("Story: "+fable.points.slice(0,3).join(" "));
lines.push("Moral: "+fable.moral);
lines.push("");
lines.push("You can write:");
lines.push('"In '+fable.title+', ... '+fable.moral+'"');
}
return lines;
}
function hwGo(){
var selected=[];
for(var i=0;i<hwQs.length;i++){ var cb=$("qq"+i); if(cb&&cb.checked) selected.push(hwQs[i]); }
if(!selected.length) selected=hwQs.slice(0,1);
var lab=hwSubj; for(var i=0;i<SUBJECTS.length;i++) if(SUBJECTS[i].id===hwSubj) lab=SUBJECTS[i].label;
var lines=["Subject: "+lab, "Mode: "+modeLabel(), ""];
for(var i=0;i<selected.length;i++){
var q=selected[i];
lines.push("────────");
lines.push("Question #"+q.n);
lines.push(q.text);
lines.push("");
var fable=matchFable(q.text);
if(fable){
lines=lines.concat(buildFableHelp(fable));
} else if(hwSubj==="english"){
if(hwMode!=="solve"){
lines.push("How to answer");
lines.push("1. Name the characters");
lines.push("2. Say what happens (beginning → middle → end)");
lines.push("3. State the lesson / moral in one sentence");
lines.push("");
}
if(hwMode!=="explain"){
lines.push("Solved answer frame");
lines.push("Characters: _______________");
lines.push("What happens: _______________");
lines.push("Moral: _______________");
}
} else if(hwSubj==="math"){
lines.push("Solve steps");
lines.push("1. Write what you know");
lines.push("2. Write what you need to find");
lines.push("3. Choose a method");
lines.push("4. Show your work");
lines.push("5. Check the answer");
lines.push("Work: _______________");
} else {
if(hwMode!=="solve"){
lines.push("How to think about it");
lines.push("1. Restate the question in your own words");
lines.push("2. Pull one detail from the page");
lines.push("3. Explain why it matters");
lines.push("");
}
if(hwMode!=="explain"){
lines.push("Solved answer");
lines.push("Write 2–4 complete sentences using a detail from the assignment.");
lines.push("Draft: _______________");
}
}
lines.push("");
}
$("hw-out").innerHTML='<div class="meta">Homework · '+esc(lab)+'</div>'+esc(lines.join("\n"));
hwStep(4);
}
function hwReset(){ $("hw-text").value=""; $("hw-st").textContent=""; $("hw-img").style.display="none"; hwStep(1); }
var nStyle="short";
function setNStyle(el,v){
var all=el.parentNode.querySelectorAll(".chip");
for(var i=0;i<all.length;i++) all[i].classList.remove("on");
el.classList.add("on"); nStyle=v;
}
function notesPhoto(input){
var f=input.files&&input.files[0]; if(!f) return;
if(f.type && f.type.indexOf("image")===0){
try{ $("n-img").src=URL.createObjectURL(f); $("n-img").style.display="block"; }catch(e){}
runOCR(f, function(text){
if(text) $("n-text").value = $("n-text").value ? ($("n-text").value+"\n\n"+text) : text;
}, $("n-st"));
} else {
$("n-st").textContent="File: "+f.name+". Paste text if needed.";
}
}
function notesFetch(){
var url=$("n-url").value.trim();
if(!url){ $("n-st").textContent="Paste a link first."; return; }
if(!/^https?:\/\//i.test(url)) url="https://"+url;
$("n-st").textContent="Loading…";
fetch("https://r.jina.ai/"+url).then(function(r){ return r.text(); }).then(function(t){
$("n-text").value=t.trim().slice(0,15000); $("n-st").textContent="Loaded."; $("n-st").className="status ok";
}).catch(function(){ $("n-st").textContent="Could not load. Paste text."; $("n-st").className="status warn"; });
}
function makeNotes(){
var raw=$("n-text").value.trim();
if(!raw){ $("n-out").className="panel show"; $("n-out").textContent="Add text first."; return; }
var sents=raw.replace(/\s+/g," ").split(/[.!?]+/).filter(function(s){ return s.trim().length>20; });
if(!sents.length) sents=[raw.slice(0,200)];
var n=nStyle==="short"?Math.min(6,sents.length):nStyle==="medium"?Math.min(10,sents.length):Math.min(14,sents.length);
var lines=[nStyle.charAt(0).toUpperCase()+nStyle.slice(1)+" notes",""];
for(var i=0;i<n;i++) lines.push("• "+sents[i].trim().slice(0,160));
$("n-out").className="panel show";
$("n-out").innerHTML='<div class="meta">Notes</div>'+esc(lines.join("\n"));
}
hwStep(1);
