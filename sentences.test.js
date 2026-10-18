/* Tests for the sentence splitter.
 *
 * The first section is the one that matters: these pieces are Patrick's
 * writing, and if rejoining them does not reproduce the entry exactly then the
 * feature quietly eats his text. Everything else is a nicety.
 */
const S = require('./sentences.js');

let fail = 0, n = 0;
const ok = (name, cond, got) => {
  n++;
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '   [' + got + ']'));
  if (!cond) fail++;
};

const CORPUS = [
  'chapters 7-8 were terrible. pacing fell apart and the new character feels like a device. losing interest honestly',
  'So far, I feel like they book isn\'t amazing but still pretty decent. Its torture, revenge across 3 different layers, long seated resentment and hatred against people. Not entirely sure how to feel but these are my thoughts so far',
  'Just a masterpiece.',
  'i gave it 4.5/5 due to the lack of reading experience, e.g. i havent read much gothic stuff. still think its great!!',
  'no punctuation at all just a run on that keeps going and going without ever stopping because that is how i type sometimes',
  'Part 1 was slow.  Part 2 picked up!   Then it ended.',
  '',
  '   ',
  'One sentence without a full stop',
  'Ends with a quote. "That was the line that got me." And then more.',
  'A very long one that goes on, and on, and on, and keeps adding clauses, and more clauses, and still more, well past any reasonable length, so that the long-splitter has to find somewhere to cut it, and it should still come back whole, and it really is quite long now, and continues, and continues further, and yet more, and further still, and onward, and past the cap, and beyond it again, and still it has not stopped, and here is more of it, and more again, until finally it stops.'
];

console.log('\n== LOSSLESS, ALWAYS ==');
CORPUS.forEach((t, i) => {
  ok('corpus[' + i + '] rejoins exactly', S.rejoin(S.split(t)) === t,
     JSON.stringify(S.rejoin(S.split(t))) + ' vs ' + JSON.stringify(t));
});

console.log('\n== LOSSLESS UNDER FUZZING ==');
// Random text from the characters his entries actually contain, because a
// splitter that only survives tidy prose is no use on a phone at 1am.
const ALPHA = 'abc ABC .!?,;\'"()-123\n\t  ';
let worst = null;
for (let k = 0; k < 4000; k++) {
  let t = '';
  const len = Math.floor(Math.random() * 90);
  for (let j = 0; j < len; j++) t += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  if (S.rejoin(S.split(t)) !== t) { worst = t; break; }
}
ok('4,000 random strings all rejoin exactly', worst === null, JSON.stringify(worst));

console.log('\n== IT SPLITS WHERE IT SHOULD ==');
ok('two sentences become two pieces', S.split('One. Two.').length === 2, S.split('One. Two.').length);
ok('three become three', S.split('A. B! C?').length === 3, JSON.stringify(S.split('A. B! C?')));
ok('one sentence stays one', S.split('Just a masterpiece.').length === 1);
ok('no terminator at all stays one', S.split('no punctuation here at all').length === 1);
ok('a quote after the stop goes with its own piece',
   S.split('He said "stop." Then he left.').length === 2,
   JSON.stringify(S.split('He said "stop." Then he left.')));

console.log('\n== IT DOES NOT SPLIT WHERE IT MUST NOT ==');
ok('a decimal rating is not a sentence end', S.split('i gave it 4.5/5 overall').length === 1,
   JSON.stringify(S.split('i gave it 4.5/5 overall')));
ok('"e.g." is not a sentence end', S.split('gothic stuff e.g. Poe and others').length === 1,
   JSON.stringify(S.split('gothic stuff e.g. Poe and others')));
ok('"ch. 12" is not a sentence end', S.split('the ending of ch. 12 got me').length === 1,
   JSON.stringify(S.split('the ending of ch. 12 got me')));

console.log('\n== WHITESPACE BELONGS TO THE PIECE, NOT THE GAP ==');
const spaced = S.split('Part 1 was slow.  Part 2 picked up!   Then it ended.');
ok('double spaces are carried, not lost', S.rejoin(spaced) === 'Part 1 was slow.  Part 2 picked up!   Then it ended.');
ok('each piece except the last ends in whitespace',
   spaced.slice(0, -1).every(p => /\s$/.test(p)), JSON.stringify(spaced));

console.log('\n== BODY AND RECLOTHE ROUND-TRIP ==');
spaced.forEach((p, i) => {
  ok('piece ' + i + ' survives body/reclothe untouched', S.reclothe(p, S.body(p)) === p,
     JSON.stringify(S.reclothe(p, S.body(p))) + ' vs ' + JSON.stringify(p));
});
ok('reclothe puts a new body in the old clothes',
   S.reclothe('  hello.  ', 'Hello.') === '  Hello.  ',
   JSON.stringify(S.reclothe('  hello.  ', 'Hello.')));

console.log('\n== LONG PIECES GET BROKEN UP ==');
const long = CORPUS[10];
const lp = S.split(long);
ok('the long run-on is cut into pieces', lp.length > 1, lp.length);
ok('and still rejoins exactly', S.rejoin(lp) === long);
ok('no piece is wildly over the cap', lp.every(p => p.length <= S.MAX + 40),
   JSON.stringify(lp.map(p => p.length)));
const unsplittable = 'x'.repeat(900);
ok('something with nowhere to cut is left whole rather than cut mid-word',
   S.split(unsplittable).length === 1, S.split(unsplittable).length);
ok('  and it still rejoins', S.rejoin(S.split(unsplittable)) === unsplittable);
// A long run-on with no clause breaks at all: better one oversized piece than
// pieces that start and end mid-word.
const runon = 'no punctuation at all just a run on that keeps going '.repeat(12);
ok('a long run-on with nothing to cut on stays whole', S.split(runon).length === 1,
   JSON.stringify(S.split(runon).map(p => p.length)));
ok('no piece ever ends in the middle of a word',
   S.split(CORPUS[10]).slice(0, -1).every(p => /[\s,;]$/.test(p)),
   JSON.stringify(S.split(CORPUS[10]).map(p => p.slice(-12))));

console.log('\n== DEGENERATE ==');
ok('empty string gives no pieces', S.split('').length === 0);
ok('null is handled', S.split(null).length === 0);
ok('whitespace only rejoins exactly', S.rejoin(S.split('   ')) === '   ');

console.log(fail ? '\n' + fail + ' of ' + n + ' FAILED' : '\nSPLITTER CLEAN — ' + n + ' checks');
process.exit(fail ? 1 : 0);
