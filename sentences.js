/* Babel — sentence splitting for per-sentence composing.
 *
 * One unparseable clause currently costs the whole entry: the model drops it,
 * the guard refuses the output, and 1,500 words of good writing go uncomposed
 * because of six bad ones. Composing a sentence at a time contains the damage
 * to the sentence it happened in.
 *
 * The only property that really matters here is that this is LOSSLESS. These
 * pieces are his writing; if rejoining them does not reproduce the entry
 * character for character, the feature silently eats his text. Every split
 * keeps its own trailing punctuation and whitespace, and `rejoin` is a plain
 * concatenation — there is no cleverness to go wrong.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sentences = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // A hard cap so one run-on paragraph does not become a single huge piece and
  // put us back where we started. Past this, break at a comma or a semicolon,
  // and failing that leave it whole — an over-long piece is worse handled than
  // a split one, but a piece cut mid-phrase is worse than either.
  var MAX = 420;

  function splitLong(piece) {
    if (piece.length <= MAX) return [piece];
    var out = [], rest = piece;
    while (rest.length > MAX) {
      // Look for a clause break in the back half, so the pieces stay balanced.
      var window = rest.slice(Math.floor(MAX / 2), MAX);
      var m = window.lastIndexOf('; ');
      var at = m >= 0 ? m + 2 : window.lastIndexOf(', ');
      if (at < 0) break;                       // nothing to cut on; leave it
      var cut = Math.floor(MAX / 2) + at + (m >= 0 ? 0 : 2);
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    out.push(rest);
    return out;
  }

  // "the ending of ch. 12 got me" is one sentence, not two. The tempting rule —
  // don't break when the next letter is lowercase — is wrong here, because he
  // writes "chapters 7-8 were terrible. pacing fell apart", and that really is
  // two sentences. So the test is on the word before the stop, not after it.
  var ABBREV = {};
  ('mr mrs ms dr st jr sr prof vs etc eg ie ch chap chs p pp pg vol no nos fig ' +
   'approx cf al jan feb mar apr jun jul aug sept sep oct nov dec')
    .split(' ').forEach(function (w) { ABBREV[w] = 1; });

  function endsAbbrev(s, dot) {
    var k = dot, w = '';
    while (k >= 0 && /[A-Za-z.]/.test(s[k])) { w = s[k] + w; k--; }
    return ABBREV[w.replace(/\./g, '').toLowerCase()] === 1;
  }

  // Splits after . ! ? (and any closing quote or bracket that follows), taking
  // the trailing whitespace with the piece so nothing lives between pieces.
  function split(text) {
    var s = String(text == null ? '' : text);
    if (!s) return [];
    var out = [], start = 0, i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '.' || c === '!' || c === '?') {
        if (c === '.' && endsAbbrev(s, i)) { i++; continue; }
        var j = i + 1;
        while (j < s.length && /[.!?)\]"'”’]/.test(s[j])) j++;
        // Only a break if whitespace follows; "e.g." and "3.5" stay intact.
        if (j >= s.length || /\s/.test(s[j])) {
          while (j < s.length && /\s/.test(s[j])) j++;
          out.push(s.slice(start, j));
          start = j; i = j; continue;
        }
        i = j; continue;
      }
      i++;
    }
    if (start < s.length) out.push(s.slice(start));
    var pieces = [];
    out.forEach(function (p) { splitLong(p).forEach(function (q) { pieces.push(q); }); });
    return pieces;
  }

  function rejoin(pieces) { return (pieces || []).join(''); }

  // What the model is handed, and what to put back around its answer. Leading
  // and trailing whitespace is the join's business, not the model's.
  function body(piece) { return String(piece || '').trim(); }
  function reclothe(piece, newBody) {
    var s = String(piece || '');
    var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0];
    return lead + newBody + tail;
  }

  return { split: split, rejoin: rejoin, body: body, reclothe: reclothe, MAX: MAX };
}));
