const fs=require('fs');
const html=fs.readFileSync(__dirname+'/Babel.html','utf8');
const blocks=html.match(/<script>([\s\S]*?)<\/script>/g).map(b=>b.replace(/<\/?script[^>]*>/g,''));
const src=blocks.slice().sort((a,b)=>b.length-a.length)[0];

const mem={};
function el(){
  const e={
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    style:{setProperty(){}},dataset:{},children:[],value:'',textContent:'',innerHTML:'',
    addEventListener(){},removeEventListener(){},appendChild(){},setAttribute(){},
    getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
    focus(){},select(){},scrollTo(){},click(){},matches(){return false;},
    getBoundingClientRect(){return{top:0,left:0,width:0,height:0,bottom:0,right:0};}
  };
  return e;
}
global.window={addEventListener(){},removeEventListener(){},location:{search:'',href:'',replace(){}},
  matchMedia(){return{matches:false,addEventListener(){}};},setTimeout:(f)=>0,Capacitor:undefined};
const __els={};
global.__els=__els;
global.document={getElementById(id){ if(!__els[id]) __els[id]=el(); return __els[id]; },querySelector(){return el();},querySelectorAll(){return [];},
  addEventListener(){},createElement(){return el();},body:el(),documentElement:{style:{setProperty(){}}},hidden:false};
global.localStorage={getItem:k=>(k in mem?mem[k]:null),setItem:(k,v)=>{mem[k]=String(v);},removeItem:k=>{delete mem[k];},key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length;}};
global.navigator={};global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;global.cancelAnimationFrame=()=>{};
global.setTimeout=(f,t)=>0;global.setInterval=()=>0;global.clearInterval=()=>{};global.clearTimeout=()=>{};
global.fetch=()=>Promise.reject(new Error('no net'));
global.alert=()=>{};global.confirm=()=>true;global.prompt=()=>null;

/* ── audio versions: one book, several recordings of different lengths ──
   A read-through points at a version with edId. No edId means version one,
   which is the original runtimeMin — so every read written before versions
   existed still measures against the same number it always did. */
const A=new Function(src+`;return {audioVersions,versionFor,readTotal,isAudioRead,
  minsListenedFor,progText,_audioMinsFrom,unitStr,lengthTag,readFmtButtons,
  streakName,FREEZE_PACKS,BOOK_DETAIL_FIELDS};`)();

let fail=0;
const ok=(n,c,got)=>{console.log((c?'  ok   ':'  FAIL ')+n+(c?'':'   ['+got+']'));if(!c)fail++;};

const GA={id:'ed1',label:'GraphicAudio',mins:673};      // 11h 13m
const AUD={id:'ed2',label:'Audible',mins:840};           // 14h
const yumi=()=>({title:'Yumi',pages:512,runtimeMin:0,editions:[GA,AUD],
  sessions:[],timerSessions:[]});

console.log('\n== VERSION LIST ==');
ok('a book with no audio at all lists nothing', A.audioVersions({pages:300}).length===0);
ok('the legacy runtime is version one',
   (A.audioVersions({runtimeMin:673})[0]||{}).mins===673);
ok('and is named Audiobook until renamed',
   (A.audioVersions({runtimeMin:673})[0]||{}).label==='Audiobook');
ok('audioLabel renames version one',
   (A.audioVersions({runtimeMin:673,audioLabel:'GraphicAudio'})[0]||{}).label==='GraphicAudio');
ok('extra versions follow it', A.audioVersions({runtimeMin:673,editions:[AUD]}).length===2);
ok('a zero runtime contributes no version one',
   A.audioVersions(yumi()).map(v=>v.label).join('|')==='GraphicAudio|Audible');

console.log('\n== WHICH LENGTH A READ MEASURES AGAINST ==');
const b=yumi();
ok('a print read still measures in pages',
   A.readTotal(b,{format:'print'})===512, A.readTotal(b,{format:'print'}));
ok('an audio read on GraphicAudio gets 11h 13m',
   A.readTotal(b,{format:'audio',edId:'ed1'})===673, A.readTotal(b,{format:'audio',edId:'ed1'}));
ok('the same book on Audible gets 14h',
   A.readTotal(b,{format:'audio',edId:'ed2'})===840, A.readTotal(b,{format:'audio',edId:'ed2'}));
ok('two reads of one book can hold different lengths at once',
   A.readTotal(b,{format:'audio',edId:'ed1'})!==A.readTotal(b,{format:'audio',edId:'ed2'}));

console.log('\n== BACKWARD COMPATIBILITY ==');
const old={pages:0,runtimeMin:678,sessions:[],timerSessions:[]};
ok('an old audio read with no edId still uses runtimeMin',
   A.readTotal(old,{format:'audio'})===678, A.readTotal(old,{format:'audio'}));
ok('an old print read is untouched', A.readTotal({pages:823},{format:'print'})===823);
ok('a book with neither reports nothing rather than guessing',
   A.readTotal({pages:0,runtimeMin:0},{format:'audio'})===0);

console.log('\n== A DELETED VERSION ==');
ok('the read reports no length rather than borrowing another',
   A.readTotal(b,{format:'audio',edId:'gone'})===0, A.readTotal(b,{format:'audio',edId:'gone'}));
ok('and never falls back to the page count',
   A.readTotal(b,{format:'audio',edId:'gone'})!==512);
ok('versionFor says plainly that it is gone', A.versionFor(b,{format:'audio',edId:'gone'})===null);
ok('progress text says no runtime set, not 0%',
   A.progText({format:'audio',edId:'gone'},0,0).toLowerCase().indexOf('no runtime')>=0,
   A.progText({format:'audio',edId:'gone'},0,0));

console.log('\n== LISTENED MINUTES ==');
function withReads(reads,sess){const x=yumi();x.sessions=reads;x.timerSessions=sess||[];return x;}
// Position is the furthest point reached, capped by that version's own length.
let m=withReads([{id:'r1',format:'audio',edId:'ed1'}],[{readId:'r1',fmt:'audio',endPage:300}]);
ok('a part-listened version counts its position', A.minsListenedFor(m)===300, A.minsListenedFor(m));
m=withReads([{id:'r1',format:'audio',edId:'ed1'}],[{readId:'r1',fmt:'audio',endPage:900}]);
ok('a position beyond that version is capped at ITS length, not the longest',
   A.minsListenedFor(m)===673, A.minsListenedFor(m));
m=withReads([{id:'r1',format:'audio',edId:'ed2'}],[{readId:'r1',fmt:'audio',endPage:900}]);
ok('the 14h version caps at 840', A.minsListenedFor(m)===840, A.minsListenedFor(m));
m=withReads([{id:'r1',format:'audio',edId:'ed1',end:'2026-09-01'},
             {id:'r2',format:'audio',edId:'ed2',end:'2026-09-14'}],[]);
ok('finishing both versions counts both lengths, not one twice',
   A.minsListenedFor(m)===673+840, A.minsListenedFor(m));
m=withReads([{id:'r1',format:'audio',edId:'gone',end:'2026-09-01'}],[]);
ok('a finished read whose version is gone adds nothing',
   A.minsListenedFor(m)===0, A.minsListenedFor(m));
m=withReads([{id:'r1',format:'print',end:'2026-09-01'}],[]);
ok('a print read never lands in the listening total', A.minsListenedFor(m)===0);

console.log('\n== THE HEARTH STILL PASSES A PLAIN NUMBER ==');
ok('a number applies to every read as before',
   A._audioMinsFrom(673,[{id:'r1',format:'audio',end:'x'}],[],false)===673);
ok('and still caps a position with it',
   A._audioMinsFrom(673,[{id:'r1',format:'audio'}],[{readId:'r1',fmt:'audio',endPage:9000}],false)===673);

console.log('\n== THE CARD SHOWS ONE TAG, NEVER A LIST ==');
const three={pages:512,runtimeMin:0,editions:[GA,AUD,{id:'ed3',label:'BBC',mins:390}]};
ok('nothing started: versions are counted, not named',
   A.lengthTag(three,null)==='512p \u00b7 3 audio versions', A.lengthTag(three,null));
ok('the tag never lists every version',
   A.lengthTag(three,null).indexOf('GraphicAudio')<0 && A.lengthTag(three,null).indexOf('BBC')<0);
ok('one version is named outright',
   A.lengthTag({pages:512,editions:[GA]},null)==='512p \u00b7 GraphicAudio \u00b7 11h 13m',
   A.lengthTag({pages:512,editions:[GA]},null));
ok('reading the GraphicAudio: the tag follows that read',
   A.lengthTag(three,{format:'audio',edId:'ed1'})==='GraphicAudio \u00b7 11h 13m',
   A.lengthTag(three,{format:'audio',edId:'ed1'}));
ok('switching to Audible changes the tag',
   A.lengthTag(three,{format:'audio',edId:'ed2'})==='Audible \u00b7 14h',
   A.lengthTag(three,{format:'audio',edId:'ed2'}));
ok('a print read shows pages only',
   A.lengthTag(three,{format:'print'})==='512p', A.lengthTag(three,{format:'print'}));
ok('a deleted version says so instead of showing a length',
   A.lengthTag(three,{format:'audio',edId:'gone'})==='no runtime set',
   A.lengthTag(three,{format:'audio',edId:'gone'}));
ok('Karamazov is unchanged: pages, no audio clause',
   A.lengthTag({pages:823},null)==='823p', A.lengthTag({pages:823},null));
ok('an old single-runtime book still names its one version',
   A.lengthTag({pages:0,runtimeMin:678},null)==='Audiobook \u00b7 11h 18m',
   A.lengthTag({pages:0,runtimeMin:678},null));

console.log('\n== FORMAT BUTTONS ARE BUILT FROM WHAT EXISTS ==');
const btn=(b,r)=>A.readFmtButtons(b,r,0);
ok('pages only: one Print button',
   (btn({pages:823},{format:'print'}).match(/<button/g)||[]).length===1,
   btn({pages:823},{format:'print'}));
ok('pages plus three versions: four buttons',
   (btn(three,{format:'print'}).match(/<button/g)||[]).length===4);
ok('each version is named on its own button',
   btn(three,{format:'print'}).indexOf('>BBC<')>=0 && btn(three,{format:'print'}).indexOf('>Audible<')>=0);
ok('no pages and one version: no Print button offered',
   (btn({pages:0,editions:[GA]},{format:'audio',edId:'ed1'}).match(/<button/g)||[]).length===1,
   btn({pages:0,editions:[GA]},{format:'audio',edId:'ed1'}));
ok('but a print read always keeps its own button, even with no page count',
   btn({pages:0,editions:[GA]},{format:'print'}).indexOf('Print')>=0);
ok('the version in use is the one marked on',
   /class="on" onclick="setReadFormat\(0,'audio','ed2'\)"/.test(btn(three,{format:'audio',edId:'ed2'})),
   btn(three,{format:'audio',edId:'ed2'}));
ok('a deleted version still gets a button so the read is not stranded',
   btn(three,{format:'audio',edId:'gone'}).indexOf('Removed version')>=0);
ok('and that button is not offered when the version exists',
   btn(three,{format:'audio',edId:'ed1'}).indexOf('Removed version')<0);

console.log('\n== VERSIONS TRAVEL WITH THE BOOK ==');
ok('editions are carried between lists', A.BOOK_DETAIL_FIELDS.indexOf('editions')>=0);
ok('so is the name of version one', A.BOOK_DETAIL_FIELDS.indexOf('audioLabel')>=0);

console.log('\n== STREAK NAMES SIT ON TOP OF THE BADGES ==');
ok('under three days has no name yet', A.streakName(2).name==='');
ok('three days is Cinderling', A.streakName(3).name==='Cinderling');
ok('51 days is Hearthkeeper', A.streakName(51).name==='Hearthkeeper', A.streakName(51).name);
ok('90 is Promethean', A.streakName(90).name==='Promethean');
ok('120 is Hestian', A.streakName(120).name==='Hestian');
ok('200 is still Beacon \u2014 Radiant Vigil comes at 210',
   A.streakName(200).name==='Beacon' && A.streakName(210).name==='Radiant Vigil');
ok('340 is Pyre Eternal and nothing follows it',
   A.streakName(340).name==='Pyre Eternal' && A.streakName(9999).next==='');
ok('the next name is named with its day', A.streakName(51).next==='Promethean' && A.streakName(51).at===90);
const RUNGS=[3,5,7,10,14,21,30,45,60,90,120,160,210,270,340,420,510,610,730,900,1100,1400,1800,2400,3650];
ok('names land on days that also award a badge',
   [3,7,30,90,120,160,210,340].every(d=>RUNGS.indexOf(d)>=0));

console.log('\n== FREEZE PRICES ==');
ok('one freeze is 50 embers', A.FREEZE_PACKS[1]===50);
ok('five are 200', A.FREEZE_PACKS[5]===200);
ok('the pack is cheaper than five singles', A.FREEZE_PACKS[5] < A.FREEZE_PACKS[1]*5);

console.log(fail?'\n'+fail+' FAILED':'\nAUDIO VERSIONS CLEAN');
process.exit(fail?1:0);
