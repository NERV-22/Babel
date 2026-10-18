/* v55 — the on-device copy-editor's wiring: model -> EditGuard -> e.composed.
   node compose55.js            run the suite against Babel.html and sw.js
   node compose55.js --mutate   break each behaviour on purpose; every mutant must FAIL the suite
   The model is a fake engine here; what is tested is everything around it. */
const fs=require('fs');
const HTML=fs.readFileSync(__dirname+'/Babel.html','utf8');
const SW=fs.readFileSync(__dirname+'/sw.js','utf8');
const GUARD=require('./editguard.js');
const SENT=require('./sentences.js');
const mainScript=html=>{
  const blocks=html.match(/<script>([\s\S]*?)<\/script>/g).map(b=>b.replace(/<\/?script[^>]*>/g,''));
  return blocks.slice().sort((a,b)=>b.length-a.length)[0];
};

// ── a browser just big enough for the app to boot in ────────────────────────
let mem={}, __els={};
function el(){
  return {classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    style:{setProperty(){}},dataset:{},children:[],value:'',textContent:'',innerHTML:'',disabled:false,
    addEventListener(){},removeEventListener(){},appendChild(){},removeChild(){},setAttribute(){},
    getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
    focus(){},select(){},scrollTo(){},click(){},matches(){return false;},closest(){return null;},contains(){return false;},
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
  setNav({}); global.performance={now:()=>Date.now()};
  global.requestAnimationFrame=()=>0; global.cancelAnimationFrame=()=>{};
  global.setTimeout=()=>0; global.setInterval=()=>0; global.clearInterval=()=>{}; global.clearTimeout=()=>{};
  global.fetch=()=>Promise.reject(new Error('no net'));
  global.alert=()=>{}; global.confirm=()=>true; global.prompt=()=>null;
  global.getComputedStyle=()=>({getPropertyValue:()=>''});
  global.EditGuard=GUARD;
  global.Sentences=SENT;
  if(!console._quiet){ const ce=console.error; console.error=(...a)=>{ if(/IndexedDB init failed/.test(String(a[0]))) return; ce(...a); }; console._quiet=1; }
}
const setNav=v=>Object.defineProperty(globalThis,'navigator',{value:v,configurable:true,writable:true});
const flush=async()=>{ for(let i=0;i<25;i++) await new Promise(r=>setImmediate(r)); };

const EXPOSE=`;return {
  get books(){return books;}, set books(v){books=v;},
  get lists(){return lists;}, set lists(v){lists=v;},
  get activeId(){return activeId;}, set activeId(v){activeId=v;},
  set activeTimer(v){activeTimer=v;},
  set bpIdx(v){bpIdx=v;}, set smIdx(v){smIdx=v;}, set bpView(v){bpView=v;},
  get ready(){return TH_COMPOSE_READY;}, set ready(v){TH_COMPOSE_READY=v;},
  set supportCache(v){_llmSupport=v;}, set logCache(v){_composeLog=v;},
  set thTarget(v){_thTarget=v;}, set thFresh(v){_thFresh=v;},
  get COMPOSE_VER(){return COMPOSE_VER;}, COMPOSE_SHOTS, SHOT_MAX, composeShots,
  COMPOSE_SYS, keepBreaks,
  LLM, llmInit, llmEngine, llmButton, llmRemove, renderLlmRow, composeEnqueue, composeRequest,
  renderBPThoughts, bpSetView, bpComposeRest, thTextKey, thComposedText, noteWrite, noteEntries,
  syncNoteText, thLog, tmrSelectBook, tmrClosePicker, storage, listKey
};`;

const E1='chapters 1-4 were good, really makes me excited for the rest. the setup with the two families is doing a lot of work and i like how little the narrator explains';
const E2='chapters 7-8 were terrible. pacing fell apart and the new character feels like a device. losing interest honestly';
const GOOD2='Chapters 7-8 were terrible. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.';
const QWEN2='The pacing in chapters 7-8 felt disjointed, leading to a loss of interest. The introduction of a new character felt more like a crutch than a genuine addition to the narrative.';

async function runSuite(src, sw, quiet){
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
  const guarded=async(name,fn)=>{ try{ await fn(); }catch(e){ ok(name+' (threw)', false, e.message); } };
  const book=(title,id)=>({title, author:'A', bookId:id, pages:300, timerSessions:[],
    sessions:[{id:'r_'+id, start:'2026-10-01', end:'', note:'', rating:0}]});
  const box=v=>{ document.getElementById('th-box').value=v; };
  // A fake engine: records every request, answers with whatever reply() says.
  let calls=[], reply=()=> '';
  const engine={ chat:{ completions:{ create:(req)=>{ calls.push(JSON.parse(J(req))); return Promise.resolve({choices:[{message:{content:reply(req)}}]}); } } }, unload(){} };
  function fresh(withModel){
    T.lists=[{id:'L1',name:'One'},{id:'L2',name:'Two'}]; T.activeId='L1';
    T.books=[book('Piranesi','b1'), book('Gilead','b2')];
    T.storage.setItem(T.listKey('L1'), J(T.books)); T.storage.setItem(T.listKey('L2'), J([]));
    T.storage.removeItem('rl_compose_log'); T.logCache=null;
    if(withModel) T.storage.setItem('rl_llm_ready','1'); else T.storage.removeItem('rl_llm_ready');
    T.llmInit();
    T.LLM.queue=[]; T.LLM.busy=false; T.LLM.engine=withModel?engine:null; T.LLM.loading=null; T.LLM.lib=null;
    calls=[]; reply=()=> '';
    T.activeTimer=null; T.thTarget=null; T.thFresh=[]; T.bpView='raw'; T.bpIdx=0;
    T.tmrClosePicker(); box('');
  }
  const log=async(text, i)=>{ box(text); T.thLog(); T.tmrSelectBook(i); await flush(); };
  const entry=(bi)=>(T.books[bi].sessions[0].notes||[])[0]||{};

  sec('NO MODEL: NOTHING HAPPENS AND NOTHING BREAKS');
  await guarded('absent',async()=>{
    fresh(false);
    ok('the Composed view is off without the model', T.ready===false);
    await log(E2, 0);
    ok('logging still works', entry(0).text===E2);
    ok('and nothing is sent to a model', calls.length===0 && T.LLM.queue.length===0);
    ok('composeEnqueue refuses', T.composeEnqueue({bookId:'b1',readId:'r_b1',at:'x',text:'y'})===false);
    T.renderBPThoughts();
    const h=document.getElementById('bp-th').innerHTML;
    ok('the toggle renders disabled', /disabled>Composed<\/button>/.test(h), h.slice(0,240));
    T.bpSetView('composed'); T.renderBPThoughts();
    ok('asking for Composed changes nothing', document.getElementById('bp-th').innerHTML.indexOf('Left as written')<0);
    T.supportCache=null; setNav({});
    T.renderLlmRow(); await flush();
    ok('Settings says it is unavailable without WebGPU', document.getElementById('llm-btn').textContent==='Unavailable'
       && /no WebGPU/.test(document.getElementById('llm-sub').textContent), document.getElementById('llm-sub').textContent);
  });

  sec('AN ACCEPTED COPY-EDIT GOES TO e.composed AND NOWHERE ELSE');
  await guarded('accepted',async()=>{
    fresh(true);
    reply=()=>GOOD2;
    await log(E2, 0);
    const r=T.books[0].sessions[0], e=entry(0);
    ok('one request was made', calls.length===1, calls.length);
    ok('e.composed holds the guarded edit', e.composed===GOOD2, J(e.composed));
    ok('e.composedOf fingerprints the words it was made from', e.composedOf===T.thTextKey(E2), e.composedOf);
    ok('e.text is his, untouched', e.text===E2);
    ok('r.note is his, untouched', r.note===E2, J(r.note));
    ok('r.review is not invented', !('review' in r));
    const disk=JSON.parse(T.storage.getItem(T.listKey('L1')))[0].sessions[0].notes[0];
    ok('the composed copy is saved with the list', disk.composed===GOOD2);
    T.bpView='composed'; T.renderBPThoughts();
    const h=document.getElementById('bp-th').innerHTML;
    ok('the Composed view shows it', h.indexOf('Pacing fell apart, and')>=0 && h.indexOf('Left as written')<0);
  });

  sec('A REFUSED EDIT STORES NOTHING ON THE ENTRY');
  await guarded('rejected',async()=>{
    fresh(true);
    reply=()=>QWEN2;
    await log(E2, 0);
    const r=T.books[0].sessions[0], e=entry(0);
    ok('e.composed is not set', !('composed' in e) && !('composedOf' in e), J(e));
    ok('e.text is his, untouched', e.text===E2);
    ok('r.note is his, untouched', r.note===E2);
    const disk=JSON.stringify(JSON.parse(T.storage.getItem(T.listKey('L1'))));
    ok('the model’s rewrite is nowhere in his library', disk.indexOf('disjointed')<0);
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}');
    ok('the refusal is kept on this device, keyed to his words', !!lg[T.thTextKey(E2)] && /disjointed/.test(lg[T.thTextKey(E2)].wanted));
    T.bpView='composed'; T.renderBPThoughts();
    const h=document.getElementById('bp-th').innerHTML;
    const cut=h.indexOf('Left as written');
    ok('the Composed view shows his words, not the rewrite', cut>0 && h.slice(0,cut).indexOf('chapters 7-8 were terrible')>=0 && h.slice(0,cut).indexOf('disjointed')<0, h.slice(0,200));
    ok('with "Left as written"', h.indexOf('Left as written')>=0);
    ok('and what the model wanted, behind a tap', /bp-wanted hidden/.test(h) && h.indexOf('felt disjointed')>h.indexOf('The model wanted'));
    calls=[]; T.bpComposeRest(); await flush();
    ok('a refused entry is not sent again', calls.length===0, calls.length);
  });

  sec('AN EDIT INVALIDATES THE COMPOSED COPY');
  await guarded('edit',async()=>{
    fresh(true);
    reply=()=>GOOD2;
    await log(E2, 0);
    reply=()=> 'Chapters 7-8 were terrible.';
    T.smIdx=0; T.noteWrite(0,'chapters 7-8 were terrible.');
    const e=entry(0);
    ok('his edit is kept', e.text==='chapters 7-8 were terrible.');
    ok('the stale copy is removed from the entry, not just ignored', !('composed' in e) && !('composedOf' in e), J(e));
    ok('the old composed copy is no longer read', T.thComposedText(e)!==GOOD2);
    await flush();
    ok('the new words get their own single request', calls.length===2 && calls[1].messages[calls[1].messages.length-1].content==='chapters 7-8 were terrible.', calls.length);
    ok('and a fresh composed copy of them', e.composed==='Chapters 7-8 were terrible.' && e.composedOf===T.thTextKey(e.text), J(e));
  });

  sec('ONE ENTRY PER REQUEST, ALWAYS');
  await guarded('one',async()=>{
    fresh(true);
    reply=(req)=>req.messages[req.messages.length-1].content;
    box(E1); T.thLog(); T.tmrSelectBook(0);
    box(E2); T.thLog(); T.tmrSelectBook(0);
    await flush();
    ok('two entries, two requests', calls.length===2, calls.length);
    const texts=calls.map(c=>c.messages[c.messages.length-1].content);
    ok('each request ends with exactly one entry', texts[0]===E1 && texts[1]===E2, J(texts));
    const whole=calls.map(c=>J(c.messages));
    ok('no request carries the other entry anywhere', whole[0].indexOf('chapters 7-8 were terrible. pacing fell apart and')<0 && whole[1].indexOf('two families')<0);
    ok('only one user message is his', calls.every(c=>c.messages.filter(m=>m.role==='user' && (m.content===E1||m.content===E2)).length===1));
  });

  sec('DECODING');
  await guarded('decode',async()=>{
    fresh(true);
    const a=T.composeRequest('short entry'), b=T.composeRequest(E1+' '+E1);
    ok('max_tokens scales with the entry', b.max_tokens>a.max_tokens, a.max_tokens+' vs '+b.max_tokens);
    ok('at about 1.2x its length', b.max_tokens===Math.round((E1+' '+E1).length/3.2)+48, b.max_tokens);
    ok('temperature is 0', a.temperature===0 && b.temperature===0);
    ok('with nothing of his composed yet, three stand-ins come before his entry', a.messages.length===8 && a.messages[0].role==='system', a.messages.length);
    ok('no demonstration is "nicer" than its input', (()=>{ for(let i=1;i<a.messages.length-1;i+=2){ const g=GUARD(a.messages[i].content, a.messages[i+1].content); if(g.rejected||g.reverts.length) return false; } return true; })());
  });

  sec('COMPOSED ONCE, NEVER RE-RUN');
  await guarded('once',async()=>{
    fresh(true);
    reply=()=>GOOD2;
    await log(E2, 0);
    reply=()=> 'Chapters 7-8 were terrible. Pacing fell apart and the new character feels like a device. Losing interest honestly.';
    const r=T.books[0].sessions[0], e=entry(0);
    T.composeEnqueue({listId:'L1', idx:0, bookId:'b1', readId:r.id, at:e.at, text:e.text}); await flush();
    ok('a second pass does not overwrite the first', e.composed===GOOD2, J(e.composed));
    calls=[]; T.bpComposeRest(); await flush();
    ok('and the book page does not offer to redo it', calls.length===0, calls.length);
  });

  sec('WITHOUT THE GUARD, NOTHING IS STORED');
  await guarded('noguard',async()=>{
    fresh(true);
    reply=()=>QWEN2;
    global.EditGuard=undefined;
    await log(E2, 0);
    ok('no composed copy without the guard', !('composed' in entry(0)), J(entry(0)));
    global.EditGuard=GUARD;
  });

  sec('COMPOSING NEVER DOWNLOADS');
  await guarded('nodownload',async()=>{
    fresh(true);
    let created=0;
    T.LLM.engine=null;
    T.LLM.importLib=()=>Promise.resolve({ hasModelInCache:()=>Promise.resolve(false),
      CreateMLCEngine:()=>{ created++; return Promise.resolve(engine); } });
    await log(E2, 0);
    ok('the engine is not created when the weights are gone', created===0, created);
    ok('the editor turns itself off', T.ready===false && T.storage.getItem('rl_llm_ready')===null);
    ok('and his entry is safe', entry(0).text===E2 && !('composed' in entry(0)));
  });

  sec('DOWNLOAD AND REMOVE, FROM SETTINGS');
  await guarded('settings',async()=>{
    fresh(false);
    let created=0, removed=0;
    setNav({gpu:{requestAdapter:()=>Promise.resolve({})}}); T.supportCache=null;
    T.LLM.importLib=()=>Promise.resolve({ hasModelInCache:()=>Promise.resolve(true),
      CreateMLCEngine:(id)=>{ created++; return Promise.resolve(engine); },
      deleteModelAllInfoInCache:(id)=>{ removed++; return Promise.resolve(); } });
    T.llmButton(); await flush();
    ok('Download loads the model once', created===1, created);
    ok('and turns the editor on', T.ready===true && T.storage.getItem('rl_llm_ready')==='1');
    T.renderLlmRow();
    ok('Settings then offers Remove', document.getElementById('llm-btn').textContent==='Remove');
    // The week-long diagnostic: refusals split by cause.
    T.books[0].sessions[0].notes=[{at:'2026-10-01',text:'kept'},{at:'2026-10-02',text:'dropped one'},{at:'2026-10-03',text:'rewritten one'}];
    T.books[0].sessions[0].notes[0].composed='Kept.'; T.books[0].sessions[0].notes[0].composedOf=T.thTextKey('kept');
    const lg={}; lg[T.thTextKey('dropped one')]={wanted:'x',reason:'2 of your words were dropped (a, b)',at:1,v:T.COMPOSE_VER};
    lg[T.thTextKey('rewritten one')]={wanted:'y',reason:'5 refused edits, over a budget of 3',at:2,v:T.COMPOSE_VER};
    T.storage.setItem('rl_compose_log', J(lg)); T.logCache=null;
    T.renderLlmRow();
    ok('Settings counts composed and refused entries by cause',
       /1 composed · 2 left as written \(1 dropped words, 1 rewrites\)/.test(document.getElementById('llm-sub').textContent),
       document.getElementById('llm-sub').textContent);
    T.llmButton(); await flush();
    ok('Remove deletes the cached model', removed===1, removed);
    ok('and turns the editor off', T.ready===false && T.storage.getItem('rl_llm_ready')===null);
    setNav({});
  });

  sec('HIS OWN ENTRIES BECOME THE DEMONSTRATIONS');
  await guarded('shots',async()=>{
    fresh(true);
    const mk=(title,id,notes)=>({title, author:'A', bookId:id, pages:100, timerSessions:[], sessions:[{id:'r_'+id,start:'2026-09-01',end:'',rating:0,note:'',notes}]});
    const C=(t,c)=>({at:'2026-09-02',text:t,composed:c,composedOf:T.thTextKey(t)});
    const LONGT='the second half drags badly but the last chapter makes up for it, i didnt expect the ending at all and it reframes the whole thing';
    T.books=[book('Piranesi','b1'),
      mk('Gilead','b2',[C('its slow but beautiful',"It's slow but beautiful."), C(LONGT, LONGT.charAt(0).toUpperCase()+LONGT.slice(1)+'.')]),
      mk('Kokoro','b3',[C('Just a masterpiece of quiet sadness.','Just a masterpiece of quiet sadness.'), C('x'.repeat(T.SHOT_MAX+5),'X'.repeat(T.SHOT_MAX+5))]),
      mk('Demons','b4',[{at:'2026-09-03',text:'never composed, never a demo, and exactly the length that the picker likes best for an already-correct example here'}])];
    T.books[0].sessions[0].notes=[C('same book, already composed','Same book, already composed.')];
    const shots=T.composeShots({bookId:'b1', readId:'r_b1', at:'x', text:E2});
    const ins=shots.map(s=>s[0]);
    ok('a short entry of his, with its fixes, is a demonstration', ins.indexOf('its slow but beautiful')>=0, J(ins));
    ok('so is a longer one', ins.indexOf(LONGT)>=0);
    ok('and one he wrote correctly, which comes back unchanged', shots.some(s=>s[0]==='Just a masterpiece of quiet sadness.' && s[1]===s[0]));
    ok('no stand-ins are needed once he has his own', shots.length===3 && !shots.some(s=>T.COMPOSE_SHOTS.some(c=>c[0]===s[0])), J(ins));
    ok('nothing from the same book is ever shown', ins.indexOf('same book, already composed')<0);
    ok('an entry nothing was composed for is never shown', !ins.some(t=>/never composed/.test(t)), J(ins));
    ok('a very long entry is left out, to keep requests quick', !ins.some(t=>t.length>T.SHOT_MAX));
    ok('every demonstration is his words with only allowed fixes', shots.every(s=>{ const g=GUARD(s[0],s[1]); return !g.rejected && !g.reverts.length; }));
    const req=T.composeRequest(E2, shots);
    ok('the entry being composed is the last message, alone', req.messages[req.messages.length-1].content===E2 && req.messages.length===8);
    const self=T.composeShots({bookId:'b9', readId:'r', at:'x', text:'its slow but beautiful'});
    ok('an entry is never its own demonstration', self.every(s=>s[0]!=='its slow but beautiful'));
    // And the real request uses them, not the stand-ins.
    calls=[]; reply=()=>GOOD2; T.thFresh=[];
    box(E2); T.thLog(); T.tmrSelectBook(0); await flush();
    const sent=calls.length?J(calls[0].messages):'';
    ok('a real request carries his demonstrations', sent.indexOf('its slow but beautiful')>=0 && sent.indexOf('kinda shit')<0, calls.length);
    fresh(true);
    ok('with nothing composed yet, the stand-ins fill in', T.composeShots({bookId:'b1',text:E2}).length===3);
    ok("and the echoed \"I couldn't put it down\" line is gone", !T.COMPOSE_SHOTS.some(s=>/put it down/.test(s[0])));
  });

  sec('A COPIED EXAMPLE IS NAMED, NOT STORED');
  await guarded('echo',async()=>{
    fresh(true);
    reply=(req)=>req.messages[2].content;           // hand back the first demonstration's output
    await log(E1, 0);
    const e=entry(0);
    ok('nothing is stored', !('composed' in e) && e.text===E1, J(e));
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}')[T.thTextKey(E1)]||{};
    ok('the refusal says the model copied its own example', /copied its own example/.test(lg.reason||''), lg.reason);
    T.renderLlmRow();
    ok('and Settings counts it by that cause', /1 copied an example/.test(document.getElementById('llm-sub').textContent), document.getElementById('llm-sub').textContent);
    fresh(true);
    reply=()=> 'Chapters 7-8 were terrible. Pacing fell apart.';
    await log('chapters 7-8 were terrible. pacing fell apart', 0);
    ok('an entry that matches a demo input may still come back as that output', entry(0).composed==='Chapters 7-8 were terrible. Pacing fell apart.', J(entry(0)));
  });

  sec('A NEW GUARD LOOKS AGAIN AT OLD REFUSALS');
  await guarded('retry',async()=>{
    fresh(true);
    reply=()=>GOOD2;
    T.books[0].sessions[0].notes=[{at:'2026-10-01',text:E2}];
    const lg={}; lg[T.thTextKey(E2)]={wanted:'old', reason:'1 of your words were dropped (rolling)', at:1};   // an older guard's: no version
    T.storage.setItem('rl_compose_log', J(lg)); T.logCache=null;
    T.bpView='composed'; T.renderBPThoughts();
    ok('an old refusal no longer shows as "Left as written"', document.getElementById('bp-th').innerHTML.indexOf('Left as written')<0);
    calls=[]; T.bpComposeRest(); await flush();
    ok('and the entry is composed again under the current guard', calls.length===1 && entry(0).composed===GOOD2, calls.length+' '+J(entry(0)));
    reply=()=>QWEN2;
    T.books[0].sessions[0].notes=[{at:'2026-10-02',text:E1}];
    T.bpComposeRest(); await flush();
    calls=[]; T.bpComposeRest(); await flush();
    ok('a refusal by the current guard is not retried', calls.length===0, calls.length);
  });

  sec('TWO PASSES: THE WHOLE ENTRY, THEN SENTENCE BY SENTENCE');
  const P1='chapters 7-8 were terrible. ', P2='pacing fell apart and the new character feels like a device. ', P3='losing interest honestly';
  const FIX={'chapters 7-8 were terrible.':'Chapters 7-8 were terrible.',
    'pacing fell apart and the new character feels like a device.':'Pacing fell apart, and the new character feels like a device.',
    'losing interest honestly':'Losing interest, honestly.'};
  const last=req=>req.messages[req.messages.length-1].content;
  await guarded('one pass',async()=>{
    fresh(true);
    reply=()=>GOOD2;
    await log(E2, 0);
    ok('a whole-entry success costs one request', calls.length===1, calls.length);
    ok('and is stored as before', entry(0).composed===GOOD2);
  });
  await guarded('second pass',async()=>{
    fresh(true);
    reply=req=>last(req)===E2 ? QWEN2 : (FIX[last(req)]||last(req));
    await log(E2, 0);
    ok('a whole-entry refusal falls back to sentences: 1 + 3 requests', calls.length===4, calls.length);
    ok('each sentence is its own request, nothing more', calls.slice(1).map(last).join('|')===[P1,P2,P3].map(p=>p.trim()).join('|'), J(calls.slice(1).map(last)));
    ok('the sentences come back together, spaces intact',
       entry(0).composed==='Chapters 7-8 were terrible. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.', J(entry(0).composed));
    ok('his words are untouched', entry(0).text===E2);
  });
  await guarded('one refused',async()=>{
    fresh(true);
    reply=req=>last(req)===E2 ? QWEN2 : (last(req)===P2.trim() ? 'The pacing felt disjointed.' : (FIX[last(req)]||last(req)));
    await log(E2, 0);
    const c=entry(0).composed||'';
    ok('the refused sentence is in the composed copy byte for byte', c.indexOf(P2)>=0, J(c));
    ok('the others are composed', c.indexOf('Chapters 7-8 were terrible.')===0 && /Losing interest, honestly\.$/.test(c), J(c));
    ok('the rewrite never arrives', c.indexOf('disjointed')<0);
    T.bpView='composed'; T.renderBPThoughts();
    const h=document.getElementById('bp-th').innerHTML;
    ok('the page says 1 of 3 sentences was left as written', h.indexOf('1 of 3 sentences left as written')>=0, h.slice(0,300));
    ok('and shows that sentence and what the model wanted', h.indexOf('“pacing fell apart and the new character feels like a device.”')>=0 && h.indexOf('The pacing felt disjointed.')>=0);
    T.renderLlmRow();
    ok('Settings counts it as a sentence, not an entry', /1 composed · 0 left as written · 1 sentence left as written/.test(document.getElementById('llm-sub').textContent), document.getElementById('llm-sub').textContent);
  });
  await guarded('all refused',async()=>{
    fresh(true);
    reply=()=>QWEN2;
    await log(E2, 0);
    ok('when every sentence is refused nothing is stored', !('composed' in entry(0)), J(entry(0)));
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}')[T.thTextKey(E2)]||{};
    ok('the record says all 3 sentences', lg.kind==='all' && lg.total===3 && (lg.pieces||[]).length===3, J(lg).slice(0,200));
  });
  await guarded('veto',async()=>{
    fresh(true);
    const V='great book. loved it. would read again.';
    // Each sentence picks up "and the" at its edges: harmless one at a time,
    // a run of four function words where two of them meet.
    const VP={'great book.':'great book. and the', 'loved it.':'and the loved it. and the', 'would read again.':'and the would read again.'};
    reply=req=>last(req)===V ? 'great book.' : (VP[last(req)]||last(req));
    await log(V, 0);
    ok('pieces that pass one by one but not together are vetoed', !('composed' in entry(0)), J(entry(0)));
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}')[T.thTextKey(V)]||{};
    ok('recorded as a veto, not an ordinary refusal', lg.kind==='veto', lg.kind);
    T.bpView='composed'; T.renderBPThoughts();
    ok('and the page says so in its own words', document.getElementById('bp-th').innerHTML.indexOf('passed one by one, not together')>=0);
    fresh(true);
    const V2='great book. loved it.';
    reply=req=>last(req)===V2 ? 'great book.' : ({'great book.':'great book. and the','loved it.':'and the loved it.'}[last(req)]||last(req));
    await log(V2, 0);
    ok('even two changes the guard would undo across sentences are enough to veto', !('composed' in entry(0)), J(entry(0)));
  });
  await guarded('whitespace',async()=>{
    fresh(true);
    const W='Part 1 was slow.  Part 2 picked up!\n\nthen it ended';
    reply=req=>last(req)===W ? 'Part 1 was slow.' : (last(req)==='then it ended' ? 'Then it ended.' : last(req));
    await log(W, 0);
    ok('double spaces and paragraph breaks survive the second pass', entry(0).composed==='Part 1 was slow.  Part 2 picked up!\n\nThen it ended.', J(entry(0).composed));
  });
  await guarded('one sentence',async()=>{
    fresh(true);
    reply=()=>'Chapters 7-8 were.';            // drops 'terrible': a real refusal
    await log('chapters 7-8 were terrible', 0);
    ok('a one-sentence entry gets one request, as in v56', calls.length===1, calls.length);
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}')[T.thTextKey('chapters 7-8 were terrible')]||{};
    ok('and an ordinary refusal', lg.kind==='declined' && !lg.pieces, J(lg).slice(0,160));
  });
  await guarded('paragraphs',async()=>{
    fresh(true);
    const M='first part was slow\n\nsecond part was great';
    reply=()=>'First part was slow. Second part was great.';
    await log(M, 0);
    ok('a whole entry composed in one pass keeps his paragraphs', entry(0).composed==='First part was slow.\n\nSecond part was great.', J(entry(0).composed));
    ok('keepBreaks moves only whitespace', T.keepBreaks('a b\n\nc d', 'A b. C d.')==='A b.\n\nC d.' && T.keepBreaks('no break here', 'No break here.')==='No break here.');
    ok('a spelling fix at the break still keeps it', T.keepBreaks('the charcter\n\nwas flat', 'The character was flat.')==='The character\n\nwas flat.', J(T.keepBreaks('the charcter\n\nwas flat', 'The character was flat.')));
  });
  await guarded('no partial store',async()=>{
    fresh(true);
    let n=0;
    T.LLM.engine={ chat:{ completions:{ create:(req)=>{ n++; calls.push(JSON.parse(J(req)));
      if(n===1) return Promise.resolve({choices:[{message:{content:QWEN2}}]});
      if(n===3) return Promise.reject(new Error('device lost'));
      return Promise.resolve({choices:[{message:{content:FIX[last(req)]||last(req)}}]}); } } }, unload(){} };
    await log(E2, 0);
    ok('a failure partway through stores nothing at all', !('composed' in entry(0)), J(entry(0)));
  });
  await guarded('prompt',async()=>{
    ok('the prompt says to leave garbled phrases alone', /If a phrase is garbled or you cannot parse it, leave it exactly as written\. Never delete words you do not understand\./.test(T.COMPOSE_SYS));
  });

  sec('A REVERSED MEANING IS NEVER COMPOSED');
  // Guard v4. On Kokoro the model tried "it helped me reflect" -> "it did not
  // help me reflect"; v3 counted "not" as grammar and would have let it through.
  await guarded('reversal',async()=>{
    fresh(true);
    reply=()=>'It was not good.';
    await log('it was good', 0);
    ok('a one-sentence flip is not stored', !('composed' in entry(0)), J(entry(0)));
    const lg=JSON.parse(T.storage.getItem('rl_compose_log')||'{}')[T.thTextKey('it was good')]||{};
    ok('and is recorded as a reversal', /reverse your meaning \("not" added\)/.test(lg.reason||''), lg.reason);
    T.renderLlmRow();
    ok('Settings names the cause', /0 composed · 1 left as written \(1 reversed meaning\)/.test(document.getElementById('llm-sub').textContent), document.getElementById('llm-sub').textContent);
    fresh(true);
    reply=req=>last(req)===E2 ? 'Chapters 7-8 were not terrible. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.'
      : (last(req)===P1.trim() ? 'Chapters 7-8 were not terrible.' : (FIX[last(req)]||last(req)));
    await log(E2, 0);
    const c=entry(0).composed||'';
    ok('a flipped sentence stays his inside a composed entry', c.indexOf(P1)===0 && !/\bnot\b/.test(c), J(c));
    ok('the rest is composed', /Pacing fell apart, and/.test(c) && /Losing interest, honestly\.$/.test(c), J(c));
    T.bpView='composed'; T.renderBPThoughts();
    const h=document.getElementById('bp-th').innerHTML;
    ok('the page says why', h.indexOf('1 of 3 sentences left as written')>=0 && h.indexOf('reverse your meaning')>=0, h.slice(0,300));
    fresh(true);
    reply=()=>'I wasn’t sure about the ending.';
    await log('i wasnt sure about the ending', 0);
    ok('his apostrophe-less "wasnt" may still gain its apostrophe', entry(0).composed==='I wasn’t sure about the ending.', J(entry(0)));
  });

  sec('PINNED, AND THE SERVICE WORKER KEEPS THE WEIGHTS');
  await guarded('pin',async()=>{
    ok('web-llm is pinned at 0.2.79', /@mlc-ai\/web-llm@0\.2\.79\//.test(T.LLM.LIB), T.LLM.LIB);
    ok('the model is Qwen2.5-1.5B q4f16', T.LLM.MODEL==='Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  });
  await guarded('sw',async()=>{
    const handlers={}, deleted=[];
    const self={ addEventListener:(t,f)=>{ handlers[t]=f; }, clients:{claim:()=>Promise.resolve()}, skipWaiting:()=>{}, location:{origin:'https://x'} };
    const caches={ keys:()=>Promise.resolve(['babel-v56','babel-fonts','webllm/model','webllm/config','webllm/wasm','babel-v57','stale-thing']),
      delete:(k)=>{ deleted.push(k); return Promise.resolve(true); }, open:()=>Promise.resolve({}) };
    const env=new Function('self','caches', sw+';return {CACHE, ASSETS};')(self, caches);
    let p; handlers.activate({waitUntil:(x)=>{ p=x; }}); await p;
    ok('a release deletes the old app cache', deleted.indexOf('babel-v56')>=0 && deleted.indexOf('stale-thing')>=0, J(deleted));
    ok('but never the model’s caches', !deleted.some(k=>/^webllm\//.test(k)), J(deleted));
    ok('nor the fonts or the current cache', deleted.indexOf('babel-fonts')<0 && deleted.indexOf(env.CACHE)<0);
    ok('the guard is cached for offline use', env.ASSETS.indexOf('editguard.js')>=0);
    ok('so is the sentence splitter', env.ASSETS.indexOf('sentences.js')>=0);
    ok('both version strings agree', env.CACHE==='babel-v58' && /var BABEL_VERSION='babel-v58'/.test(src), env.CACHE);
  });

  if(!quiet) console.log(fail?'\n'+fail+' FAILED':'\nCOMPOSE CLEAN');
  return fail;
}

// ── mutants: each breaks one behaviour; the suite must catch every one ──────
const MUTANTS=[
  ['model output skips the guard', 'html',
   "var g=EditGuard(text, out);", "var g={rejected:false, text:out, reverts:[]};"],
  ['a refused result is stored anyway', 'html',
   "if(g.rejected) return {ok:false, reason:g.reason};", "if(false) return {ok:false, reason:g.reason};"],
  ['composed text written into e.text', 'html',
   "thSetComposed(e, text);\n        return {entry:e};", "e.text=text; thSetComposed(e, text);\n        return {entry:e};"],
  ['entries batched into one request', 'html',
   "return composeAsk(eng, job.text, shots).then(function(out){",
   "var _all=[job.text].concat(LLM.queue.splice(0).map(function(j){ return j.text; })).join('\\n\\n'); return composeAsk(eng, _all, shots).then(function(out){"],
  ['max_tokens fixed', 'html',
   "max_tokens:Math.round(String(text).length/3.2)+48", "max_tokens:512"],
  ['temperature not 0', 'html',
   "return {messages:msgs, temperature:0,", "return {messages:msgs, temperature:0.7,"],
  ['composing may download', 'html',
   "return Promise.resolve(allowDownload ? true : w.hasModelInCache(LLM.MODEL))", "return Promise.resolve(true)"],
  ['composing runs without the model', 'html',
   "if(!TH_COMPOSE_READY || !job || !String(job.text||'').trim()) return false;", "if(!job || !String(job.text||'').trim()) return false;"],
  ['service worker deletes the model', 'sw',
   "k !== CACHE && k !== FONTS && !isModelCache(k)", "k !== CACHE && k !== FONTS"],
  ['web-llm unpinned', 'html',
   "web-llm@0.2.79/+esm", "web-llm@0.2.85/+esm"],
  ['an edit keeps the old composed copy', 'html',
   "if(es[k].text!==String(val)) thClearComposed(es[k]);", ""],
  ['an edit is never re-composed', 'html',
   "if(we && _wb) composeEnqueue(", "if(false) composeEnqueue("],
  ['no "Left as written"', 'html',
   "var dec=composed ? composeRecord(t.e) : null;", "var dec=null;"],
  ['a composed entry is re-run', 'html',
   "if(thComposedValid(e)) return null;          // composed once; never re-run over it", ""],
  ['refusals forgotten, so retried forever', 'html',
   "if(thComposedValid(t.e) || composeDeclined(t.e)) return;", "if(thComposedValid(t.e)) return;"],
  ['Remove leaves the weights behind', 'html',
   "llmLib().then(function(w){ return w.deleteModelAllInfoInCache(LLM.MODEL); })", "llmLib().then(function(w){ return null; })"],
  ['log time does not compose', 'html',
   "  composeEnqueue({listId:res.listId, idx:ref.idx,", "  if(false) composeEnqueue({listId:res.listId, idx:ref.idx,"],
  ['refusals not split by cause', 'html',
   "else if(/were dropped/.test(rec.reason||'')) dropped++;", ""],
  ['demos from the same book', 'html',
   "if(job && b.bookId && b.bookId===job.bookId) return;\n    (b.sessions||[]).forEach(function(r){ (r.notes||[]).forEach(function(e){\n      if(!e || !thComposedValid(e)) return;",
   "(b.sessions||[]).forEach(function(r){ (r.notes||[]).forEach(function(e){\n      if(!e || !thComposedValid(e)) return;"],
  ['uncomposed entries used as demos', 'html',
   "      if(!e || !thComposedValid(e)) return;\n      var t=String(e.text||''), c=String(e.composed||'');",
   "      if(!e) return;\n      var t=String(e.text||''), c=String(e.composed||e.text||'');"],
  ['no length cap on demos', 'html',
   "if(t.trim().length<12 || t.length>SHOT_MAX || (job && t===job.text)) return;", "if(t.trim().length<12 || (job && t===job.text)) return;"],
  ['an entry can be its own demo', 'html',
   "if(t.trim().length<12 || t.length>SHOT_MAX || (job && t===job.text)) return;", "if(t.trim().length<12 || t.length>SHOT_MAX) return;"],
  ['no already-clean demo', 'html',
   "    picks.push(clean[0]);\n  }", "  }"],
  ['stand-ins never fill in', 'html',
   "for(var i=0;i<COMPOSE_SHOTS.length && picks.length<3;i++) picks.push(COMPOSE_SHOTS[i]);", ""],
  ['stand-ins always used, never his own', 'html',
   "  var shots=composeShots(job);", "  var shots=COMPOSE_SHOTS;"],
  ['an echoed example is passed to the guard', 'html',
   "    return {ok:false, reason:'the model copied its own example'};", "    ;"],
  ['refusals never expire with a new guard', 'html',
   "return (rec && rec.v===COMPOSE_VER) ? rec : null;", "return rec || null;"],
  ['always split into sentences', 'html',
   "if(v.ok){ composeStore(job, v.text); return; }", "if(false){ composeStore(job, v.text); return; }"],
  ['never a second pass', 'html',
   "if(total<2){ composeRecordDecline(job.text, out, v.reason); return; }", "if(true){ composeRecordDecline(job.text, out, v.reason); return; }"],
  ['a refused sentence takes the model text', 'html',
   "else refused.push({i:i, text:b, wanted:got, reason:v.reason});", "else { out[i]=Sentences.reclothe(piece, got); refused.push({i:i, text:b, wanted:got, reason:v.reason}); }"],
  ['no entry-level veto', 'html',
   "if(G.rejected || G.reverts.length){", "if(false){"],
  ['veto only on an outright rejection', 'html',
   "if(G.rejected || G.reverts.length){", "if(G.rejected){"],
  ['sentence not put back in its whitespace', 'html',
   "if(v.ok) out[i]=Sentences.reclothe(piece, v.text);", "if(v.ok) out[i]=v.text;"],
  ['sentences batched into one request', 'html',
   "return composeAsk(eng, b, shots).then(function(got){", "return composeAsk(eng, pieces.map(Sentences.body).join(' '), shots).then(function(got){"],
  ['partial composition stored as it goes', 'html',
   "if(v.ok) out[i]=Sentences.reclothe(piece, v.text);", "if(v.ok){ out[i]=Sentences.reclothe(piece, v.text); composeStore(job, Sentences.rejoin(out)); }"],
  ['paragraph breaks lost on the first pass', 'html',
   "return {ok:true, text:keepBreaks(text, g.text)};", "return {ok:true, text:g.text};"],
  ['no partial record', 'html',
   "if(composeStore(job, joined) && refused.length){", "if(composeStore(job, joined) && false){"],
  ['prompt line missing', 'html',
   " If a phrase is garbled or you cannot parse it, '\n  +'leave it exactly as written. Never delete words you do not understand.'", "'"],
  ['reversals not counted', 'html',
   "    else if(/reverse your meaning/.test(rec.reason||'')) reversed++;", ""],
  ['reversal cause not shown', 'html',
   "    if(c.reversed) causes.push(c.reversed+' reversed meaning');", ""],
  ['the splitter is not cached for offline', 'sw',
   "  'sentences.js',\n", ""],
  ['the guard is not cached for offline', 'sw',
   "  'editguard.js',\n", ""],
];

(async()=>{
  const src=mainScript(HTML);
  if(process.argv.includes('--mutate')){
    let survived=0;
    console.log('\n== MUTATION TEST ==');
    for(const [name,where,find,repl] of MUTANTS){
      const base=where==='sw'?SW:src, at=base.split(find).length-1;
      if(at!==1){ console.log('  BAD    '+name+'   [pattern found '+at+' times]'); survived++; continue; }
      const fails=where==='sw' ? await runSuite(src, SW.replace(find,repl), true) : await runSuite(src.replace(find,repl), SW, true);
      console.log((fails?'  caught ':'  SURVIVED ')+name+(fails?'  ('+fails+' failing)':''));
      if(!fails) survived++;
    }
    console.log(survived?'\n'+survived+' MUTANT(S) NOT CAUGHT':'\nEVERY MUTANT CAUGHT ('+MUTANTS.length+')');
    process.exit(survived?1:0);
  } else {
    process.exit((await runSuite(src, SW, false))?1:0);
  }
})();
