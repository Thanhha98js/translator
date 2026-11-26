const APP_V=14;
const $=s=>document.querySelector(s);
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},del:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const HAN=/[\u3400-\u9fff\uf900-\ufaff]/;
const seg=window.Intl&&Intl.Segmenter?new Intl.Segmenter('zh',{granularity:'word'}):null;

// ---- dịch ----
async function gt(q){
 const r=await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'q='+encodeURIComponent(q)});
 if(!r.ok)throw new Error('gt');const j=await r.json();return j[0].filter(x=>x[0]!=null).map(x=>({t:x[0],s:x[1]||''}))}
async function mm(q){
 const r=await fetch('https://api.mymemory.translated.net/get?langpair=zh-CN|vi&q='+encodeURIComponent(q));
 const j=await r.json();if(!j.responseData||!j.responseData.translatedText)throw new Error('mm');return [{t:j.responseData.translatedText,s:q}]}
async function tr(q){try{return await gt(q)}catch(e){if(q.length<=300)return await mm(q);throw e}}
const trs=async q=>(await tr(q)).map(x=>x.t).join('');
const pyOf=w=>window.pinyinPro?pinyinPro.pinyin(w,{toneType:'symbol'}):'';

let spans=[],hlEls=[],rawText='',map=[],prevLen=0,saveT,pyT,mode='input';
try{map=JSON.parse(ls.get('qt-map2')||'[]')}catch(e){map=[]}
const saveMap=()=>ls.set('qt-map2',JSON.stringify(map));

function showRaw(t){
 rawText=t;spans=[];hlEls=[];
 const r=$('#raw');r.textContent='';let pos=0;
 try{r.contentEditable='plaintext-only'}catch(e){r.contentEditable='true'}r.spellcheck=false;
 for(const line of t.split('\n')){
  const d=document.createElement('div');d.className='ln';
  let buf='',lp=pos;
  const parts=seg?[...seg.segment(line)].map(x=>x.segment):[...line];
  for(const p of parts){
   if(HAN.test(p)){if(buf){d.append(buf);buf=''}const s=document.createElement('span');s.textContent=p;d.append(s);spans.push({el:s,o:lp,l:p.length})}
   else buf+=p;
   lp+=p.length}
  if(buf)d.append(buf);
  r.append(d);
  const pt=HAN.test(line)?pyOf(line):'';
  if(pt){const q=document.createElement('div');q.className='py';q.contentEditable='false';q.textContent=pt;r.append(q)}
  pos+=line.length+1}
 $('#in').hidden=true;r.hidden=false;setMode('view')}

const SENT=/[^。！？!?]*[。！？!?]+[”’」』）)"']*|[^。！？!?]+/g;
function units(t){
 const U=[];let pos=0;
 for(const line of t.split('\n')){
  let off=0,cur=null;
  for(const m of (line.match(SENT)||[])){
   if(!cur)cur={s:'',r0:pos+off,nl:0};
   cur.s+=m;off+=m.length;
   if(cur.s.length>=8){cur.r1=pos+off;U.push(cur);cur=null}}
  if(cur){cur.r1=pos+off;U.push(cur)}
  if(U.length)U[U.length-1].nl++;
  pos+=line.length+1}
 if(U.length&&U[U.length-1].nl)U[U.length-1].nl--;
 return U}
async function pool(items,n,fn){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;await fn(items[k],k)}}))}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function trr(q){try{return await trs(q)}catch(e){await wait(700);return await trs(q)}}

// ---- Gemini (bản miễn phí, dùng key của bạn) ----
const DEFAULT_PROMPT='Bạn là dịch giả truyện Trung–Việt chuyên nghiệp. Dịch sang tiếng Việt tự nhiên, trôi chảy, đúng văn phong truyện, xưng hô đúng quan hệ nhân vật, giữ nhất quán tên riêng, không giải thích, không thêm bớt ý.\nTên riêng cố định (mỗi dòng: 中文 = tên Việt):\n';
async function gemCall(batch,ctx){
 const sys=($('#gp').value.trim())+'\n\nQuy tắc đầu ra: nhận một mảng JSON các câu tiếng Trung, trả về mảng JSON các chuỗi tiếng Việt có đúng cùng số phần tử và cùng thứ tự, mỗi phần tử dịch đúng một câu gốc, không gộp, không tách, không kèm lời giải thích.';
 const body={systemInstruction:{parts:[{text:sys}]},
  contents:[{role:'user',parts:[{text:(ctx?'Ngữ cảnh vừa dịch (chỉ để giữ nhất quán, KHÔNG dịch lại):\n'+ctx+'\n\n':'')+'Các câu cần dịch:\n'+JSON.stringify(batch)}]}],
  generationConfig:{temperature:0.6,responseMimeType:'application/json',responseSchema:{type:'ARRAY',items:{type:'STRING'}}}};
 let r;
 try{r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent($('#gmodel').value.trim())+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':$('#gk').value.trim()},body:JSON.stringify(body)})}
 catch(e){throw new Error('không gọi được Gemini (mất mạng hoặc trình duyệt chặn)')}
 const j=await r.json().catch(()=>({}));
 if(!r.ok){const e=new Error(((j.error&&j.error.message)||('HTTP '+r.status)).slice(0,200));e.status=r.status;throw e}
 const c=j.candidates&&j.candidates[0],txt=c&&c.content&&c.content.parts?c.content.parts.map(p=>p.text||'').join(''):'';
 let arr;try{arr=JSON.parse(txt)}catch(e){throw new Error('Gemini trả về dữ liệu sai định dạng')}
 if(!Array.isArray(arr)||arr.length!==batch.length)throw new Error('Gemini trả về sai số câu ('+(Array.isArray(arr)?arr.length:0)+'/'+batch.length+')');
 return arr.map(x=>String(x).trim())}
async function countdown(s){for(let t=s;t>0;t--){$('#st').textContent='Gemini miễn phí giới hạn tốc độ, đang chờ '+t+'s…';await wait(1000)}}
async function gemRetry(batch,ctx){
 for(let i=0;;i++){
  try{return await gemCall(batch,ctx)}
  catch(e){
   const m=/retry in ([\d.]+)s/i.exec(e.message),limited=e.status===429&&!/PerDay/i.test(e.message);
   if(i<3&&(limited||(i<1&&/sai số câu/.test(e.message)))){if(limited)await countdown(m?Math.ceil(+m[1])+1:15);continue}
   throw e}}}
async function gemRun(U,put,viaGoogle){
 let i=0,ctx='',err='';
 while(i<U.length){
  let j=i,ch=0;const batch=[];
  while(j<U.length&&batch.length<60&&(!batch.length||ch+U[j].s.length<=3000)){batch.push(U[j].s);ch+=U[j].s.length;j++}
  try{
   const out=await gemRetry(batch,ctx);
   out.forEach((v,n)=>put(i+n,v));
   const tl=Math.min(3,batch.length);
   ctx=batch.slice(-tl).map((s,n)=>s+' => '+out[out.length-tl+n]).join('\n')}
  catch(e){err=e.message;break}
  i=j;if(i<U.length)await wait(12500)}
 if(i<U.length)await pool(U.slice(i).map((u,n)=>({u,k:i+n})),4,x=>viaGoogle(x.u,x.k));
 return err}

let busy=false;
async function go(engine){
 const t=$('#in').value.trim();if(!t||busy)return;
 if(engine==='gm'&&!$('#gk').value.trim()){$('#gm').open=true;$('#gk').focus();$('#st').textContent='Dán API key Gemini (miễn phí) vào ô API key trước.';return}
 if($('#vi').value.trim()&&!confirm('Dịch lại sẽ ghi đè bản dịch hiện tại, kể cả phần bạn đã sửa. Tiếp tục?'))return;
 ls.set('qt-in',t);showRaw(t);busy=true;$('#go').disabled=$('#gdo').disabled=true;
 const U=units(t),R=new Array(U.length);let nxt=0,out='',fail=0,done=0,gemErr='';map=[];$('#vi').value='';
 const flush=()=>{
  while(nxt<U.length&&R[nxt]!==undefined){
   const u=U[nxt],v0=out.length;out+=R[nxt];
   map.push({v0,v1:out.length,r0:u.r0,r1:u.r1});
   out+=u.nl?'\n'.repeat(u.nl):(nxt<U.length-1?' ':'');nxt++}
  $('#vi').value=out};
 const put=(k,v)=>{R[k]=v;done++;$('#st').textContent='Đang dịch '+done+'/'+U.length;flush()};
 const viaGoogle=async(u,k)=>{try{put(k,(await trr(u.s)).trim())}catch(e){fail++;put(k,'[Không dịch được câu này]')}};
 if(engine==='gm')gemErr=await gemRun(U,put,viaGoogle);else await pool(U,4,viaGoogle);
 prevLen=out.length;ls.set('qt-vi',out);saveMap();busy=false;$('#go').disabled=$('#gdo').disabled=false;
 $('#st').textContent=(gemErr?'Gemini lỗi: '+gemErr+'. Phần còn lại đã dịch bằng Google. ':'')+(fail?'Xong, lỗi '+fail+' câu (kiểm tra mạng rồi dịch lại).':'Xong. Bấm vào bản dịch để nhảy tới câu gốc, sửa trực tiếp nếu cần.')}
$('#go').onclick=()=>go();
$('#gdo').onclick=()=>go('gm');
// sửa bản dịch: dời vị trí đã ghi để bấm vào vẫn khớp câu gốc
$('#vi').addEventListener('input',e=>{
 const v=e.target.value,d=v.length-prevLen,end=e.target.selectionStart,p=d>0?end-d:end;
 prevLen=v.length;ls.set('qt-vi',v);
 for(const m of map){if(m.v0>=p){m.v0+=d;m.v1+=d}else if(m.v1>p)m.v1+=d}
 clearTimeout(saveT);saveT=setTimeout(saveMap,600)});

// bấm vào bản dịch: tô đỏ và nhảy tới từ gốc tương ứng
// thu hẹp vùng tô xuống đúng vế câu gần chỗ bấm nhất
const RCL=/[^，、；：。！？]+[，、；：。！？]*[”’」』）)"']*|[，、；：。！？]+[”’」』）)"']*/g;
const VCL=/[^,;:.!?]+[,;:.!?]*\s*|[,;:.!?]+\s*/g;
function narrow(m,p){
 const rt=rawText.slice(m.r0,m.r1),vt=$('#vi').value.slice(m.v0,m.v1);
 const rc=rt.match(RCL)||[rt],vc=vt.match(VCL)||[vt];
 const q=Math.min(Math.max(p-m.v0,0),Math.max(vt.length-1,0));
 let j=0,acc=0;
 for(;j<vc.length-1;j++){if(q<acc+vc[j].length)break;acc+=vc[j].length}
 let k=j;
 if(rc.length!==vc.length){
  const tpos=(acc+vc[j].length/2)/Math.max(vt.length,1)*rt.length;let s=0;k=rc.length-1;
  for(let i=0;i<rc.length;i++){if(tpos<s+rc[i].length){k=i;break}s+=rc[i].length}}
 let s0=0;for(let i=0;i<k;i++)s0+=rc[i].length;
 return [m.r0+s0,m.r0+s0+rc[k].length]}

function hl(r0,r1){
 hlEls.forEach(e=>e.classList.remove('hl'));hlEls=[];
 for(const s of spans)if(s.o<r1&&s.o+s.l>r0){s.el.classList.add('hl');hlEls.push(s.el)}
 const el=hlEls[0],box=$('#raw').parentElement;
 if(el)box.scrollTo({top:el.offsetTop-box.clientHeight/2+el.offsetHeight/2,behavior:'smooth'})}
$('#vi').addEventListener('click',e=>{
 try{
  if(!map.length){$('#st').textContent='Chưa có dữ liệu căn chỉnh cho bản dịch này, bấm Dịch để dịch lại rồi thử lại.';return}
  if(mode==='input'&&!toView()){$('#st').textContent='Chưa có văn bản gốc.';return}
  const p=e.target.selectionStart,m=map.find(x=>p<x.v1)||map[map.length-1];
  if(m.r1<=m.r0){$('#st').textContent='Câu gốc của đoạn dịch này đã bị xóa.';return}
  const [r0,r1]=narrow(m,p);hl(r0,r1);
  $('#st').textContent='Đang tô '+(r1-r0)+' ký tự gốc';
 }catch(err){$('#st').textContent='Lỗi: '+err.message}});
// ---- sửa văn bản gốc trực tiếp (không đụng tới bản dịch) ----
function setMode(m){mode=m;$('#ed').hidden=!(m==='input'&&rawText);$('#nw').hidden=m!=='view'}
const lineEls=()=>[...$('#raw').children].filter(c=>!c.classList.contains('py'));
function rawEdited(nt){
 const ot=rawText;if(nt===ot)return;
 let a=0;const mx=Math.min(ot.length,nt.length);while(a<mx&&ot[a]===nt[a])a++;
 let b=0;while(b<mx-a&&ot[ot.length-1-b]===nt[nt.length-1-b])b++;
 const del=ot.length-a-b,ins=nt.length-a-b;
 const f=x=>x<=a?x:(x>=a+del?x+ins-del:a+ins);
 for(const m of map){m.r0=f(m.r0);m.r1=f(m.r1)}
 rawText=nt;clearTimeout(saveT);saveT=setTimeout(saveMap,600)}
function toView(){const v=$('#in').value.trim();if(!v)return false;rawEdited(v);ls.set('qt-in',v);showRaw(v);return true}
function reindex(lns){spans=[];let pos=0;for(const ln of lns){for(const n of ln.childNodes){const l=n.textContent.length;if(n.nodeType===1&&n.tagName==='SPAN')spans.push({el:n,o:pos,l});pos+=l}pos+=1}}
function refreshPy(ln){
 if(!ln.isConnected)return;
 let q=ln.nextElementSibling;
 if(!(q&&q.classList.contains('py'))){q=document.createElement('div');q.className='py';q.contentEditable='false';ln.after(q)}
 const pt=HAN.test(ln.textContent)?pyOf(ln.textContent):'';q.textContent=pt;q.hidden=!pt}
function curLine(){
 const s=getSelection(),r=$('#raw');let n=s&&s.anchorNode;
 while(n&&n.parentNode!==r)n=n.parentNode;
 return n&&n.nodeType===1&&!n.classList.contains('py')?n:null}
$('#ed').onclick=()=>{toView()};
$('#nw').onclick=()=>{$('#in').value=rawText;$('#in').hidden=false;$('#raw').hidden=true;setMode('input');$('#in').focus();$('#in').select()};
$('#raw').addEventListener('input',()=>{
 if(mode!=='view')return;
 const lns=lineEls(),nt=lns.map(l=>l.textContent).join('\n');
 rawEdited(nt);reindex(lns);$('#in').value=nt;ls.set('qt-in',nt);
 if(!nt.trim()){$('#raw').textContent='';$('#raw').hidden=true;$('#in').hidden=false;setMode('input');$('#in').focus();return}
 const ln=curLine();if(ln){clearTimeout(pyT);pyT=setTimeout(()=>refreshPy(ln),500)}});

// ---- bấm từ ----
const cache=new Map();let cur='';
const py=w=>pyOf(w)||'(chưa tải được thư viện pinyin, cần mạng lần đầu)';
function say(w){
 if(!('speechSynthesis' in window)){alert('Thiết bị không hỗ trợ đọc thành tiếng.');return}
 speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(w);u.lang='zh-CN';u.rate=.8;
 const v=speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang));if(v)u.voice=v;speechSynthesis.speak(u)}
$('#raw').addEventListener('dblclick',async e=>{
 if(mode!=='view')return;
 const sp=e.target.closest?e.target.closest('span'):null;
 const w0=sp?sp.textContent:getSelection().toString().trim();
 if(!HAN.test(w0))return;
 const w=cur=w0;
 $('#w-s').textContent=w;$('#w-py').textContent=py(w);$('#w-m').textContent='Đang dịch…';$('#dw').showModal();
 try{if(!cache.has(w))cache.set(w,await trs(w));if(cur===w)$('#w-m').textContent=cache.get(w)}
 catch(err){if(cur===w)$('#w-m').textContent='Không dịch được, kiểm tra kết nối mạng.'}});
$('#w-say').onclick=()=>say(cur);
$('#w-cp').onclick=()=>copyText(cur,$('#w-cp'));
$('#w-x').onclick=()=>$('#dw').close();
$('#dw').addEventListener('close',()=>{if(window.speechSynthesis)speechSynthesis.cancel()});
$('#dw').addEventListener('pointerdown',e=>{
 const r=e.currentTarget.getBoundingClientRect();
 if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()});

// ---- copy / xóa ----
function copyText(s,btn){
 const done=()=>{const o=btn.dataset.l||(btn.dataset.l=btn.textContent);btn.textContent='Đã copy';setTimeout(()=>{btn.textContent=o},1200)};
 const fallback=()=>{const ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.opacity='0';btn.parentElement.append(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();done()};
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(s).then(done,fallback);else fallback()}
$('#cp').onclick=()=>{if($('#vi').value)copyText($('#vi').value,$('#cp'))};

// ---- giao diện ----
function setFs(d){const f=Math.min(34,Math.max(13,(parseInt(ls.get('qt-fs'))||19)+d));ls.set('qt-fs',f);document.documentElement.style.setProperty('--fs',f+'px')}
$('#fm').onclick=()=>setFs(-1);$('#fp').onclick=()=>setFs(1);
function setTheme(t){document.documentElement.dataset.t=t;ls.set('qt-th',t)}
$('#th').onclick=()=>setTheme(document.documentElement.dataset.t==='dark'?'light':'dark');
setTheme(ls.get('qt-th')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));setFs(0);
const sIn=ls.get('qt-in'),sVi=ls.get('qt-vi');
if(sIn){$('#in').value=sIn;$('#vi').value=sVi||'';prevLen=$('#vi').value.length;if(sVi)showRaw(sIn)}
$('#gk').value=ls.get('qt-gkey')||'';$('#gmodel').value=ls.get('qt-gmodel')||'gemini-flash-latest';$('#gp').value=ls.get('qt-gprompt')||DEFAULT_PROMPT;
$('#gk').oninput=()=>ls.set('qt-gkey',$('#gk').value.trim());
$('#gmodel').oninput=()=>ls.set('qt-gmodel',$('#gmodel').value.trim());
$('#gp').oninput=()=>ls.set('qt-gprompt',$('#gp').value);
setMode(mode);
$('#st').textContent='Phiên bản '+APP_V;
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
