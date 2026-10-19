/* v61 — the library review of v59/v60: redraws that keep what he opened, sheets and the
   timer that follow the book rather than its position, the Reading screen and
   shared-book flags across lists, a fresh paste's cover, the widget's list.
   node library61.js            run the suite against Babel.html
   node library61.js --mutate   break each behaviour on purpose; every mutant must FAIL the suite */
const fs=require('fs');
const HTML=fs.readFileSync(__dirname+'/Babel.html','utf8');
const mainScript=html=>{
  const blocks=html.match(/<script>([\s\S]*?)<\/script>/g).map(b=>b.replace(/<\/?script[^>]*>/g,''));
  return blocks.slice().sort((a,b)=>b.length-a.length)[0];
};

// ── a browser just big enough for the app to boot in ────────────────────────
// Unlike the older suites' stub, class lists are real: half of what this suite
// checks is whether something stayed open.
let mem={}, __els={}, Q=[], widget=null;
function el(){
  const cls=new Set();
  return {classList:{add(...c){c.forEach(x=>cls.add(x));},remove(...c){c.forEach(x=>cls.delete(x));},
      toggle(c,force){ const on=(force===undefined)?!cls.has(c):!!force; if(on) cls.add(c); else cls.delete(c); return on; },
      contains(c){return cls.has(c);}},
    style:{setProperty(){}},dataset:{},children:[],value:'',textContent:'',innerHTML:'',
    addEventListener(){},removeEventListener(){},appendChild(){},removeChild(){},setAttribute(){},
    getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},
    focus(){},select(){},scrollTo(){},click(){},matches(){return false;},closest(){return null;},contains(){return false;},
    getBoundingClientRect(){return{top:0,left:0,width:0,height:0,bottom:0,right:0};}};
}
function installGlobals(){
  mem={}; __els={}; Q=[]; widget=null;
  const later=(fn,ms)=>{ if(typeof fn==='function') Q.push({fn,ms:ms||0}); return Q.length; };
  global.window={addEventListener(){},removeEventListener(){},location:{search:'',href:'',replace(){}},
    matchMedia(){return{matches:false,addEventListener(){}};},setTimeout:later,
    Capacitor:{Plugins:{Preferences:{set(o){ if(o && o.key && /widget/i.test(o.key)) widget=o; return Promise.resolve(); },
      get(){ return Promise.resolve({value:null}); }}}}};
  global.document={getElementById(id){ if(!__els[id]) __els[id]=el(); return __els[id]; },
    querySelector(){return el();},querySelectorAll(){return [];},addEventListener(){},
    createElement(){return el();},body:el(),documentElement:{style:{setProperty(){}}},hidden:false,activeElement:null};
  global.localStorage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v);},
    removeItem:k=>{delete mem[k];},key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length;}};
  global.navigator={}; global.performance={now:()=>Date.now()};
  global.requestAnimationFrame=()=>0; global.cancelAnimationFrame=()=>{};
  global.setTimeout=later; global.setInterval=()=>0; global.clearInterval=()=>{}; global.clearTimeout=()=>{};
  global.fetch=()=>Promise.reject(new Error('no net'));
  global.alert=()=>{}; global.confirm=()=>true; global.prompt=()=>null;
  global.getComputedStyle=()=>({getPropertyValue:()=>''});
}
// Run what the app deferred, the way the browser would after the handler returns.
// Only the near-immediate ones by default: the undo toast's six seconds must not
// pass behind a test's back.
function flush(upTo){ const lim=upTo||100; for(let n=0;n<50;n++){ const due=Q.filter(t=>t.ms<=lim); if(!due.length) break; Q=Q.filter(t=>t.ms>lim); due.forEach(t=>{ try{ t.fn(); }catch(e){} }); } }

const EXPOSE=`;return {
  get books(){return books;}, set books(v){books=v;},
  get lists(){return lists;}, set lists(v){lists=v;},
  get activeId(){return activeId;}, set activeId(v){activeId=v;},
  get readSet(){return readSet;}, set readSet(v){readSet=v;},
  get activeTimer(){return activeTimer;}, set activeTimer(v){activeTimer=v;},
  get bpIdx(){return bpIdx;}, get smIdx(){return smIdx;}, get rlOpenIdx(){return rlOpenIdx;},
  get tmrSelIdx(){return tmrSelIdx;}, set tmrMode(v){tmrMode=v;}, get tmrMode(){return tmrMode;},
  get COVERS(){return COVERS;},
  set saveCoverFor(f){saveCoverFor=f;},
  set deletedBook(v){deletedBook=v;},
  openBookPage, closeBookPage, bpToggleDesc, renderBookPage, refreshOpenViews,
  openSM, openRL,
  deleteBook, undoDelete, copyBook, confirmPaste, switchList, hideToast,
  tmrSel, tmrPickIdx, tmrTimerBook, renderTimerTab, tmrStart, tmrBegin,
  _readingEverywhere, renderReadingScreen, rdOpenElsewhere,
  toggleFav, toggleRead, toggleReading, pushWidgetSnapshot,
  storage, listKey, readKey, saveCurrentList
};`;

function runSuite(src, quiet){
  installGlobals();
  let T;
  try{ T=new Function(src+EXPOSE)(); }
  catch(e){ if(!quiet) console.log('  could not boot: '+e.message); return 1; }
  let fail=0;
  const ok=(name,cond,got)=>{
    if(!quiet) console.log((cond?'  ok   ':'  FAIL ')+name+(cond?'':'   ['+got+']'));
    if(!cond) fail++;
  };
  const sec=t=>{ if(!quiet) console.log('\n== '+t+' =='); };
  const guarded=(name,fn)=>{ try{ fn(); }catch(e){ ok(name+' (threw)', false, e.message); } };
  const J=x=>JSON.stringify(x);
  const LONG='A long description that runs well past the clamp. '.repeat(8);
  const book=(title,id,extra)=>Object.assign({title, author:'A', bookId:id, pages:300, genre:'Fiction', summary:LONG,
    sessions:[{id:'r_'+id, start:'2026-10-01', end:'', note:'', rating:0}], timerSessions:[], isFav:false, isReading:false}, extra||{});
  const html=id=>document.getElementById(id).innerHTML;
  const other=()=>JSON.parse(T.storage.getItem(T.listKey('L2'))||'[]');
  const otherRead=()=>new Set(JSON.parse(T.storage.getItem(T.readKey('L2'))||'[]'));
  function fresh(){
    T.lists=[{id:'L1',name:'Reading List'},{id:'L2',name:'Physical Books'}]; T.activeId='L1';
    T.books=['Piranesi','Gilead','Middlemarch','Kokoro','Stoner'].map((t,i)=>book(t,'b'+(i+1)));
    T.readSet=new Set();
    // Gilead and Kokoro are on both shelves; the Iliad is only on the physical one, and in progress.
    T.storage.setItem(T.listKey('L1'), J(T.books)); T.storage.setItem(T.readKey('L1'), '[]');
    T.storage.setItem(T.listKey('L2'), J([book('Iliad','b9',{isReading:true}), book('Gilead','b2'), book('Kokoro','b4'), book('Odyssey','b10'), book('Aeneid','b11')]));
    T.storage.setItem(T.readKey('L2'), '[]');
    T.activeTimer=null; T.tmrMode='idle';
    T.closeBookPage(); T.tmrSel(-1); T.deletedBook=null;
    flush();
  }

  sec('THE BOOK PAGE KEEPS ITS DESCRIPTION OPEN');
  guarded('desc',()=>{
    fresh();
    T.openBookPage(1); T.bpToggleDesc();
    T.saveCurrentList(); flush();                        // any save now redraws the page
    const d=document.getElementById('bp-desc');
    ok('a save does not snap the description shut', !d.classList.contains('clamped'));
    ok('and the button still offers to close it', document.getElementById('bp-more').textContent==='Show less', document.getElementById('bp-more').textContent);
    T.closeBookPage(); T.openBookPage(2);
    ok('a book page opens with its description clamped', document.getElementById('bp-desc').classList.contains('clamped'));
  });

  sec('THE TIMER SCREEN KEEPS THE BOOK HE PICKED');
  guarded('pick',()=>{
    fresh();
    T.tmrSel(3);                                         // Kokoro
    T.deleteBook(1); flush();                            // Gilead, above it
    ok('deleting a book above it', T.books[T.tmrPickIdx()].title==='Kokoro', T.books[T.tmrPickIdx()].title);
    T.undoDelete(); flush();
    ok('undoing the delete', T.books[T.tmrPickIdx()].title==='Kokoro', T.books[T.tmrPickIdx()].title);
    T.copyBook(4); T.confirmPaste('reset'); flush();     // a paste lands at the top
    ok('pasting a book above it', T.books[T.tmrPickIdx()].title==='Kokoro', T.books[T.tmrPickIdx()].title);
    T.deleteBook(T.tmrPickIdx()); flush();
    ok('and when the book itself is deleted it is not replaced by its neighbour',
       T.books[T.tmrPickIdx()].title!=='Stoner' || T.tmrSelIdx===-1, T.tmrSelIdx);
    fresh();
    T.tmrSel(3); T.switchList('L2'); flush();
    ok('switching to a list that also holds the book keeps it', T.books[T.tmrPickIdx()].title==='Kokoro', T.books[T.tmrPickIdx()].title);
    T.switchList('L1'); T.tmrSel(4); T.switchList('L2'); flush();
    const p=T.books[T.tmrPickIdx()].title;
    ok('a list without it does not hand over whatever sits at the same position', p!=='Aeneid' && T.tmrSelIdx===-1, p+' '+T.tmrSelIdx);
  });

  sec('OPEN SHEETS FOLLOW THEIR BOOK');
  guarded('sheets',()=>{
    fresh();
    T.openBookPage(3); T.deleteBook(0); flush();
    ok('the book page moves with its book', T.bpIdx===2 && T.books[T.bpIdx].title==='Kokoro', T.bpIdx);
    T.deleteBook(T.bpIdx); flush();
    ok('and closes when its book is deleted', T.bpIdx===-1);
    fresh();
    T.openSM(4); T.openRL(4); T.copyBook(0); T.confirmPaste('inherit'); flush();
    ok('the reads sheet follows a paste', T.books[T.smIdx].title==='Stoner', T.smIdx);
    ok('so does the reading log', T.books[T.rlOpenIdx].title==='Stoner', T.rlOpenIdx);
    fresh();
    T.openBookPage(2); T.switchList('L2'); flush();
    ok('switching lists closes the book page', T.bpIdx===-1, T.bpIdx);
    T.switchList('L1'); T.openBookPage(1); T.switchList('L2'); flush();
    ok('even on a book both lists hold, like every other sheet', T.bpIdx===-1, T.bpIdx);
  });

  sec('A RUNNING TIMER KNOWS ITS BOOK WHEN IT LEAVES ITS LIST');
  guarded('timer',()=>{
    fresh();
    T.tmrSel(3); T.tmrStart(); document.getElementById('tmr-startpage').value='10'; T.tmrBegin(); flush();
    ok('the timer is on Kokoro', !!T.activeTimer && T.activeTimer.bookId==='b4');
    T.deleteBook(3); flush();
    ok('its book is still found, on the other shelf', !!T.tmrTimerBook() && T.tmrTimerBook().title==='Kokoro', J(T.tmrTimerBook()));
    T.renderTimerTab();
    ok('the timer screen shows Kokoro, not the book now at its old position',
       /tmr-book locked[\s\S]*Kokoro/.test(html('timer-body')) && !/Stoner/.test(html('timer-body')), html('timer-body').slice(0,240));
  });

  sec('A FRESH PASTE KEEPS ITS COVER');
  guarded('cover',()=>{
    fresh();
    const calls=[]; T.saveCoverFor=(b,url)=>{ calls.push([b.bookId,url]); return Promise.resolve(true); };
    T.COVERS.b3='data:image/png;base64,AAAA';
    T.copyBook(2); T.confirmPaste('reset');
    ok('the cover is stored for the new copy', calls.length===1 && calls[0][0]===T.books[0].bookId && calls[0][0]!=='b3' && calls[0][1]==='data:image/png;base64,AAAA', J(calls));
    calls.length=0; T.confirmPaste('inherit');
    ok('an inherited paste shares the id, so needs no copy', calls.length===0, J(calls));
    delete T.COVERS.b3;
  });

  sec('THE READING SCREEN SHOWS EVERY LIST');
  guarded('reading',()=>{
    fresh();
    T.books[0].isReading=true;
    const r=T._readingEverywhere();
    ok('books in progress on another shelf are listed', r.some(b=>b.title==='Iliad' && b.idx===-1 && b._listId==='L2'), J(r.map(b=>b.title)));
    ok('and the open list\'s own, with their place', r.some(b=>b.title==='Piranesi' && b.idx===0));
    const s2=JSON.parse(T.storage.getItem(T.listKey('L2'))); s2[1].isReading=true; T.storage.setItem(T.listKey('L2'), J(s2));
    T.books[1].isReading=true;
    ok('a book on both shelves appears once', T._readingEverywhere().filter(b=>b.title==='Gilead').length===1);
    T.renderReadingScreen();
    ok('its card switches list to open it', /rdOpenElsewhere\('L2','b9'\)/.test(html('reading-body')), html('reading-body').slice(-400));
    T.rdOpenElsewhere('L2','b9');
    ok('and lands on the book in that list', T.activeId==='L2' && T.books[T.rlOpenIdx].title==='Iliad', T.activeId+' '+T.rlOpenIdx);
  });

  sec('A SHARED BOOK\'S FLAGS REACH ITS OTHER COPY');
  guarded('flags',()=>{
    fresh();
    T.toggleFav(1);
    ok('favourite', other()[1].isFav===true);
    T.toggleReading(1);
    ok('reading now', other()[1].isReading===true);
    T.toggleRead(1);
    ok('read: the other list ticks it', otherRead().has(1));
    ok('and carries the finish stamp', !!other()[1].finishedAt);
    ok('and it is no longer in progress there', other()[1].isReading===false);
    T.toggleRead(1);
    ok('unticking reaches it too', !otherRead().has(1) && !other()[1].finishedAt);
    ok('a book only on this shelf touches nothing else', (T.toggleFav(0), other().every(b=>b.bookId!=='b1')));
    fresh();
    T.tmrSel(3); T.tmrStart(); document.getElementById('tmr-startpage').value='0'; T.tmrBegin(); flush();
    ok('starting the timer marks the other copy in progress', other()[2].isReading===true, J(other()[2]));
  });

  sec('THE WIDGET LISTS A SHARED BOOK ONCE');
  guarded('widget',()=>{
    fresh();
    T.books[1].isReading=true;
    const s2=JSON.parse(T.storage.getItem(T.listKey('L2'))); s2[1].isReading=true; T.storage.setItem(T.listKey('L2'), J(s2));
    T.pushWidgetSnapshot(); flush(1000);
    let v=null; try{ v=JSON.parse(widget.value); }catch(e){}
    const titles=v?(v.reading||[]).map(x=>x.title):[];
    ok('the widget got a snapshot', !!v, widget && widget.key);
    ok('Gilead once, the Iliad too', titles.filter(t=>t==='Gilead').length===1 && titles.indexOf('Iliad')>=0, J(titles));
  });

  return fail;
}

const MUTANTS=[
  ['desc toggle not remembered', "var on=d.classList.toggle('clamped'); bpDescOpen=!on;", "var on=d.classList.toggle('clamped');"],
  ['desc not reset on open', "bpIdx=idx; _bpId=b.bookId||null; bpDescOpen=false;", "bpIdx=idx; _bpId=b.bookId||null;"],
  ['desc redraw clamps', "d.classList.toggle('clamped',!bpDescOpen);", "d.classList.add('clamped');"],
  ['pick by position again', "if(tmrSelIdx>=0){ var _si=_idxOfId(tmrSelIdx,_tmrSelId); if(_si>=0){ tmrSelIdx=_si; return _si; } tmrSel(-1); }", "if(tmrSelIdx>=0 && tmrSelIdx<books.length) return tmrSelIdx;"],
  ['pick id not recorded', "function tmrSel(i){ tmrSelIdx=(typeof i==='number')?i:-1; _tmrSelId=", "function tmrSel(i){ tmrSelIdx=(typeof i==='number')?i:-1; void "],
  ['sheets never reseated', "  try{\n    _reseatOpenViews();\n", "  try{\n"],
  ['book page kept on a deleted book', "if(bpIdx>=0){ var a=_idxOfId(bpIdx,_bpId); if(a<0) closeBookPage(); else bpIdx=a; }", "if(bpIdx>=0){ var a=_idxOfId(bpIdx,_bpId); if(a>=0) bpIdx=a; }"],
  ['reads sheet not reseated', "if(smIdx>=0){ var s=_idxOfId(smIdx,_smId); if(s<0) closeSM(); else smIdx=s; }", ""],
  ['reading log not reseated', "if(rlOpenIdx>=0){ var r=_idxOfId(rlOpenIdx,_rlId); if(r<0) closeRL(); else rlOpenIdx=r; }", ""],
  ['list switch leaves the book page', "closeRL();closeBookPage();\n  // Reset UI state", "closeRL();\n  // Reset UI state"],
  ['timer book lost with its list', "  if(i<0){\n    var loc=_tmrLocate(); if(!loc) return null;", "  if(i<0){\n    return null; var loc=_tmrLocate(); if(!loc) return null;"],
  ['timer card by position', "if(activeTimer && (activeTimer.listId!==activeId || tmrBookIdx()<0)){", "if(activeTimer && activeTimer.listId!==activeId){"],
  ['fresh paste drops the cover', "  if(mode!==\"inherit\" && c.bookId && COVERS[c.bookId]) saveCoverFor(newBook, COVERS[c.bookId]);\n", ""],
  ['reading screen open list only', "  var reading=_readingEverywhere();\n", "  var reading=[]; for(var i=0;i<books.length;i++){ if(books[i].isReading) reading.push(Object.assign({},books[i],{idx:i})); }\n"],
  ['reading screen lists a shared book twice', "        if(!b || !b.isReading || (b.bookId && seen[b.bookId])) return;", "        if(!b || !b.isReading) return;"],
  ['other-list card opens in place', "var _go=(b.idx>=0)?('openRL('+b.idx+')'):", "var _go=true?('openRL('+b.idx+')'):"],
  ['favourite stays behind', "  saveCurrentList(); fanOutBookFlags(idx);\n  // Favourite state", "  saveCurrentList();\n  // Favourite state"],
  ['reading-now stays behind', "  if(books[idx].isReading)readSet.delete(idx);\n  saveCurrentList();fanOutBookFlags(idx);", "  if(books[idx].isReading)readSet.delete(idx);\n  saveCurrentList();"],
  ['read tick stays behind', "saveCurrentList();fanOutBookFlags(idx);updateStats();\n  // Animation", "saveCurrentList();updateStats();\n  // Animation"],
  ['timer start stays behind', "  if(!b.isReading){ b.isReading=true; saveCurrentList(); fanOutBookFlags(idx); if(currentTab==='list') renderTable(); }", "  if(!b.isReading){ b.isReading=true; saveCurrentList(); if(currentTab==='list') renderTable(); }"],
  ['other read set never written', "        storage.setItem(readKey(l.id), JSON.stringify([...rs]));\n", ""],
  ['untick never reaches', "        else { rs.delete(i); delete x.finishedAt; }", "        else {}"],
  ['widget lists a shared book twice', "        if(b.bookId){ if(_wSeen[b.bookId]) return; _wSeen[b.bookId]=1; }   // a book in two lists, once\n", ""],
];

const src=mainScript(HTML);
if(process.argv.includes('--mutate')){
  let survived=0;
  console.log('\n== MUTATION TEST ==');
  MUTANTS.forEach(([name,find,repl])=>{
    const at=src.split(find).length-1;
    if(at!==1){ console.log('  BAD    '+name+'   [pattern found '+at+' times]'); survived++; return; }
    const fails=runSuite(src.replace(find,()=>repl), true);
    console.log((fails?'  caught ':'  SURVIVED ')+name+(fails?'  ('+fails+' failing)':''));
    if(!fails) survived++;
  });
  console.log(survived?'\n'+survived+' MUTANT(S) NOT CAUGHT':'\nEVERY MUTANT CAUGHT ('+MUTANTS.length+')');
  process.exit(survived?1:0);
} else {
  const f=runSuite(src,false);
  console.log(f?'\n'+f+' FAILED':'\nLIBRARY CLEAN');
  process.exit(f?1:0);
}
