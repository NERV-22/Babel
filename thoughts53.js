/* v53 — Thoughts, the timer Note, and the finish-prompt note.
   node thoughts53.js            run the suite against Babel.html
   node thoughts53.js --mutate   break each behaviour on purpose; every mutant must FAIL the suite */
const fs=require('fs');
const HTML=fs.readFileSync(__dirname+'/Babel.html','utf8');
const mainScript=html=>{
  const blocks=html.match(/<script>([\s\S]*?)<\/script>/g).map(b=>b.replace(/<\/?script[^>]*>/g,''));
  return blocks.slice().sort((a,b)=>b.length-a.length)[0];
};

// ── a browser just big enough for the app to boot in ────────────────────────
let mem={}, __els={};
function el(){
  return {classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    style:{setProperty(){}},dataset:{},children:[],value:'',textContent:'',innerHTML:'',
    addEventListener(){},removeEventListener(){},appendChild(){},removeChild(){},setAttribute(){},
    getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
    focus(){},select(){},scrollTo(){},click(){},matches(){return false;},closest(){return null;},
    getBoundingClientRect(){return{top:0,left:0,width:0,height:0,bottom:0,right:0};}};
}
function installGlobals(){
  mem={}; __els={};
  global.window={addEventListener(){},removeEventListener(){},location:{search:'',href:'',replace(){}},
    matchMedia(){return{matches:false,addEventListener(){}};},setTimeout:()=>0,Capacitor:undefined};
  global.document={getElementById(id){ if(!__els[id]) __els[id]=el(); return __els[id]; },
    querySelector(){return el();},querySelectorAll(){return [];},addEventListener(){},
    createElement(){return el();},body:el(),documentElement:{style:{setProperty(){}}},hidden:false};
  global.localStorage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v);},
    removeItem:k=>{delete mem[k];},key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length;}};
  global.navigator={}; global.performance={now:()=>Date.now()};
  global.requestAnimationFrame=()=>0; global.cancelAnimationFrame=()=>{};
  global.setTimeout=()=>0; global.setInterval=()=>0; global.clearInterval=()=>{}; global.clearTimeout=()=>{};
  global.fetch=()=>Promise.reject(new Error('no net'));
  global.alert=()=>{}; global.confirm=()=>true; global.prompt=()=>null;
  global.getComputedStyle=()=>({getPropertyValue:()=>''});   // the timer ring asks for its colour
}

const EXPOSE=`;return {
  get books(){return books;}, set books(v){books=v;},
  get lists(){return lists;}, set lists(v){lists=v;},
  get activeId(){return activeId;}, set activeId(v){activeId=v;},
  get activeTimer(){return activeTimer;}, set activeTimer(v){activeTimer=v;},
  get smIdx(){return smIdx;}, set smIdx(v){smIdx=v;},
  get tpFor(){return _tpFor;},
  get thLast(){return _thLast;},
  get thRows(){return _thRows;},
  get thDraft(){return _thDraft;},
  set thTarget(v){_thTarget=v;}, set thFresh(v){_thFresh=v;}, set thLastV(v){_thLast=v;},
  get tmrNote(){return _tmrNote;}, set tmrNote(v){_tmrNote=v;}, set tmrEndNote(v){_tmrEndNote=v;},
  set tmrFrozen(v){_tmrFrozenSec=v;}, set tmrMode(v){tmrMode=v;},
  noteWrite, noteEntries, syncNoteText, todayISO, noteBlockHTML,
  thLog, thMove, thMoveLast, thRecent, thPosText, renderThoughts, openThoughts,
  tmrSelectBook, tmrClosePicker, tmrNoteOpen, tmrNoteSave, tmrConfirmFinish, tmrKeepReading,
  storage, listKey
};`;

// ── the suite: returns the number of failures ───────────────────────────────
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
  const J=x=>JSON.stringify(x);
  const today=T.todayISO();
  const book=(title,id,extra)=>Object.assign({title, author:'A', bookId:id, pages:300,
    sessions:[{id:'r_'+id, start:'2026-10-01', end:'', note:'', rating:0}], timerSessions:[]}, extra||{});
  const box=v=>{ document.getElementById('th-box').value=v; };
  function fresh(){
    T.lists=[{id:'L1',name:'One'},{id:'L2',name:'Two'}]; T.activeId='L1';
    T.books=[book('Piranesi','b1'), book('Gilead','b2'), book('Middlemarch','b3')];
    T.storage.setItem(T.listKey('L1'), J(T.books));
    T.storage.setItem(T.listKey('L2'), J([]));
    T.activeTimer=null; T.thTarget=null; T.thFresh=[]; T.thLastV=null; T.tmrNote=null; T.tmrEndNote='';
    T.tmrClosePicker(); box('');
  }
  const allEntries=text=>{
    let n=0;
    T.books.forEach(b=>(b.sessions||[]).forEach(r=>(r.notes||[]).forEach(e=>{ if(e.text===text) n++; })));
    return n;
  };
  const guard=(name,fn)=>{ try{ fn(); }catch(e){ ok(name+' (threw)', false, e.message); } };

  sec('A THOUGHT IS A READING-LOG ENTRY');
  guard('identity',()=>{
    fresh();
    T.smIdx=0; T.noteWrite(0,'Same words.');          // the old way, on Piranesi
    box('Same words.'); T.thLog(); T.tmrSelectBook(1); // the new way, on Gilead
    const a=Object.assign({},T.books[0].sessions[0]), b=Object.assign({},T.books[1].sessions[0]);
    delete a.id; delete b.id;
    ok('both reads end up byte-identical', J(a)===J(b), J(a)+' vs '+J(b));
    ok('the entry is exactly {at,text}', J(T.books[1].sessions[0].notes)===J([{at:today,text:'Same words.'}]),
       J(T.books[1].sessions[0].notes));
    ok('a book nobody picked is untouched', J(T.books[2])===J(book('Middlemarch','b3')));
  });

  sec('READ.NOTE STAYS TRUE');
  guard('sync',()=>{
    fresh();
    box('First.'); T.thLog(); T.tmrSelectBook(0);
    box('Second.'); T.thLog(); T.tmrSelectBook(0);
    const r=T.books[0].sessions[0], copy=JSON.parse(J(r)); T.syncNoteText(copy);
    ok('read.note is what syncNoteText builds', r.note===copy.note, r.note);
    ok('read.note holds both, blank-line separated', r.note==='First.\n\nSecond.', J(r.note));
  });
  guard('saved',()=>{
    fresh();
    box('Kept.'); T.thLog(); T.tmrSelectBook(0);
    const disk=JSON.parse(T.storage.getItem(T.listKey('L1')));
    ok('the open list is saved with it', ((disk[0].sessions[0].notes)||[]).some(e=>e.text==='Kept.'));
  });
  guard('fan-out',()=>{
    fresh();
    const twin=book('Piranesi','b1'); T.storage.setItem(T.listKey('L2'), J([twin]));
    box('Everywhere.'); T.thLog(); T.tmrSelectBook(0);
    const other=JSON.parse(T.storage.getItem(T.listKey('L2')))[0];
    ok('the same book in another list gets it too', other.sessions[0].note==='Everywhere.', J(other.sessions[0]));
  });

  sec('AN OLD NOTE IS CARRIED, NOT LOST');
  guard('migration',()=>{
    fresh();
    T.books[0].sessions[0]={id:'r_old', start:'2026-08-01', end:'2026-09-01', note:'Written long ago.', rating:4};
    box('Written today.'); T.thLog(); T.tmrSelectBook(0);
    const r=T.books[0].sessions[0];
    ok('the old note becomes the first entry', J(r.notes[0])===J({at:'2026-09-01',text:'Written long ago.'}), J(r.notes));
    ok('the new thought follows it', r.notes.length===2 && r.notes[1].text==='Written today.');
    ok('read.note still holds the old words', r.note==='Written long ago.\n\nWritten today.', J(r.note));
  });
  guard('current read',()=>{
    fresh();
    T.books[0].sessions=[{id:'r_done', start:'2025-01-01', end:'2025-02-01', note:'', rating:5},
                         {id:'r_now',  start:'2026-10-01', end:'',           note:'', rating:0}];
    box('On the reread.'); T.thLog(); T.tmrSelectBook(0);
    ok('it lands on the current read, not the first one',
       (T.books[0].sessions[1].notes||[]).length===1 && !(T.books[0].sessions[0].notes||[]).length,
       J(T.books[0].sessions));
  });

  sec('ROUTING NEVER GUESSES');
  guard('timer',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:2, bookTitle:'Middlemarch', startPage:147, fmt:'print', startTime:Date.now()};
    const before=J([T.books[0],T.books[1]]);
    box('Gilead did this better.'); T.thLog();
    ok('a running timer files it with no picker', T.tpFor===null);
    const e=(T.books[2].sessions[0].notes||[])[0]||{};
    ok('on the timer’s book, whatever the text names', e.text==='Gilead did this better.', J(T.books[2].sessions[0]));
    ok('stamped with the page the sitting is on', e.pos===147 && e.fmt==='print', J(e));
    ok('no other book was touched', J([T.books[0],T.books[1]])===before);
    ok('the screen says where it went', (T.thLast||{}).title==='Middlemarch');
  });
  guard('no timer',()=>{
    fresh();
    const before=J(T.books);
    box('Unfiled for now.'); T.thLog();
    ok('no timer: the picker opens', T.tpFor==='log');
    ok('and nothing is written before a book is picked', J(T.books)===before);
    T.tmrClosePicker();
    ok('closing the picker writes nothing either', J(T.books)===before);
    ok('and the words are still in the box', document.getElementById('th-box').value==='Unfiled for now.');
    box('Unfiled for now.'); T.thLog(); T.tmrSelectBook(1);
    ok('picking Gilead files it on Gilead', allEntries('Unfiled for now.')===1 && (T.books[1].sessions[0].notes||[]).length===1);
    ok('and the box is empty for the next one', document.getElementById('th-box').value==='' && T.thDraft==='',
       J(document.getElementById('th-box').value));
    ok('and only on Gilead', J([T.books[0],T.books[2]])===J(JSON.parse(before).filter((_,i)=>i!==1)));
  });
  guard('empty',()=>{
    fresh();
    const before=J(T.books);
    box('   '); T.thLog();
    ok('an empty box writes nothing and opens nothing', J(T.books)===before && T.tpFor===null);
  });
  guard('pointed',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:2, bookTitle:'Middlemarch', startPage:9, fmt:'print', startTime:Date.now()};
    T.openThoughts(1);
    box('About Gilead.'); T.thLog();
    ok('opened pointed at a book, it files there', (T.books[1].sessions[0].notes||[]).length===1 && !(T.books[2].sessions[0].notes||[]).length);
    T.openThoughts();
    box('Back to the timer.'); T.thLog();
    ok('opened from the tab again, the timer routes it', (T.books[2].sessions[0].notes||[]).length===1);
  });
  guard('other list',()=>{
    fresh();
    const away=book('Kristin Lavransdatter','b9');
    T.storage.setItem(T.listKey('L2'), J([away]));
    T.activeTimer={listId:'L2', bookIdx:0, bookTitle:'Kristin Lavransdatter', startPage:12, fmt:'print', startTime:Date.now()};
    const before=J(T.books);
    box('Far from home.'); T.thLog();
    const there=JSON.parse(T.storage.getItem(T.listKey('L2')))[0];
    ok('a timer on a book in another list files it there', there.sessions[0].note==='Far from home.', J(there.sessions[0]));
    ok('and leaves this list alone', J(T.books)===before);
  });

  sec('MOVING LEAVES EXACTLY ONE COPY');
  guard('move',()=>{
    fresh();
    T.books[0].sessions[0].notes=[{at:'2026-09-14',text:'Misfiled.'}]; T.books[0].sessions[0].note='Misfiled.';
    T.renderThoughts();
    const n=T.thRows.findIndex(r=>r.text==='Misfiled.');
    ok('the entry is listed', n>=0);
    T.thMove(n);
    ok('Move opens the picker', T.tpFor==='refile');
    T.tmrSelectBook(2);
    ok('exactly one copy exists afterwards', allEntries('Misfiled.')===1, allEntries('Misfiled.'));
    ok('it left the old book', !(T.books[0].sessions[0].notes||[]).length && T.books[0].sessions[0].note==='', J(T.books[0].sessions[0]));
    const e=(T.books[2].sessions[0].notes||[])[0]||{};
    ok('it is on the new book, its date kept', e.text==='Misfiled.' && e.at==='2026-09-14', J(e));
    ok('the new book’s note string has it', T.books[2].sessions[0].note==='Misfiled.');
  });
  guard('move one of two',()=>{
    fresh();
    T.books[0].sessions[0].notes=[{at:today,text:'Twice.'},{at:today,text:'Twice.'}];
    T.syncNoteText(T.books[0].sessions[0]);
    T.renderThoughts();
    T.thMove(T.thRows.findIndex(r=>r.text==='Twice.')); T.tmrSelectBook(1);
    ok('moving one of two identical entries moves one', (T.books[0].sessions[0].notes||[]).length===1 && (T.books[1].sessions[0].notes||[]).length===1);
  });
  guard('move undoes a read it made',()=>{
    fresh();
    T.books[1].sessions=[];                                    // Gilead: never started
    box('Meant for Piranesi.'); T.thLog(); T.tmrSelectBook(1);
    ok('filing on an unstarted book starts a read to hold it', T.books[1].sessions.length===1);
    T.thMoveLast(); T.tmrSelectBook(0);
    ok('moving it away takes that empty read back', T.books[1].sessions.length===0, J(T.books[1].sessions));
    ok('and the thought is on Piranesi, once', allEntries('Meant for Piranesi.')===1 && (T.books[0].sessions[0].notes||[]).length===1);
    fresh();
    T.books[1].sessions[0].notes=[{at:'2026-09-02',text:'Moved off a real read.'}]; T.syncNoteText(T.books[1].sessions[0]);
    T.renderThoughts(); T.thMove(T.thRows.findIndex(r=>r.text==='Moved off a real read.')); T.tmrSelectBook(2);
    ok('a read he made stays, even when emptied', T.books[1].sessions.length===1, J(T.books[1].sessions));
  });
  guard('move last',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:0, bookTitle:'Piranesi', startPage:50, fmt:'print', startTime:Date.now()};
    box('Wrong book.'); T.thLog();
    T.activeTimer=null;
    T.thMoveLast(); T.tmrSelectBook(1);
    ok('the confirmation line moves the thought just saved', allEntries('Wrong book.')===1 && (T.books[1].sessions[0].notes||[]).length===1);
    ok('a page from the old book does not travel', !('pos' in (T.books[1].sessions[0].notes[0]||{})), J(T.books[1].sessions[0].notes));
    ok('the line now names the new book', (T.thLast||{}).title==='Gilead');
  });

  sec('A POSITION IS OPTIONAL');
  guard('absent',()=>{
    fresh();
    T.books[0].sessions[0].notes=[{at:'2026-09-01',text:'No page.'},{at:today,text:'With page.',pos:31,fmt:'print'}];
    T.syncNoteText(T.books[0].sessions[0]);
    ok('no position, no text', T.thPosText({at:'2026-09-01',text:'x'})==='');
    ok('a print position reads p.31', T.thPosText({pos:31,fmt:'print'})==='p.31');
    ok('an audio position reads as time, never pages', T.thPosText({pos:95,fmt:'audio'})==='1h 35m');
    ok('the note string joins both kinds', T.books[0].sessions[0].note==='No page.\n\nWith page.');
    T.renderThoughts();
    const h=document.getElementById('thoughts-body').innerHTML;
    ok('the list renders both, no undefined or NaN', h.indexOf('No page.')>=0 && h.indexOf('p.31')>=0 && !/undefined|NaN/.test(h));
    const rl=T.noteBlockHTML(T.books[0].sessions[0],0);
    ok('the reading log renders an entry without one', !/undefined|NaN/.test(rl));
  });

  sec('THE TIMER SCREEN');
  guard('note',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:1, bookTitle:'Gilead', startPage:88, fmt:'print', startTime:Date.now()};
    T.tmrMode='running'; T.tmrNoteOpen();
    ok('Note opens a box in place', T.tmrNote==='');
    document.getElementById('tmr-note').value='Mid-sitting.';
    T.tmrNoteSave();
    const e=(T.books[1].sessions[0].notes||[])[0]||{};
    ok('it saves on the timer’s book with its page', e.text==='Mid-sitting.' && e.pos===88, J(e));
    ok('and the box closes, back to the timer', T.tmrNote===null);
  });
  guard('finish',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:0, bookTitle:'Piranesi', startPage:100, fmt:'print',
                   startTime:Date.now()-60000, accumulatedSec:0, pausedAt:Date.now(), finishing:true};
    T.tmrMode='finishprompt'; T.tmrFrozen=1800;
    document.getElementById('tmr-endpage').value='130';
    document.getElementById('tmr-endnote').value='At the end.';
    T.tmrConfirmFinish();
    const b=T.books[0], e=(b.sessions[0].notes||[])[0]||{};
    ok('the session is saved', (b.timerSessions||[]).length===1 && b.timerSessions[0].endPage===130);
    ok('the end-of-sitting thought lands at the page he stopped', e.text==='At the end.' && e.pos===130, J(e));
  });
  guard('finish without',()=>{
    fresh();
    T.activeTimer={listId:'L1', bookIdx:0, bookTitle:'Piranesi', startPage:100, fmt:'print',
                   startTime:Date.now()-60000, accumulatedSec:0, pausedAt:Date.now(), finishing:true};
    T.tmrMode='finishprompt'; T.tmrFrozen=1800;
    document.getElementById('tmr-endpage').value='120';
    document.getElementById('tmr-endnote').value='';
    T.tmrConfirmFinish();
    ok('a blank note line adds no entry', !(T.books[0].sessions[0].notes||[]).length && (T.books[0].timerSessions||[]).length===1);
  });

  if(!quiet) console.log(fail?'\n'+fail+' FAILED':'\nTHOUGHTS CLEAN');
  return fail;
}

// ── mutants: each breaks one behaviour; the suite must catch every one ──────
const MUTANTS=[
  ['drop syncNoteText after a log',
   'noteEntries(r).push(e);\n  syncNoteText(r);\n  return {entry:e, readId:rid', 'noteEntries(r).push(e);\n  return {entry:e, readId:rid'],
  ['write to the wrong read (index 0)',
   'var rid=ensureCurrentRead(b), r=readById(b,rid); if(!r) return null;\n  if(b.sessions.length>had) _thMadeReads[(b.bookId||\'\')+\'|\'+rid]=1;\n  var e={at:todayISO(), text:String(text)};',
   'var rid=ensureCurrentRead(b), r=b.sessions[0]; if(!r) return null;\n  if(b.sessions.length>had) _thMadeReads[(b.bookId||\'\')+\'|\'+rid]=1;\n  var e={at:todayISO(), text:String(text)};'],
  ['skip the legacy-note migration',
   'noteEntries(r).push(e);\n  syncNoteText(r);\n  return {entry:e, readId:rid', '(r.notes=r.notes||[]).push(e);\n  syncNoteText(r);\n  return {entry:e, readId:rid'],
  ['guess the last-read book instead of asking',
   "if(!ref){ tmrOpenPicker('log'); return; }", "if(!ref){ var _g=thLastReadIdx(); ref={listId:activeId, idx:_g, bookId:(books[_g]||{}).bookId}; }"],
  ['ignore the running timer',
   'if(activeTimer){\n    var tb=tmrTimerBook();', 'if(false){\n    var tb=tmrTimerBook();'],
  ['file on the wrong picked book',
   "thLogTo({listId:activeId, idx:i, bookId:b.bookId}, ta?ta.value:_thDraft);", "thLogTo({listId:activeId, idx:0, bookId:books[0].bookId}, ta?ta.value:_thDraft);"],
  ['move copies instead of moving',
   'es.splice(k,1); syncNoteText(r);\n      return {entry:e};', 'syncNoteText(r);\n      return {entry:e};'],
  ['move forgets the date it was written',
   'var e={at:taken.entry.at, text:taken.entry.text};', 'var e={at:todayISO(), text:taken.entry.text};'],
  ['position not absent-safe',
   "if(!e || !(e.pos>0)) return '';\n  return e.fmt==='audio'", "if(!e) return '';\n  return e.fmt==='audio'"],
  ['audio position shown as pages',
   "return e.fmt==='audio' ? fmtMins(e.pos) : 'p.'+e.pos;", "return 'p.'+e.pos;"],
  ['an extra field on every logged entry',
   'var e={at:todayISO(), text:String(text)};', "var e={at:todayISO(), text:String(text), src:'thoughts'};"],
  ['log is not saved',
   'var out=fn(books[i]); if(!out) return null;\n    saveCurrentList(); fanOutBookMeta(i);', 'var out=fn(books[i]); if(!out) return null;\n    fanOutBookMeta(i);'],
  ['log is not fanned out to other lists',
   'var out=fn(books[i]); if(!out) return null;\n    saveCurrentList(); fanOutBookMeta(i);', 'var out=fn(books[i]); if(!out) return null;\n    saveCurrentList();'],
  ['other-list timer book ignored',
   'if(!ref || !ref.bookId || !ref.listId || ref.listId===activeId) return null;\n  try{', 'return null;\n  try{'],
  ['finish-prompt note dropped',
   "_noted=thFile({listId:activeTimer.listId, idx:idx, bookId:_nb&&_nb.bookId, why:'timer'}, _endNote, {pos:endPage, fmt:_cfmt});", '_noted=null;'],
  ['timer Note saves nowhere',
   "var res=thFile({listId:activeTimer.listId, idx:activeTimer.bookIdx, bookId:tb&&tb.bookId, why:'timer'}, text, true);", 'var res={title:"",entry:{}};'],
  ['box keeps the words after a save',
   "var ta=document.getElementById('th-box'); if(ta) ta.value='';\n  _thDraft=''; renderThoughts();", "_thDraft=''; renderThoughts();"],
  ['move leaves an empty read it made behind',
   'if(t) _thDropEmptyRead(b, src.readId); return t;', 'return t;'],
  ['move takes back a read he made',
   'if(!_thMadeReads[key]) return;\n  var r=readById(b,rid);', 'var r=readById(b,rid);'],
  ['timer position not stamped',
   "return thAddEntry(b, text, stamp===true ? thPosNow(b) : (stamp||null));", 'return thAddEntry(b, text, null);'],
];

if(process.argv.includes('--mutate')){
  const src=mainScript(HTML);
  let survived=0;
  console.log('\n== MUTATION TEST ==');
  MUTANTS.forEach(([name,find,repl])=>{
    const at=src.split(find).length-1;
    if(at!==1){ console.log('  BAD    '+name+'   [pattern found '+at+' times]'); survived++; return; }
    const fails=runSuite(src.replace(find,repl), true);
    console.log((fails?'  caught ':'  SURVIVED ')+name+(fails?'  ('+fails+' failing)':''));
    if(!fails) survived++;
  });
  console.log(survived?'\n'+survived+' MUTANT(S) NOT CAUGHT':'\nEVERY MUTANT CAUGHT ('+MUTANTS.length+')');
  process.exit(survived?1:0);
} else {
  process.exit(runSuite(mainScript(HTML), false)?1:0);
}
