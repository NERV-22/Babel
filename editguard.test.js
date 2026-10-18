/* Tests for the edit guard.
 *
 * The cases that matter are not invented: entries 1 and 2 and the model outputs
 * below are what Qwen2.5-1.5B and Mistral-7B actually produced on the phone.
 * If the guard cannot undo those, it does not work.
 */
const guard = require('./editguard.js');

let fail = 0, n = 0;
const ok = (name, cond, got) => {
  n++;
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '   [' + got + ']'));
  if (!cond) fail++;
};

const E1 = 'chapters 1-4 were good, really makes me excited for the rest. the setup with the two families is doing a lot of work and i like how little the narrator explains';
const E2 = 'chapters 7-8 were terrible. pacing fell apart and the new character feels like a device. losing interest honestly';

console.log('\n== THE REAL QWEN OUTPUT ==');
// 45% of his words survived this. The guard has to put them back.
const QWEN2 = 'The pacing in chapters 7-8 felt disjointed, leading to a loss of interest. The introduction of a new character felt more like a crutch than a genuine addition to the narrative.';
let r = guard(E2, QWEN2);
// This is a rewrite, not a copy-edit. Repairing it word by word yielded
// "The in chapters 7-8 terrible. pacing fell apart and to a of The of a new..."
// — every word present, nothing readable. So it must be refused outright.
ok('it is rejected, not patched up', r.rejected === true, JSON.stringify(r.reason));
ok('his own text comes back byte for byte', r.text === E2, r.text);
ok('no function-word debris is left behind', !/\bin the of my\b|\band to a of\b/i.test(r.text), r.text);
ok('the reason says how many edits were refused', /refused edits/.test(r.reason || ''), r.reason);
ok('"terrible" is still there, because nothing was touched', /terrible/.test(r.text));

console.log('\n== THE REAL MISTRAL OUTPUT (8.5x padding) ==');
const MISTRAL2 = 'In the course of my reading, chapters 7 and 8 proved to be a significant departure from the engaging narrative that had previously captivated me. The pacing, which had been meticulously maintained up until this point, seemed to falter, causing a disconnect that was difficult to overlook. The introduction of a new character in these chapters felt less like a natural progression of the story and more like a contrived device, serving a purpose that did not align with the overall narrative arc. As a result, my interest in continuing with the book has waned. It is with a heavy heart that I acknowledge this temporary loss of enthusiasm, hoping that the narrative will regain its former luster in the subsequent chapters.';
r = guard(E2, MISTRAL2);
ok('rejected outright', r.rejected === true, JSON.stringify(r.reason));
ok('his text is returned exactly', r.text === E2, r.text);
ok('nothing is padded, because nothing was kept', r.text.length === E2.length, r.text.length + ' vs ' + E2.length);
ok('the heavy heart never arrives', !/heavy heart|luster|meticulously/i.test(r.text), r.text.slice(0, 120));

console.log('\n== A GOOD COPY-EDIT IS LEFT ALONE ==');
// This is what we actually want a model to return. The guard must not fight it.
const GOOD2 = 'Chapters 7-8 were terrible. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.';
r = guard(E2, GOOD2);
ok('nothing is reverted', r.reverts.length === 0, JSON.stringify(r.reverts));
ok('the corrected text is returned as written', r.text === GOOD2, r.text);
ok('capitalisation changes are accepted', r.accepted.some(a => a.kind === 'punct'));

console.log('\n== THE SYNONYM TRAP ==');
// "terrible" -> "horrible" is TWO edits apart. A plain distance rule accepts it.
ok('terrible/horrible are distance 2', guard.dist('terrible', 'horrible', 3) === 2, guard.dist('terrible', 'horrible', 3));
ok('but it is refused as a spelling fix', !guard.isSpellingFix('terrible', 'horrible'));
r = guard('ch 7 was terrible', 'Ch 7 was horrible');
ok('so the guard keeps "terrible"', /terrible/i.test(r.text) && !/horrible/i.test(r.text), r.text);
ok('bad -> sad is refused too', !guard.isSpellingFix('bad', 'sad'));
ok('good -> food is refused', !guard.isSpellingFix('good', 'food'));

console.log('\n== REAL TYPOS ARE STILL FIXED ==');
ok('dialouge -> dialogue', guard.isSpellingFix('dialouge', 'dialogue'));
ok('charcter -> character', guard.isSpellingFix('charcter', 'character'));
ok('devise -> device', guard.isSpellingFix('devise', 'device'));
r = guard('the dialouge is stiff and the charcter is flat', 'The dialogue is stiff, and the character is flat.');
ok('a sentence of typos comes back fixed', /dialogue/.test(r.text) && /character/.test(r.text), r.text);
ok('and nothing was reverted', r.reverts.length === 0, JSON.stringify(r.reverts));

console.log('\n== NUMBERS AND REFERENCES ARE LOCKED ==');
r = guard(E1, 'The first four chapters were good, really making me excited for the rest.');
ok('"1-4" cannot be paraphrased away', /1-4/.test(r.text), r.text);
r = guard('p. 147 dragged', 'Page 200 dragged.');
ok('a page number cannot be changed', /147/.test(r.text) && !/200/.test(r.text), r.text);
ok('and the change is reported as a number revert',
   guard('p. 147 dragged', 'Page 200 dragged.').reverts.some(x => x.kind === 'number'));

console.log('\n== FUNCTION WORDS MAY MOVE ==');
r = guard('pacing fell apart and new character feels like device', 'The pacing fell apart, and the new character feels like a device.');
ok('"the" and "a" may be added', r.reverts.length === 0, JSON.stringify(r.reverts));
ok('they show up as accepted additions', r.accepted.some(a => a.kind === 'added-function'));
ok('content is untouched', /pacing fell apart/i.test(r.text) && /device/i.test(r.text), r.text);

console.log('\n== A LIGHT EDIT IS APPLIED, NOT REJECTED ==');
// One refused change should not throw away an otherwise good copy-edit.
r = guard(E2, 'Chapters 7-8 were awful. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.');
ok('it is accepted despite one bad swap', r.rejected === false, JSON.stringify(r.reason));
ok('the one swap is undone', /terrible/.test(r.text) && !/awful/.test(r.text), r.text);
ok('the punctuation fixes are kept', /Pacing fell apart, and/.test(r.text), r.text);
ok('and it reads properly', r.text === 'Chapters 7-8 were terrible. Pacing fell apart, and the new character feels like a device. Losing interest, honestly.', r.text);

console.log('\n== A RUN OF FILLER IS CAPPED ==');
// Padding that is made entirely of function words would otherwise slip past
// the content checks: every added word is individually harmless, and the run
// as a whole is still padding. Two in a row is a grammar fix; more is not.
r = guard(E2, 'Chapters 7-8 were terrible. Pacing fell apart, and it is that the new character feels like a device. Losing interest, honestly.');
ok('the run is cut off after two', !/it is that/i.test(r.text), r.text);
ok('the first two are allowed through', /it is/i.test(r.text), r.text);
ok('the rest is counted as a refused edit', r.reverts.some(x => x.kind === 'insertion'), JSON.stringify(r.reverts));
ok('his own words are all still there', /terrible/.test(r.text) && /device/.test(r.text), r.text);

console.log('\n== DEGENERATE INPUT ==');
ok('empty model output returns the original', guard(E2, '').text === E2);
ok('and is marked rejected', guard(E2, '').rejected === true);
ok('an unchanged entry passes through', guard(E2, E2).reverts.length === 0);
ok('and is not rejected', guard(E2, E2).rejected === false);
r = guard(E1, 'I\'m glad to hear you are enjoying the first four chapters!');
ok('a model that replies instead of editing is rejected', r.rejected === true, JSON.stringify(r.reason));
ok('and his entry is returned untouched', r.text === E1, r.text.slice(0, 90));

console.log('\n== LONGER REAL ENTRY ==');
const LONG = 'So far, I feel like they book isn\'t amazing but still pretty decent. Its torture, revenge across 3 different layers, long seated resentment and hatred against people. Not entirely sure how to feel but these are my thoughts so far';
const SOFT = 'So far, I feel that the book is not exceptional, though it remains quite satisfactory. It explores torture and revenge across three distinct layers, alongside deep-seated resentment toward others. I am not entirely certain how to feel, but these are my reflections thus far.';
r = guard(LONG, SOFT);
ok('the softened rewrite is rejected', r.rejected === true, JSON.stringify(r.reason));
ok('his entry comes back exactly as written', r.text === LONG, r.text.slice(0, 110));
ok('"amazing" is not upgraded to "exceptional"', /amazing/i.test(r.text) && !/exceptional/i.test(r.text), r.text.slice(0, 110));
ok('"3" is not spelled out', /\b3\b/.test(r.text), r.text.slice(0, 140));
ok('"thoughts" is not "reflections"', /thoughts/i.test(r.text) && !/reflections/i.test(r.text), r.text.slice(-70));

console.log('\n== THE SAME ENTRY, GENUINELY COPY-EDITED ==');
const LONGFIX = 'So far, I feel like they book isn\'t amazing but still pretty decent. It\'s torture, revenge across 3 different layers, long seated resentment and hatred against people. Not entirely sure how to feel, but these are my thoughts so far.';
r = guard(LONG, LONGFIX);
ok('a real copy-edit of a long entry is accepted', r.rejected === false, JSON.stringify(r.reason));
ok('"Its" becomes "It\'s"', /It's torture/.test(r.text), r.text.slice(60, 120));
ok('his wording is otherwise intact', /isn't amazing but still pretty decent/.test(r.text), r.text.slice(0, 90));

console.log(fail ? '\n' + fail + ' of ' + n + ' FAILED' : '\nGUARD CLEAN — ' + n + ' checks');
process.exit(fail ? 1 : 0);
