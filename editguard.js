/* Babel — edit guard.
 *
 * A small model asked to copy-edit will quietly improve you: "terrible" becomes
 * "a significant departure", "fell apart" becomes "felt disjointed". Research on
 * this (arXiv 2604.22142) found voice-preserving prompts cut the effect by about
 * a third and never changed its direction — the model removes your words whether
 * or not you ask it not to.
 *
 * So this does not ask. It takes what the model returned and throws away every
 * change that is not a spelling, punctuation, capitalisation or sentence-break
 * fix, putting the writer's own word back. Retention of content words is then a
 * property of this file, not of the model.
 *
 * Runs in Node (tests) and in the browser (the app).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EditGuard = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Words the guard will let the model add or drop. Everything here is
  // grammatical scaffolding — nothing in this list carries a judgement, so
  // moving one around cannot change what the writer said.
  var FREE = {};
  ('a an the and or but of to in on at for with that this it its is are was were ' +
   'be been am as so i my me he she they them his her you your we our not no do ' +
   'does did have has had will would can could just then than there here').split(' ')
    .forEach(function (w) { FREE[w] = 1; });

  // ── tokenising ────────────────────────────────────────────────────────────
  // A token keeps its own punctuation on the side, so "terrible." and
  // "terrible" compare equal while the output's punctuation is still available
  // to accept. The core is lowercased for comparison only; what gets emitted is
  // always a raw token from one side or the other.
  function tokenise(text) {
    var out = [];
    String(text || '').split(/\s+/).forEach(function (raw) {
      if (!raw) return;
      var m = raw.match(/^([^\w'"]*)(.*?)([^\w]*)$/);
      var core = m ? m[2] : raw;
      out.push({
        raw: raw,
        lead: m ? m[1] : '',
        core: core,
        trail: m ? m[3] : '',
        key: core.toLowerCase().replace(/[^a-z0-9'\-]/g, '')
      });
    });
    return out;
  }

  // A token that must survive untouched: digits, chapter and page references,
  // ranges. "chapters 1-4" becoming "the first four chapters" is the exact
  // failure this catches — the number is gone, so the edit is refused.
  function isLocked(t) {
    return /\d/.test(t.key);
  }
  function isFree(t) {
    return FREE[t.key] === 1;
  }

  // ── Damerau-Levenshtein, capped ───────────────────────────────────────────
  function dist(a, b, cap) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var prev2 = [], prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], prev2[j - 2] + 1);   // transposition
        }
      }
      prev2 = prev; prev = cur;
    }
    return cur[b.length];
  }

  // Is replacing `from` with `to` a believable typo fix rather than a different
  // word? The first letter must hold and the distance must be small relative to
  // the word's length. This is what stops "terrible" → "horrible": they are two
  // edits apart, which a plain distance rule would wave through, but the opening
  // letter changes and that is not how a misspelling behaves.
  function isSpellingFix(from, to) {
    if (!from || !to) return false;
    if (from === to) return true;
    if (from[0] !== to[0]) return false;
    var limit = from.length >= 7 ? 2 : 1;
    return dist(from, to, limit) <= limit;
  }

  // ── longest common subsequence over token keys ────────────────────────────
  function lcs(a, b) {
    var n = a.length, m = b.length, i, j;
    var T = new Array(n + 1);
    for (i = 0; i <= n; i++) { T[i] = new Int32Array(m + 1); }
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        T[i][j] = (a[i].key && a[i].key === b[j].key)
          ? T[i + 1][j + 1] + 1
          : Math.max(T[i + 1][j], T[i][j + 1]);
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i].key && a[i].key === b[j].key) { ops.push({ op: 'same', a: i, b: j }); i++; j++; }
      else if (T[i + 1][j] >= T[i][j + 1]) { ops.push({ op: 'del', a: i }); i++; }
      else { ops.push({ op: 'ins', b: j }); j++; }
    }
    while (i < n) { ops.push({ op: 'del', a: i }); i++; }
    while (j < m) { ops.push({ op: 'ins', b: j }); j++; }
    return ops;
  }

  // A deletion immediately followed by an insertion is one word swapped for
  // another, not two separate edits. Pairing them is what lets the spelling
  // test see both halves at once.
  // A run of changes comes out of the aligner as all the removals and then all
  // the additions, not neatly alternating. Pairing only an adjacent del+ins
  // would read three swapped words as three deletions and three insertions,
  // and the guard would then refuse them for the wrong reason. Zip each run
  // instead: equal halves are substitutions, and whatever is left over really
  // was dropped or really was invented.
  function pair(ops) {
    var out = [], k = 0;
    while (k < ops.length) {
      if (ops[k].op === 'del' || ops[k].op === 'ins') {
        var dels = [], inss = [], i;
        while (k < ops.length && (ops[k].op === 'del' || ops[k].op === 'ins')) {
          (ops[k].op === 'del' ? dels : inss).push(ops[k]); k++;
        }
        var m = Math.min(dels.length, inss.length);
        for (i = 0; i < m; i++) out.push({ op: 'sub', a: dels[i].a, b: inss[i].b });
        for (i = m; i < dels.length; i++) out.push(dels[i]);
        for (i = m; i < inss.length; i++) out.push(inss[i]);
        continue;
      }
      out.push(ops[k]); k++;
    }
    return out;
  }

  // "eye rolling" -> "eye-rolling" is two tokens becoming one, which the walk
  // below would read as a substitution plus a deleted word, and a deleted word
  // is disqualifying. So a real copy-edit got refused. The join is only treated
  // as a fix when the letters match exactly either side of it, ignoring
  // hyphens — nothing can be smuggled in or lost through this door.
  function fuseCompounds(ops, A, B) {
    var out = [], k = 0;
    var bare = function (s) { return String(s || '').replace(/-/g, ''); };
    while (k < ops.length) {
      var o = ops[k], nx = ops[k + 1];
      if (o.op === 'sub' && nx && nx.op === 'del' &&
          bare(A[o.a].key) + bare(A[nx.a].key) === bare(B[o.b].key) && B[o.b].key) {
        out.push({ op: 'join', a: o.a, a2: nx.a, b: o.b }); k += 2; continue;
      }
      // and the other way: "takeaway" -> "take away"
      if (o.op === 'sub' && nx && nx.op === 'ins' &&
          bare(A[o.a].key) === bare(B[o.b].key) + bare(B[nx.b].key) && A[o.a].key) {
        out.push({ op: 'join', a: o.a, b: o.b, b2: nx.b }); k += 2; continue;
      }
      out.push(o); k++;
    }
    return out;
  }

  function join(tokens) {
    return tokens.map(function (t) { return t.lead + t.core + t.trail; })
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * guard(original, modelOutput) -> { text, reverts[], accepted[], kept }
   * `text` is the model's output with every unsafe change undone.
   */
  function guard(original, modelOutput) {
    var A = tokenise(original), B = tokenise(modelOutput);
    if (!B.length) return { text: String(original || ''), rejected: true, reason: 'the model returned nothing',
                            reverts: [{ kind: 'empty' }], accepted: [], kept: 100, lost: [] };

    var ops = fuseCompounds(pair(lcs(A, B)), A, B);
    var out = [], reverts = [], accepted = [], run = 0;

    ops.forEach(function (o) {
      if (o.op !== 'ins') run = 0;
      if (o.op === 'join') {
        out.push(B[o.b]);
        if (typeof o.b2 === 'number') out.push(B[o.b2]);
        accepted.push({ kind: 'compound',
          from: A[o.a].raw + (typeof o.a2 === 'number' ? ' ' + A[o.a2].raw : ''),
          to: B[o.b].raw + (typeof o.b2 === 'number' ? ' ' + B[o.b2].raw : '') });
        return;
      }
      if (o.op === 'same') {
        // Same word: take the model's copy, which carries its punctuation and
        // capitalisation. That is the whole of what it is allowed to fix.
        var ta = A[o.a], tb = B[o.b];
        out.push(tb);
        if (ta.raw !== tb.raw) accepted.push({ kind: 'punct', from: ta.raw, to: tb.raw });
        return;
      }
      if (o.op === 'sub') {
        var fa = A[o.a], fb = B[o.b];
        if (!isLocked(fa) && isSpellingFix(fa.key, fb.key)) {
          out.push(fb); accepted.push({ kind: 'spelling', from: fa.raw, to: fb.raw });
        } else {
          // Keep the writer's word, but let the model's punctuation stand.
          out.push({ lead: fa.lead, core: fa.core, trail: fb.trail || fa.trail, raw: fa.raw, key: fa.key });
          reverts.push({ kind: isLocked(fa) ? 'number' : 'word', from: fa.raw, to: fb.raw });
        }
        return;
      }
      if (o.op === 'del') {
        var td = A[o.a];
        if (isFree(td) && !isLocked(td)) { accepted.push({ kind: 'dropped-function', from: td.raw }); return; }
        out.push(td);
        reverts.push({ kind: 'deletion', from: td.raw });
        return;
      }
      // insertion
      var ti = B[o.b];
      // A grammar fix adds "the" or "and the". Three function words in a row is
      // padding wearing a grammar costume, so the run is capped.
      if (isFree(ti) && !isLocked(ti) && run < 2) {
        out.push(ti); run++; accepted.push({ kind: 'added-function', to: ti.raw }); return;
      }
      reverts.push({ kind: 'insertion', to: ti.raw });
    });

    // All or nothing. Repairing a rewrite word by word puts every one of his
    // words back and still leaves unreadable debris — "In the of my chapters
    // 7-8 terrible." A guarded result is only worth having if the model made a
    // copy-edit in the first place; past a handful of refused changes the
    // honest answer is that the model did not do the job, and his own text
    // stands untouched.
    // A deleted content word is disqualifying on its own, however few there are.
    // Fixing spelling, punctuation or sentence breaks never requires removing a
    // word, so a deletion means the model did something other than copy-edit.
    // And unlike an invented word — which can simply be dropped — putting a
    // deleted word back inserts it into a sentence that has shifted around it:
    // "chapters 1-4 were good. really makes excited The rest." Every word is
    // present and the sentence is wreckage. Found by Claude Code against the
    // real model; the budget alone let it through at 4 reverts against 5.
    var dropped = reverts.filter(function (r) { return r.kind === 'deletion'; });
    var budget = Math.max(2, Math.round(A.length * 0.15));
    if (dropped.length || reverts.length > budget) {
      return {
        text: String(original || ''), rejected: true,
        reason: dropped.length
          ? dropped.length + ' of your words were dropped (' +
            dropped.slice(0, 5).map(function (r) { return r.from; }).join(', ') + ')'
          : reverts.length + ' refused edits, over a budget of ' + budget,
        reverts: reverts, accepted: [], kept: 100, lost: []
      };
    }

    var text = join(out);
    var low = text.toLowerCase();
    var content = A.filter(function (t) { return t.key && !isFree(t); });
    var lost = content.filter(function (t) { return low.indexOf(t.key) === -1; });
    var kept = content.length ? Math.round((content.length - lost.length) / content.length * 100) : 100;

    return { text: text, rejected: false, reverts: reverts, accepted: accepted,
             kept: kept, lost: lost.map(function (t) { return t.core; }) };
  }

  guard.tokenise = tokenise;
  guard.isSpellingFix = isSpellingFix;
  guard.dist = dist;
  return guard;
}));
