/* v60 removed the on-device editor and the Thoughts tab; their sections here went with them.
   v54 — the thought thread on the book page, composed text, the final summary.
   node thread54.js            run the suite against Babel.html
   node thread54.js --mutate   break each behaviour on purpose; every mutant must FAIL the suite */
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
  global.getComputedStyle=()=>({getPropertyValue:()=>''});
}

const EXPOSE=`;return {
  get books(){return books;}, set books(v){books=v;},
  get lists(){return lists;}, set lists(v){lists=v;},
  get activeId(){return activeId;}, set activeId(v){activeId=v;},
  set activeTimer(v){activeTimer=v;},
  set bpIdx(v){bpIdx=v;}, set smIdx(v){smIdx=v;},
  bpThoughts, renderBPThoughts, bpSetReview, noteAdd,
  noteWrite, noteEntries, syncNoteText, mergeGhostReads,
  tmrClosePicker, storage, listKey, todayISO
};`;

// syncNoteText exactly as v53 shipped it: r.note must not change behaviour.
function v53Sync(r){
  if(!r) return;
  r.note = (r.notes||[]).map(function(e){ return (e&&e.text)||''; })
    .filter(function(s){ return s.trim(); }).join('\n\n');
}

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
  const guard=(name,fn)=>{ try{ fn(); }catch(e){ ok(name+' (threw)', false, e.message); } };
  const read=(id,start,end,notes,extra)=>Object.assign({id, start, end, rating:0, notes, note:''}, extra||{});
  function fresh(bks){
    T.lists=[{id:'L1',name:'One'},{id:'L2',name:'Two'}]; T.activeId='L1';
    T.books=bks; T.books.forEach(b=>(b.sessions||[]).forEach(r=>T.syncNoteText(r)));
    T.storage.setItem(T.listKey('L1'), J(T.books)); T.storage.setItem(T.listKey('L2'), J([]));
    T.activeTimer=null;
    T.tmrClosePicker(); T.bpIdx=0;
  }
  const thread=()=>{ T.renderBPThoughts(); return document.getElementById('bp-th').innerHTML; };
  const order=(h,parts)=>parts.every((p,i)=>i===0 || h.indexOf(parts[i-1])<h.indexOf(p)) && parts.every(p=>h.indexOf(p)>=0);
  const count=(h,s)=>h.split(s).length-1;

  sec('EVERY ENTRY, IN ORDER, NUMBERED');
  guard('one read',()=>{
    fresh([{title:'Piranesi', bookId:'b1', pages:272, timerSessions:[],
      sessions:[read('r1','2026-03-01','',[
        {at:'2026-03-09',text:'Third, by date.'},
        {at:'2026-03-02',text:'First, by date.'},
        {at:'2026-03-05',text:'Second, by date.'},
        {at:'2026-03-05',text:'   '}])]}]);
    const h=thread();
    const n=T.books[0].sessions.reduce((s,r)=>s+T.noteEntries(r).filter(e=>String(e.text||'').trim()).length,0);
    ok('every entry is on the page', count(h,'class="bp-log"')===n && n===3, count(h,'class="bp-log"'));
    ok('oldest first', order(h,['First, by date.','Second, by date.','Third, by date.']));
    ok('numbered from 1 in that order', order(h,['Log 1','First, by date.','Log 2','Second, by date.','Log 3','Third, by date.']));
    ok('no carousel left behind', !/bpGoThought|bp-thdots|rtn-pos/.test(h));
  });
  guard('many entries',()=>{
    const es=[]; for(let i=1;i<=12;i++) es.push({at:'2026-04-'+String(i).padStart(2,'0'), text:'Entry '+i+'.'});
    fresh([{title:'Middlemarch', bookId:'b2', pages:880, timerSessions:[], sessions:[read('r1','2026-04-01','',es)]}]);
    const h=thread();
    ok('a long thread shows all twelve, not the last one', count(h,'class="bp-log"')===12 && h.indexOf('Entry 1.')>=0 && h.indexOf('Entry 12.')>=0);
    ok('and Log 12 is the last', h.indexOf('Log 12')>h.indexOf('Log 11') && h.indexOf('Log 13')<0);
  });
  guard('two reads',()=>{
    fresh([{title:'Gilead', bookId:'b3', pages:247, timerSessions:[], sessions:[
      read('r1','2024-01-02','2024-02-01',[{at:'2024-01-20',text:'First read, later.'},{at:'2024-01-05',text:'First read, early.'}]),
      read('r2','2026-05-01','',[{at:'2026-05-03',text:'Reread, one.'},{at:'2026-05-09',text:'Reread, two.'},{at:'2026-05-15',text:'Reread, three.'}])]}]);
    const h=thread();
    ok('each read is labelled', h.indexOf('Read 1 of 2')>=0 && h.indexOf('Read 2 of 2')>=0);
    ok('first read’s entries sit under its label, before the second', order(h,['Read 1 of 2','First read, early.','First read, later.','Read 2 of 2','Reread, one.']));
    ok('numbering runs on across reads', order(h,['Log 1','First read, early.','Log 2','First read, later.','Log 3','Reread, one.','Log 5','Reread, three.']));
    ok('five entries, five logs', count(h,'class="bp-log"')===5 && h.indexOf('Log 6')<0);
  });

  sec('POSITIONS ARE OPTIONAL AND IN THEIR OWN UNIT');
  guard('positions',()=>{
    fresh([{title:'Babel', bookId:'b4', pages:545, timerSessions:[], sessions:[read('r1','2026-06-01','',[
      {at:'2026-06-02',text:'No position here.'},
      {at:'2026-06-03',text:'On paper.',pos:31,fmt:'print'},
      {at:'2026-06-04',text:'Listening.',pos:95,fmt:'audio'}])]}]);
    const h=thread();
    ok('an entry without a position renders', h.indexOf('No position here.')>=0);
    ok('nothing reads undefined or NaN', !/undefined|NaN/.test(h));
    ok('print shows a page', h.indexOf('p.31')>=0);
    ok('audio shows time, never pages', h.indexOf('1h 35m')>=0 && h.indexOf('p.95')<0);
  });

  sec('THE SUMMARY IS HIS, AND STAYS');
  guard('review',()=>{
    fresh([{title:'Piranesi', bookId:'b1', pages:272, timerSessions:[], sessions:[read('r1','2026-03-01','2026-03-20',[{at:'2026-03-02',text:'An entry.'}])]}]);
    let h=thread();
    ok('a finished read offers a summary box under the thread', order(h,['An entry.','Your summary']) && h.indexOf('bp-rvbox')>=0);
    T.bpSetReview(0,'r1','My summary, in full.');
    const r=T.books[0].sessions[0];
    ok('it is saved on the read as review', r.review==='My summary, in full.');
    ok('and not in r.note', r.note==='An entry.', J(r.note));
    const disk=JSON.parse(T.storage.getItem(T.listKey('L1')))[0].sessions[0];
    ok('it is saved to the list', disk.review==='My summary, in full.');
    T.smIdx=0; T.noteAdd(0); T.noteWrite(0,'A later thought.',(T.books[0].sessions[0].notes||[]).length-1);
    ok('adding an entry in the reading log leaves it alone', r.review==='My summary, in full.' && (r.notes||[]).length===2, J(r));
    T.syncNoteText(r);
    ok('syncNoteText leaves it alone', r.review==='My summary, in full.');
    h=thread();
    ok('it shows on the book page after the log', h.indexOf('My summary, in full.')>=0);
    T.bpSetReview(0,'r1','   ');
    ok('clearing it removes the field', !('review' in r));
  });
  guard('fan-out',()=>{
    fresh([{title:'Piranesi', bookId:'b1', pages:272, timerSessions:[], sessions:[read('r1','2026-03-01','2026-03-20',[])]}]);
    T.storage.setItem(T.listKey('L2'), J([JSON.parse(J(T.books[0]))]));
    T.bpSetReview(0,'r1','Travels with the book.');
    ok('the same book in another list gets the summary', JSON.parse(T.storage.getItem(T.listKey('L2')))[0].sessions[0].review==='Travels with the book.');
  });
  guard('ghost merge',()=>{
    const b={title:'Gilead', bookId:'b3', pages:247, sessions:[
      read('real','2026-01-01','2026-02-01',[{at:'2026-01-10',text:'On the real read.'}], {rating:4}),
      read('ghost','2026-01-01','2026-02-01',[{at:'2026-02-01',text:'On the ghost.'}], {review:'Summary on the ghost.'})],
      timerSessions:[{startTime:1,durationSec:60,startPage:0,endPage:10,readId:'real',fmt:'print'}]};
    b.sessions.forEach(r=>T.syncNoteText(r));
    T.mergeGhostReads(b);
    const r=b.sessions[0];
    ok('the duplicate read is folded into one', b.sessions.length===1);
    ok('the summary survives the merge', r.review==='Summary on the ghost.', J(r));
    ok('and so does every entry from both', (r.notes||[]).length===2 && r.note.indexOf('On the ghost.')>=0 && r.note.indexOf('On the real read.')>=0, J(r.notes));
  });
  guard('ghost merge, summary on the copy that goes',()=>{
    // The real read holds more (entries and a rating), so it survives and the
    // ghost — holding only the summary — is the one folded away.
    const b={title:'Gilead', bookId:'b3', pages:247, sessions:[
      read('real','2026-01-01','2026-02-01',[{at:'2026-01-10',text:'Kept.'}], {rating:5}),
      read('ghost','2026-01-01','2026-02-01',[], {review:'Only on the ghost.'})],
      timerSessions:[{startTime:1,durationSec:60,startPage:0,endPage:10,readId:'real',fmt:'print'}]};
    b.sessions.forEach(r=>T.syncNoteText(r));
    T.mergeGhostReads(b);
    ok('the summary is carried onto the read that stays', b.sessions.length===1 && b.sessions[0].id==='real' && b.sessions[0].review==='Only on the ghost.', J(b.sessions));
    const c={title:'Gilead', bookId:'b3', pages:247, sessions:[
      read('real','2026-01-01','2026-02-01',[{at:'2026-01-10',text:'Kept.'}], {rating:5, review:'Summary one.'}),
      read('ghost','2026-01-01','2026-02-01',[], {review:'Summary two.'})],
      timerSessions:[{startTime:1,durationSec:60,startPage:0,endPage:10,readId:'real',fmt:'print'}]};
    c.sessions.forEach(r=>T.syncNoteText(r));
    T.mergeGhostReads(c);
    ok('two different summaries are both kept', c.sessions.length===1 && c.sessions[0].review.indexOf('Summary one.')>=0 && c.sessions[0].review.indexOf('Summary two.')>=0, J(c.sessions[0].review));
  });

  sec('R.NOTE IS WHAT IT WAS IN V53');
  guard('note',()=>{
    const fixtures=[
      {notes:[{at:'a',text:'One.'},{at:'b',text:'  '},{at:'c',text:'Two.\nwith a line'}]},
      {notes:[{at:'a',text:'Raw words.',composed:'Composed words.',composedOf:'10:abc',pos:4,fmt:'print'}]},
      {notes:[]}, {notes:[{at:'a',text:''},{at:'b'}]}, {note:'legacy only'},
      {notes:[{at:'a',text:'x'}], review:'A summary that must not leak into note.'}];
    fixtures.forEach((f,i)=>{
      const a=JSON.parse(J(f)), b=JSON.parse(J(f));
      T.syncNoteText(a); v53Sync(b);
      ok('fixture '+(i+1)+': same r.note as v53', a.note===b.note, J(a.note)+' vs '+J(b.note));
    });
  });

  if(!quiet) console.log(fail?'\n'+fail+' FAILED':'\nTHREAD CLEAN');
  return fail;
}

// ── mutants: each breaks one behaviour; the suite must catch every one ──────
const MUTANTS=[
  ['render only the last entry',
   "h+= rows.length ? rows.map(function(t){", "h+= rows.length ? rows.slice(-1).map(function(t){"],
  ['drop the read grouping labels',
   "if(multi){\n      var span=bpReadSpan(r);", "if(false){\n      var span=bpReadSpan(r);"],
  ['entries not sorted by date',
   "rows.sort(function(x,y){ return String(x.at||'').localeCompare(String(y.at||'')) || (x.k-y.k); });", ""],
  ['numbering starts at 0',
   "out.forEach(function(t,i){ t.n=i+1; });", "out.forEach(function(t,i){ t.n=i; });"],
  ['numbering restarts each read',
   "out.forEach(function(t,i){ t.n=i+1; });", "var _c={}; out.forEach(function(t){ _c[t.read]=(_c[t.read]||0)+1; t.n=_c[t.read]; });"],
  ['syncNoteText runs over r.review',
   "function syncNoteText(r){\n  if(!r) return;\n  r.note =", "function syncNoteText(r){\n  if(!r) return;\n  r.review = r.note ="],
  ['summary stored in r.note',
   "if(v.trim()) r.review=v; else delete r.review;", "if(v.trim()) r.note=v; else delete r.note;"],
  ['position missing from the thread',
   "function bpEntryHTML(t){\n  var p=thPosText(t);", "function bpEntryHTML(t){\n  var p='';"],
  ['no summary box on the read',
   "if(wantReview) h+=bpReviewHTML(r,ri,multi);", ""],
  ['summary lost in the duplicate-read merge',
   "if(_lr.trim()) winner.review = !_wr.trim() ? _lr : (_wr===_lr ? _wr : _wr+'\\n\\n'+_lr);", ""],
  ['entries lost in the duplicate-read merge',
   "if(e && String(e.text||'').trim() && !_we.some(function(w){ return w && w.at===e.at && w.text===e.text; })) _we.push(e);", ""],
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
