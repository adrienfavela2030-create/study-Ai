(function(){
"use strict";
function el(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function on(id,ev,fn){var n=el(id);if(n)n.addEventListener(ev,fn);}
function go(name){
var map={home:"pg-home",hw:"pg-hw",notes:"pg-notes",research:"pg-research"};
var navMap={home:"nav-home",hw:"nav-hw",notes:"nav-notes",research:"nav-research"};
var screens=document.querySelectorAll(".screen");
for(var i=0;i<screens.length;i++)screens[i].classList.remove("on");
var s=el(map[name]);if(s)s.classList.add("on");
var navs=document.querySelectorAll(".nav button");
for(var j=0;j<navs.length;j++)navs[j].classList.remove("on");
var nb=el(navMap[name]);if(nb)nb.classList.add("on");
}
on("nav-home","click",function(){go("home");});
on("nav-hw","click",function(){go("hw");});
on("nav-notes","click",function(){go("notes");});
on("nav-research","click",function(){go("research");});
on("go-hw","click",function(){go("hw");});
on("go-notes","click",function(){go("notes");});
on("go-research","click",function(){go("research");});
function chips(cid,cb){
var root=el(cid);if(!root)return;
root.addEventListener("click",function(e){
var t=e.target;if(!t.classList||!t.classList.contains("chip"))return;
var all=root.querySelectorAll(".chip");
for(var i=0;i<all.length;i++)all[i].classList.remove("on");
t.classList.add("on");cb(t.getAttribute("data-v"));
});
}
function isGib(t){
if(!t||t.length<8)return true;
var letters=(t.match(/[a-zA-Z]/g)||[]).length;
if(letters/t.length<0.4)return true;
var words=t.split(/\s+/).filter(Boolean);
if(words.length<3)return true;
var weird=0,singles=0;
for(var i=0;i<words.length;i++){
var w=words[i];
if(w.length===1&&!/[aAI]/.test(w))singles++;
if(w.length>=3&&!/[aeiouAEIOU]/.test(w)&&/[a-zA-Z]{3,}/.test(w))weird++;
}
return weird/words.length>0.35||singles/words.length>0.3;
}
function prep(file){
return new Promise(function(resolve){
var img=new Image(),url=URL.createObjectURL(file);
img.onload=function(){
try{
var maxW=1600,scale=img.width>maxW?maxW/img.width:(img.width<600?2:1.2);
var w=Math.round(img.width*scale),h=Math.round(img.height*scale);
var c=document.createElement("canvas");c.width=w;c.height=h;
var ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
var id=ctx.getImageData(0,0,w,h),d=id.data;
for(var i=0;i<d.length;i+=4){
var g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];g=(g-128)*1.35+128;
if(g<0)g=0;if(g>255)g=255;if(g>200)g=255;else if(g<90)g=0;
d[i]=d[i+1]=d[i+2]=g;
}
ctx.putImageData(id,0,0);URL.revokeObjectURL(url);
c.toBlob(function(b){resolve(b||file);},"image/png");
}catch(e){URL.revokeObjectURL(url);resolve(file);}
};
img.onerror=function(){URL.revokeObjectURL(url);resolve(file);};
img.src=url;
});
}
function ocr(file,st,textEl,imgEl){
if(imgEl){try{imgEl.src=URL.createObjectURL(file);imgEl.style.display="block";}catch(e){}}
st.textContent="Reading photo…";st.className="st";
if(typeof Tesseract==="undefined"){st.textContent="Photo added. Type the text below.";return;}
prep(file).then(function(img){
return Tesseract.recognize(img,"eng",{logger:function(m){
if(m&&m.status==="recognizing text"&&m.progress)st.textContent="Reading… "+Math.round(m.progress*100)+"%";
}});
}).then(function(r){
var t=(r&&r.data&&r.data.text)?r.data.text.replace(/\s+\n/g,"\n").replace(/[ \t]+/g," ").trim():"";
if(t&&t.length>5&&!isGib(t)){
textEl.value=textEl.value?(textEl.value+"\n\n"+t):t;
st.textContent="Text ready — fix mistakes if needed.";st.className="st ok";
}else{st.textContent="Could not read clearly. Type the questions.";st.className="st warn";}
}).catch(function(){st.textContent="Could not read photo. Type below.";st.className="st bad";});
}
var hwMode="explain",hwLvl="grade7",hwQs=[],hwSubj="";
var SUBJECTS=[
{id:"english",label:"English / Reading",tip:"Stories, fables, poems"},
{id:"math",label:"Math",tip:"Numbers and word problems"},
{id:"science",label:"Science",tip:"Biology, chemistry, physics"},
{id:"history",label:"History",tip:"People, events, places"},
{id:"general",label:"General",tip:"Anything else"}
];
chips("hw-modes",function(v){hwMode=v;});
chips("hw-lvl",function(v){hwLvl=v;});
function hwStep(n){
var labels=["Step 1 · Add the page","Step 2 · Pick questions","Step 3 · How to help","Step 4 · Help"];
el("hw-lbl").textContent=labels[n-1]||"";
var dots=el("hw-dots").children;
for(var i=0;i<dots.length;i++)dots[i].className="dot"+(i+1<n?" done":(i+1===n?" on":""));
el("hw1").style.display=n===1?"block":"none";
el("hw2").style.display=n===2?"block":"none";
el("hw3").style.display=n===3?"block":"none";
el("hw4").style.display=n===4?"block":"none";
}
on("hw-cam","change",function(){var f=this.files&&this.files[0];if(f)ocr(f,el("hw-st"),el("hw-text"),el("hw-img"));});
on("hw-file","change",function(){var f=this.files&&this.files[0];if(f)ocr(f,el("hw-st"),el("hw-text"),el("hw-img"));});
function parseQs(text){
var lines=text.split(/\n/),qs=[],buf="";
var re=/^\s*(?:(?:question\s*)?\d+[\).:\-]|[Qq]\d+|#\s*\d+)/;
for(var i=0;i<lines.length;i++){
var line=lines[i].replace(/\s+$/,"");
if(!line.replace(/\s/g,""))continue;
if(re.test(line)&&buf){qs.push(buf.trim());buf=line;}
else buf=buf?(buf+" "+line):line;
}
if(buf.trim())qs.push(buf.trim());
if(qs.length<=1&&text.length>80){
var parts=text.replace(/\s+/g," ").split(/(?=\b\d+[\).]|#\s*\d+)/);qs=[];
for(var i=0;i<parts.length;i++){var p=parts[i].trim();if(p.length>12)qs.push(p);}
}
if(!qs.length)qs=[text.trim().slice(0,500)];
return qs.slice(0,12).map(function(q,i){return{n:i+1,text:q.slice(0,350)};});
}
function detectSubj(t){
t=t.toLowerCase();
if(/aesop|fable|fox|grasshopper|theme|character|poem|essay|story|moral|swollen/.test(t))return"english";
if(/\d\s*[\+\-\x\*\/=]|equation|algebra|fraction|percent|solve/.test(t))return"math";
if(/cell|atom|gravity|photosynthesis|biology|chemistry|physics/.test(t))return"science";
if(/war|century|revolution|history|ancient|president/.test(t))return"history";
return"general";
}
function subjLabel(id){for(var i=0;i<SUBJECTS.length;i++)if(SUBJECTS[i].id===id)return SUBJECTS[i].label;return id;}
on("hw1-next","click",function(){
var t=el("hw-text").value.trim();
if(!t){el("hw-st").textContent="Add a photo or type text first.";el("hw-st").className="st warn";return;}
if(isGib(t)){el("hw-st").textContent="Text looks unreadable. Fix it first.";el("hw-st").className="st warn";return;}
hwQs=parseQs(t);hwSubj=detectSubj(t);
var box=el("hw-qs");box.innerHTML="";
for(var i=0;i<hwQs.length;i++){
var q=hwQs[i],d=document.createElement("div");d.className="qi";
d.innerHTML='<input type="checkbox" id="qq'+i+'" checked/><label for="qq'+i+'"><strong>#'+q.n+'</strong> — '+esc(q.text)+'</label>';
box.appendChild(d);
}
hwStep(2);
});
on("hw2-back","click",function(){hwStep(1);});
on("hw2-next","click",function(){
el("hw-subj").textContent=subjLabel(hwSubj);
el("hw-subj-st").textContent="Suggested: "+subjLabel(hwSubj);
hwStep(3);
});
on("hw3-back","click",function(){hwStep(2);});
on("hw-reset","click",function(){
el("hw-text").value="";el("hw-img").style.display="none";el("hw-st").textContent="";
el("hw-note").value="";el("hw-essay").checked=false;hwSubj="";hwStep(1);
});
on("hw-subj","click",function(){
var list=el("subj-list");list.innerHTML="";
SUBJECTS.forEach(function(s){
var b=document.createElement("button");b.type="button";b.className="si";
b.innerHTML=esc(s.label)+"<small>"+esc(s.tip)+"</small>";
b.onclick=function(){
hwSubj=s.id;el("hw-subj").textContent=s.label;el("hw-subj-st").textContent="Subject: "+s.label;
el("subj-ov").classList.remove("open");
};
list.appendChild(b);
});
el("subj-ov").classList.add("open");
});
on("subj-x","click",function(){el("subj-ov").classList.remove("open");});
el("subj-ov").addEventListener("click",function(e){if(e.target===el("subj-ov"))el("subj-ov").classList.remove("open");});
function buildHelp(selected,subj,mode,essay,note){
var lines=["Subject: "+subjLabel(subj),"Mode: "+(mode==="explain"?"Explanation":mode==="answer"?"Answer":"Answer + Explanation")];
if(note)lines.push("Note: "+note);lines.push("");
for(var i=0;i<selected.length;i++){
var q=selected[i],qt=q.text;
lines.push("────────","Question #"+q.n,qt,"");
if(subj==="english"){
if(/fable|aesop|fox|grasshopper|swollen|moral|flies|hen and|wolf|miser|ants/i.test(qt)){
if(mode!=="answer"){lines.push("How to read this fable","1. Characters","2. What happens","3. What goes wrong","4. The moral","5. Real-life example","");}
if(mode!=="explain"){
lines.push("Answer guide");
if(/swollen fox/i.test(qt)){lines.push("• Fox eats, gets too fat to leave.","• Moral: greed can trap you.");}
else if(/flies|honey/i.test(qt)){lines.push("• Flies stick to honey.","• Moral: careless pleasure can hurt you.");}
else if(/golden|hen/i.test(qt)){lines.push("• Owner kills the hen for all gold and loses everything.","• Moral: greed can ruin what you have.");}
else if(/grasshopper|ants/i.test(qt)){lines.push("• Ants prepare; grasshopper does not.","• Moral: prepare for the future.");}
else if(/wolf|sheep/i.test(qt)){lines.push("• Wolf hides in sheep clothing.","• Moral: don't trust looks alone.");}
else{lines.push("• Name characters + what happens.","• State the moral in one sentence.");}
lines.push("","Draft: characters / plot / moral");
}
}else{
if(mode!=="answer"){lines.push("1. Restate the question","2. Use a detail from the text","3. Explain");}
if(mode!=="explain"){lines.push("Answer in 2–4 sentences.","Draft: _______________");}
}
}else if(subj==="math"){lines.push("1. Given  2. Find  3. Method  4. Steps  5. Check","Work: _______________");}
else if(subj==="science"){lines.push("1. Concept  2. Cause→effect  3. Vocabulary  4. Example","Draft: _______________");}
else if(subj==="history"){lines.push("1. Who/what/when/where  2. Cause→effect  3. Why it mattered","Draft: _______________");}
else{lines.push("1. Restate  2. Answer in full sentences  3. Use a detail","Draft: _______________");}
if(essay||/essay|paragraph|write about/i.test(qt)){lines.push("","Essay: intro · main idea · 2–3 points · conclusion");}
lines.push("");
}
return lines.join("\n");
}
on("hw3-go","click",function(){
var selected=[];
for(var i=0;i<hwQs.length;i++){var cb=el("qq"+i);if(cb&&cb.checked)selected.push(hwQs[i]);}
if(!selected.length)selected=hwQs.slice(0,1);
if(!hwSubj)hwSubj=detectSubj(selected.map(function(q){return q.text;}).join(" "));
var body=buildHelp(selected,hwSubj,hwMode,el("hw-essay").checked,el("hw-note").value.trim());
el("hw-out").innerHTML='<div class="t">Homework · '+esc(subjLabel(hwSubj))+'</div>'+esc(body);
hwStep(4);
});
var nStyle="short";
chips("n-modes",function(v){nStyle=v;});
on("n-cam","change",function(){var f=this.files&&this.files[0];if(f)ocr(f,el("n-st"),el("n-text"),el("n-img"));});
on("n-file","change",function(){var f=this.files&&this.files[0];if(f)ocr(f,el("n-st"),el("n-text"),el("n-img"));});
on("n-fetch","click",function(){
var url=el("n-url").value.trim();
if(!url){el("n-st").textContent="Paste a link first.";return;}
if(!/^https?:\/\//i.test(url))url="https://"+url;
el("n-st").textContent="Loading…";
fetch("https://r.jina.ai/"+url).then(function(r){if(!r.ok)throw new Error();return r.text();}).then(function(t){
t=t.trim().slice(0,20000);if(t.length<40)throw new Error();
el("n-text").value=t;el("n-st").textContent="Loaded.";el("n-st").className="st ok";
}).catch(function(){el("n-st").textContent="Could not load link. Paste text.";el("n-st").className="st warn";});
});
on("n-go","click",function(){
var raw=el("n-text").value.trim();
if(!raw){el("n-out").className="panel show";el("n-out").textContent="Add text first.";return;}
var parts=raw.replace(/\s+/g," ").replace(/([.!?])/g,"$1\n").split("\n"),sents=[];
for(var i=0;i<parts.length;i++){var s=parts[i].trim();if(s.length>20)sents.push(s);}
if(!sents.length)sents=[raw.slice(0,200)];
var n=nStyle==="short"?Math.min(8,sents.length):nStyle==="medium"?Math.min(12,sents.length):Math.min(16,sents.length);
var picks=sents.slice(0,n),lines=[];
if(nStyle==="short"){lines.push("Short notes\n");for(var i=0;i<picks.length;i++)lines.push("• "+picks[i].slice(0,120));}
else if(nStyle==="medium"){lines.push("Medium notes\n");for(var i=0;i<picks.length;i++)lines.push((i+1)+". "+picks[i].slice(0,180));}
else{lines.push("Longer notes\n");for(var i=0;i<picks.length;i++)lines.push((i+1)+". "+picks[i].slice(0,200));}
el("n-out").className="panel show";
el("n-out").innerHTML='<div class="t">'+esc(nStyle)+' notes</div>'+esc(lines.join("\n"));
});
var chat=el("chat");
var mem={title:"",author:""};
function bubble(who,text){
var d=document.createElement("div");d.className="b "+who;d.textContent=text;
chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;
}
function bubbleHtml(html){
var d=document.createElement("div");d.className="b ai";d.innerHTML=html;
chat.appendChild(d);chat.scrollTop=chat.scrollHeight;return d;
}
bubble("ai","Type a topic or book.\nExample: Restart by Gordon Korman");
function clean(msg){
var q=msg.trim(),lower=q.toLowerCase();
var p=["what is the ","what is ","explain ","tell me about ","about ","the book ","book called ","find ","search for ","look up "];
for(var i=0;i<p.length;i++)if(lower.indexOf(p[i])===0){q=q.slice(p[i].length);lower=q.toLowerCase();}
return q.replace(/[?.!]+$/,"").trim();
}
function isAuthorFollowup(raw){
if(!mem.title)return false;
if(/^(by|author|written by|the author is|author is)\s+/i.test(raw))return true;
if(/^[A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3}$/.test(raw.trim())&&raw.trim().split(/\s+/).length<=4)return true;
return false;
}
function resolve(msg){
var raw=msg.trim(),title="",author="";
var by=raw.match(/(.+?)\s+by\s+([A-Z][a-zA-Z.\-']+(?:\s+[A-Z][a-zA-Z.\-']+){0,3})/);
if(by){title=by[1].replace(/^(the book|book|novel)\s+/i,"").trim();author=by[2].trim();}
if(isAuthorFollowup(raw)){
author=raw.replace(/^(by|author is|the author is|author|written by)\s+/i,"").trim();
return{title:mem.title,author:author,book:true,note:'Searching "'+mem.title+'" by '+author};
}
if(!title)title=clean(raw);
var book=!!author||/\b(book|novel|author)\b/i.test(raw)||(title.split(/\s+/).length<=4&&title.length<=40);
return{title:title,author:author,book:book,note:""};
}
function noise(t){return /goku|dragon\s*ball|dragonball|naruto|one piece|anime|manga|pokemon|pokémon|minecraft|fortnite|roblox/i.test(t||"");}
function wantsNoise(q){return /goku|dragon\s*ball|anime|manga/i.test(q||"");}
function olSearch(title,author){
var url=(title&&author)
?"https://openlibrary.org/search.json?title="+encodeURIComponent(title)+"&author="+encodeURIComponent(author)+"&limit=8"
:"https://openlibrary.org/search.json?title="+encodeURIComponent(title)+"&limit=8";
return fetch(url).then(function(r){return r.json();}).then(function(data){
return(data.docs||[]).filter(function(d){return d.title;}).map(function(d){
return{title:d.title,authors:(d.author_name||[]).slice(0,3).join(", "),year:d.first_publish_year||"",key:d.key||"",cover:d.cover_i||null,subjects:(d.subject||[]).slice(0,6)};
});
});
}
function wikiSearch(q){
return fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="+encodeURIComponent(q)+"&srlimit=5&format=json&origin=*")
.then(function(r){return r.json();})
.then(function(data){return((data.query&&data.query.search)||[]).map(function(x){return x.title;});});
}
function wikiExtract(title){
return fetch("https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exchars=1800&titles="+encodeURIComponent(title)+"&format=json&origin=*")
.then(function(r){return r.json();})
.then(function(data){
var pages=data.query&&data.query.pages||{};
var k=Object.keys(pages)[0];if(!k||pages[k].missing!==undefined)return null;
var ex=(pages[k].extract||"").trim();if(!ex)return null;
return{title:pages[k].title,extract:ex.slice(0,1800)};
});
}
function bookDesc(key){
if(!key)return Promise.resolve("");
return fetch("https://openlibrary.org"+key+".json").then(function(r){return r.json();}).then(function(d){
var desc=d.description;if(!desc)return"";
if(typeof desc==="object"&&desc.value)desc=desc.value;
return typeof desc==="string"?desc.replace(/\s+/g," ").trim().slice(0,1000):"";
}).catch(function(){return"";});
}
function scoreBook(h,title,author){
var t=(h.title||"").toLowerCase(),q=(title||"").toLowerCase(),s=0;
if(t===q)s+=100;else if(t.indexOf(q)===0)s+=50;else if(t.indexOf(q)!==-1)s+=25;
if(author){
var a=(h.authors||"").toLowerCase(),hits=0;
author.toLowerCase().split(/\s+/).forEach(function(w){if(w.length>1&&a.indexOf(w)!==-1){s+=25;hits++;}});
if(hits===0)s-=50;
}
if(/guys write|anthology|collection/i.test(h.title)&&q.length<20)s-=30;
if(noise(h.title)&&!wantsNoise(title))s-=100;
return s;
}
function rewrite(raw){
if(!raw)return"";
var clean=raw.replace(/\s+/g," ").trim();
var bits=clean.replace(/([.!?])/g,"$1\n").split("\n"),out=[];
for(var i=0;i<bits.length&&out.length<5;i++){var s=bits[i].trim();if(s.length>25)out.push(s);}
return out.length?out.join(" "):clean.slice(0,450);
}
function research(){
var input=el("r-in"),msg=input.value.trim();
if(!msg)return;
bubble("me",msg);input.value="";
var live=bubble("ai","");live.innerHTML='<span class="live">Searching…</span>';
var r=resolve(msg);
if(r.title&&!r.note)mem.title=r.title;
if(r.author)mem.author=r.author;
if(r.note)live.innerHTML='<span class="live">'+esc(r.note)+'</span>';
var title=r.title,author=r.author,wantBook=r.book||!!author;
var jobs=[];
if(title&&author)jobs.push(olSearch(title,author).catch(function(){return[];}));
jobs.push(olSearch(title,null).catch(function(){return[];}));
var wikiQ=author?(title+" "+author):(wantBook?(title+" novel"):title);
jobs.push(wikiSearch(wikiQ).catch(function(){return[];}));
Promise.all(jobs).then(function(results){
var books=[],wikiTitles=[],seenB={},seenW={};
for(var i=0;i<results.length;i++){
var arr=results[i]||[];
for(var j=0;j<arr.length;j++){
var item=arr[j];
if(typeof item==="string"){if(!seenW[item.toLowerCase()]){seenW[item.toLowerCase()]=1;wikiTitles.push(item);}}
else if(item&&item.title){var k=(item.title+"|"+(item.authors||"")).toLowerCase();if(!seenB[k]){seenB[k]=1;books.push(item);}}
}
}
if(!wantsNoise(title+" "+(author||""))){
books=books.filter(function(b){return!noise(b.title)&&!noise(b.authors);});
wikiTitles=wikiTitles.filter(function(t){return!noise(t);});
}
books.sort(function(a,b){return scoreBook(b,title,author)-scoreBook(a,title,author);});
live.innerHTML='<span class="live">Best match: '+(books[0]?books[0].title:(wikiTitles[0]||"…"))+'…</span>';
var top=books[0],useBook=top&&(author||scoreBook(top,title,author)>=20||wantBook);
var next=[];
if(useBook)next.push(bookDesc(top.key).then(function(d){top.desc=d;return top;}));
else next.push(Promise.resolve(null));
var wp=wikiTitles[0]||null;
if(wp)next.push(wikiExtract(wp).catch(function(){return null;}));
else next.push(Promise.resolve(null));
return Promise.all(next).then(function(p){return{book:p[0],wiki:p[1]};});
}).then(function(pack){
if(live.parentNode)live.parentNode.removeChild(live);
if(pack.book&&!(noise(pack.book.title)&&!wantsNoise(title))){
var b=pack.book,desc=rewrite(b.desc);
if(!desc&&pack.wiki)desc=rewrite(pack.wiki.extract);
if(!desc&&b.subjects&&b.subjects.length)desc="A book"+(b.year?" from about "+b.year:"")+". Tags: "+b.subjects.slice(0,4).join(", ")+".";
if(!desc)desc="Matched as a book"+(b.year?" (about "+b.year+")":"")+" by "+(b.authors||"unknown")+".";
var html="";
if(b.cover){
html+='<div class="bk"><img src="https://covers.openlibrary.org/b/id/'+b.cover+'-M.jpg" alt="" onerror="this.style.display=\'none\'"/><div>';
html+='<strong>'+esc(b.title)+'</strong><br/><span style="color:var(--muted);font-size:13px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc)+'</div></div>';
}else html='<strong>'+esc(b.title)+'</strong><br/><span style="color:var(--muted);font-size:13px">'+esc((b.authors||"")+(b.year?" · "+b.year:""))+'</span><br/><br/>'+esc(desc);
bubbleHtml(html);mem.title=b.title;mem.author=b.authors||mem.author;
bubble("ai","Wrong book? Type the author.");
return;
}
if(pack.wiki&&!(noise(pack.wiki.title)&&!wantsNoise(title))){
bubbleHtml("<strong>"+esc(pack.wiki.title)+"</strong><br/><br/>"+esc(rewrite(pack.wiki.extract)));
mem.title=pack.wiki.title;return;
}
bubble("ai","No solid match.\nTry: Restart by Gordon Korman");
}).catch(function(e){
if(live.parentNode)live.parentNode.removeChild(live);
bubble("ai","Error: "+(e&&e.message?e.message:e));
});
}
on("r-send","click",research);
on("r-in","keydown",function(e){if(e.key==="Enter"){e.preventDefault();research();}});
hwStep(1);
})();
