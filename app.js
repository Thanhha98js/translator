const APP_V=10;
const $=s=>document.querySelector(s);
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
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

let spans=[],hlEls=[],rawText='',map=[],prevLen=0,saveT;
try{map=JSON.parse(ls.get('qt-map2')||'[]')}catch(e){map=[]}
const saveMap=()=>ls.set('qt-map2',JSON.stringify(map));

function showRaw(t){
 rawText=t;spans=[];hlEls=[];
 const r=$('#raw');r.textContent='';let buf='',pos=0;
 const parts=seg?[...seg.segment(t)].map(x=>x.segment):[...t];
 for(const p of parts){
  if(HAN.test(p)){if(buf){r.append(buf);buf=''}const s=document.createElement('span');s.textContent=p;r.append(s);spans.push({el:s,o:pos,l:p.length})}
  else buf+=p;
  pos+=p.length}
 if(buf)r.append(buf);
 $('#in').hidden=true;r.hidden=false;$('#ed').textContent='Sửa gốc'}

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

let busy=false;
async function go(){
 const t=$('#in').value.trim();if(!t||busy)return;
 if($('#vi').value.trim()&&!confirm('Dịch lại sẽ ghi đè bản dịch hiện tại, kể cả phần bạn đã sửa. Tiếp tục?'))return;
 ls.set('qt-in',t);showRaw(t);busy=true;$('#go').disabled=true;
 const U=units(t),R=new Array(U.length);let nxt=0,out='',fail=0,done=0;map=[];$('#vi').value='';
 const flush=()=>{
  while(nxt<U.length&&R[nxt]!==undefined){
   const u=U[nxt],v0=out.length;out+=R[nxt];
   map.push({v0,v1:out.length,r0:u.r0,r1:u.r1});
   out+=u.nl?'\n'.repeat(u.nl):(nxt<U.length-1?' ':'');nxt++}
  $('#vi').value=out};
 await pool(U,4,async(u,k)=>{
  try{R[k]=(await trr(u.s)).trim()}catch(e){fail++;R[k]='[Không dịch được câu này]'}
  done++;$('#st').textContent='Đang dịch '+done+'/'+U.length;flush()});
 prevLen=out.length;ls.set('qt-vi',out);saveMap();busy=false;$('#go').disabled=false;
 $('#st').textContent=fail?'Xong, lỗi '+fail+' câu (kiểm tra mạng rồi dịch lại).':'Xong. Bấm vào bản dịch để nhảy tới câu gốc, sửa trực tiếp nếu cần.'}
$('#go').onclick=go;
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
  if($('#raw').hidden){
   if($('#in').value.trim()!==rawText){$('#st').textContent='Văn bản gốc đã bị sửa so với lúc dịch, bấm Dịch để dịch lại.';return}
   showRaw(rawText)}
  const p=e.target.selectionStart,m=map.find(x=>p<x.v1)||map[map.length-1];
  const [r0,r1]=narrow(m,p);hl(r0,r1);
  $('#st').textContent='Đang tô '+(r1-r0)+' ký tự gốc';
 }catch(err){$('#st').textContent='Lỗi: '+err.message}});
$('#ed').onclick=()=>{const edit=$('#in').hidden;
 if(edit){$('#in').hidden=false;$('#raw').hidden=true;$('#ed').textContent='Xem gốc'}
 else{const v=$('#in').value.trim();ls.set('qt-in',v);if(v!==rawText){map=[];saveMap()}showRaw(v)}
 if(edit)$('#ed').textContent='Xem gốc'};

// ---- bấm từ ----
const cache=new Map();let cur='';
const py=w=>window.pinyinPro?pinyinPro.pinyin(w,{toneType:'symbol'}):'(chưa tải được thư viện pinyin, cần mạng lần đầu)';
function say(w){
 if(!('speechSynthesis' in window)){alert('Thiết bị không hỗ trợ đọc thành tiếng.');return}
 speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(w);u.lang='zh-CN';u.rate=.8;
 const v=speechSynthesis.getVoices().find(v=>/^zh/i.test(v.lang));if(v)u.voice=v;speechSynthesis.speak(u)}
$('#raw').onclick=async e=>{
 const s=e.target.closest('span');if(!s)return;const w=cur=s.textContent;
 $('#w-s').textContent=w;$('#w-py').textContent=py(w);$('#w-m').textContent='Đang dịch…';$('#dw').showModal();
 try{if(!cache.has(w))cache.set(w,await trs(w));if(cur===w)$('#w-m').textContent=cache.get(w)}
 catch(err){if(cur===w)$('#w-m').textContent='Không dịch được, kiểm tra kết nối mạng.'}};
$('#w-say').onclick=()=>say(cur);
$('#w-x').onclick=()=>$('#dw').close();
$('#dw').addEventListener('close',()=>{if(window.speechSynthesis)speechSynthesis.cancel()});
$('#dw').addEventListener('pointerdown',e=>{
 const r=e.currentTarget.getBoundingClientRect();
 if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()});

// ---- giao diện ----
function setFs(d){const f=Math.min(34,Math.max(13,(parseInt(ls.get('qt-fs'))||19)+d));ls.set('qt-fs',f);document.documentElement.style.setProperty('--fs',f+'px')}
$('#fm').onclick=()=>setFs(-1);$('#fp').onclick=()=>setFs(1);
function setTheme(t){document.documentElement.dataset.t=t;ls.set('qt-th',t)}
$('#th').onclick=()=>setTheme(document.documentElement.dataset.t==='dark'?'light':'dark');
setTheme(ls.get('qt-th')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));setFs(0);
const sIn=ls.get('qt-in'),sVi=ls.get('qt-vi');
if(sIn){$('#in').value=sIn;$('#vi').value=sVi||'';prevLen=$('#vi').value.length;if(sVi)showRaw(sIn.trim())}
$('#st').textContent='Phiên bản '+APP_V;
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
