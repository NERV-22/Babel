/* v55 — the on-device copy-editor's wiring: model -> EditGuard -> e.composed.
   node compose55.js            run the suite against Babel.html and sw.js
   node compose55.js --mutate   break each behaviour on purpose; every mutant must FAIL the suite
   The model is a fake engine here; what is tested is everything around it. */
const fs=require('fs');
const HTML=fs.readFileSync(__dirname+'/Babel.html','utf8');
const SW=fs.readFileSync(__dirname+'/sw.js','utf8');
const GUARD=require('./editguard.js');
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
    ok('four demonstrations come before his entry', a.messages.length===10 && a.messages[0].role==='system');
    ok('no demonstration is "nicer" than its input', (()=>{ for(let i=1;i<9;i+=2){ const g=GUARD(a.messages[i].content, a.messages[i+1].content); if(g.rejected||g.reverts.length) return false; } return true; })());
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
    T.llmButton(); await flush();
    ok('Remove deletes the cached model', removed===1, removed);
    ok('and turns the editor off', T.ready===false && T.storage.getItem('rl_llm_ready')===null);
    setNav({});
  });

  sec('PINNED, AND THE SERVICE WORKER KEEPS THE WEIGHTS');
  await guarded('pin',async()=>{
    ok('web-llm is pinned at 0.2.79', /@mlc-ai\/web-llm@0\.2\.79\//.test(T.LLM.LIB), T.LLM.LIB);
    ok('the model is Qwen2.5-1.5B q4f16', T.LLM.MODEL==='Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  });
  await guarded('sw',async()=>{
    const handlers={}, deleted=[];
    const self={ addEventListener:(t,f)=>{ handlers[t]=f; }, clients:{claim:()=>Promise.resolve()}, skipWaiting:()=>{}, location:{origin:'https://x'} };
    const caches={ keys:()=>Promise.resolve(['babel-v54','babel-fonts','webllm/model','webllm/config','webllm/wasm','babel-v55','stale-thing']),
      delete:(k)=>{ deleted.push(k); return Promise.resolve(true); }, open:()=>Promise.resolve({}) };
    const env=new Function('self','caches', sw+';return {CACHE, ASSETS};')(self, caches);
    let p; handlers.activate({waitUntil:(x)=>{ p=x; }}); await p;
    ok('a release deletes the old app cache', deleted.indexOf('babel-v54')>=0 && deleted.indexOf('stale-thing')>=0, J(deleted));
    ok('but never the model’s caches', !deleted.some(k=>/^webllm\//.test(k)), J(deleted));
    ok('nor the fonts or the current cache', deleted.indexOf('babel-fonts')<0 && deleted.indexOf(env.CACHE)<0);
    ok('the guard is cached for offline use', env.ASSETS.indexOf('editguard.js')>=0);
    ok('both version strings agree', env.CACHE==='babel-v55' && /var BABEL_VERSION='babel-v55'/.test(src), env.CACHE);
  });

  if(!quiet) console.log(fail?'\n'+fail+' FAILED':'\nCOMPOSE CLEAN');
  return fail;
}

// ── mutants: each breaks one behaviour; the suite must catch every one ──────
const MUTANTS=[
  ['model output skips the guard', 'html',
   "var g=EditGuard(job.text, out);", "var g={rejected:false, text:out};"],
  ['a refused result is stored anyway', 'html',
   "if(g.rejected){ composeRecordDecline(job.text, out, g.reason); return; }", "if(g.rejected){ composeRecordDecline(job.text, out, g.reason); }"],
  ['composed text written into e.text', 'html',
   "thSetComposed(e, g.text);\n        return {entry:e};", "e.text=g.text; thSetComposed(e, g.text);\n        return {entry:e};"],
  ['entries batched into one request', 'html',
   "return eng.chat.completions.create(composeRequest(job.text));",
   "var _all=[job.text].concat(LLM.queue.splice(0).map(function(j){ return j.text; })); return eng.chat.completions.create(composeRequest(_all.join('\\n\\n')));"],
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
   "var dec=(composed && !thComposedValid(t.e)) ? composeDeclined(t.e) : null;", "var dec=null;"],
  ['a composed entry is re-run', 'html',
   "if(thComposedValid(e)) return null;          // composed once; never re-run over it", ""],
  ['refusals forgotten, so retried forever', 'html',
   "if(thComposedValid(t.e) || composeDeclined(t.e)) return;", "if(thComposedValid(t.e)) return;"],
  ['Remove leaves the weights behind', 'html',
   "llmLib().then(function(w){ return w.deleteModelAllInfoInCache(LLM.MODEL); })", "llmLib().then(function(w){ return null; })"],
  ['log time does not compose', 'html',
   "  composeEnqueue({listId:res.listId, idx:ref.idx,", "  if(false) composeEnqueue({listId:res.listId, idx:ref.idx,"],
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
