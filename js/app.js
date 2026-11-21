/* =====================================================================
   La Parola di Dio: dettatura o ispirazione? — motore di proiezione
   Vanilla JS, nessuna dipendenza. Tutto il testo viene da data.js.
   ===================================================================== */
(function () {
  'use strict';

  const SC = window.SCENES;
  const N = SC.length;

  /* ---------------- parametri di regia ---------------- */
  const Z = 7;                 // ingrandimento mappa → scena
  const REDUCED = /statico/.test(location.search) ||
    (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ZOOM_MS = REDUCED ? 450 : 1150;
  const HOLD_MS = REDUCED ? 250 : 700;
  const FADE_MS = REDUCED ? 250 : 560;
  const IDLE_MS = 2500;

  /* posizione delle tappe sul palco (frazioni di larghezza/altezza): una per parte (scena con `sec`),
     distribuite lungo la diagonale del sentiero. Il numero di parti dipende dalla lezione. */
  const NSEC = Math.max(1, SC.filter((s, i) => s.sec || i === 0).length);
  /* LA TENDA: pianta del tabernacolo (atrio · Santo · Santo dei Santi). Con 7 parti: 4 nell'atrio,
     2 nel Santo, 1 nel Santo dei Santi; le tappe zigzagano per non sovrapporre le etichette. */
  const TENT_X = [.085, .24, .40, .60, .72, .88];   // porta · altare · conca · candelabro · incenso · arca
  const STATIONS = Array.from({ length: NSEC }, (_, k) => {
    if (NSEC === 6) return { x: TENT_X[k], y: .62 };
    const t = NSEC > 1 ? k / (NSEC - 1) : 0;
    return { x: .1 + .8 * t, y: k % 2 ? .57 : .75 };
  });
  const MAPCAM = { x: .5, y: .5, z: 1 };

  /* ---------------- utilità DOM ---------------- */
  function el(tag, cls, kids) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (kids != null) add(e, kids);
    return e;
  }
  function add(e, k) {
    if (Array.isArray(k)) k.forEach(x => add(e, x));
    else if (k == null || k === false) { /* niente */ }
    else if (typeof k === 'string') e.appendChild(document.createTextNode(k));
    else e.appendChild(k);
    return e;
  }
  function tx(tag, cls, text) { const e = el(tag, cls); e.textContent = text; return e; }
  const isArabic = s => /[؀-ۿ]/.test(s);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  /* easing cubic-bezier(0.65, 0, 0.35, 1) */
  function bezier(p1x, p1y, p2x, p2y) {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sx = t => ((ax * t + bx) * t + cx) * t;
    const sy = t => ((ay * t + by) * t + cy) * t;
    const dx = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = sx(t) - x; if (Math.abs(d) < 1e-6) return sy(t);
        const dd = dx(t); if (Math.abs(dd) < 1e-6) break;
        t -= d / dd;
      }
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return sy(t);
    };
  }
  const EASE = bezier(0.65, 0, 0.35, 1);

  /* =====================================================================
     COMPONENTI
     ===================================================================== */
  /* testo con evidenziazioni: ogni frammento di `ems` diventa <mark class="em"> (il testo resta identico) */
  function emText(e, text, ems) {
    const rs = [];
    (ems || []).forEach(m => { const i = text.indexOf(m); if (i >= 0) rs.push([i, i + m.length]); });
    rs.sort((a, b) => a[0] - b[0]);
    let p = 0;
    rs.forEach(([a, b]) => {
      if (a < p) return;
      if (a > p) e.appendChild(document.createTextNode(text.slice(p, a)));
      e.appendChild(tx('mark', 'em', text.slice(a, b)));
      p = b;
    });
    if (p < text.length) e.appendChild(document.createTextNode(text.slice(p)));
    return e;
  }
  const tex = (tag, cls, it) => emText(el(tag, cls), it.s, it.em);

  /* codice colore delle fonti: Corano, Bibbia, hadith, Padri della Chiesa */
  const BIBLE = /^(Salmo|Giovanni|1 Giovanni|1 Pietro|2 Pietro|2 Timoteo|Luca|Matteo|Marco|Ebrei|Numeri|Geremia|2 Samuele|Deuteronomio|Atti|Romani|Michea|Isaia|cfr\. Ebrei|Genesi|Esodo|1 Timoteo|1 Corinzi|2 Corinzi|Galati|Colossesi|Filippesi|1 Tessalonicesi|1 Re|Apocalisse|Efesini)\b/;
  function sourceOf(it) {
    const l = (it.l || '').toUpperCase(), r = it.r || '';
    if (/SAHIH|BUKHARI|MUSLIM|TIRMIDH|IBN MĀJAH/i.test(r) || /HADITH|YAQEEN/.test(l)) return 'hadith';
    if (/^Corano/.test(r) || /CORANO|SURA|FĀTIḤA/.test(l)) return 'quran';
    if (/AGOSTINO|ORIGENE|ANTONIO|BASILIO|PADRI|LITURGIA|CIRILLO|GREGORIO|MESSA|LODE/.test(l) || /Padri/.test(r)) return 'fathers';
    if (BIBLE.test(r) || /BIBBIA|CRISTIANESIMO|PROFETA «COME|MOSÈ|SALMISTA|RAGAZZO|SOGNO|FIGLIO PRODIGO/.test(l)) return 'bible';
    return '';
  }

  /* parola araba vocalizzata con lettere "accese": sotto il testo completo (vocali al loro posto),
     sopra lo stesso testo senza vocali, trasparente tranne le lettere da evidenziare */
  const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
  function arWord(ar, hl, at, cls, c) {
    const w = el('span', 'arw ' + (cls || ''));
    w.lang = 'ar'; w.dir = 'rtl';
    w.appendChild(tx('span', 'arw-base', ar));
    if (hl) {
      const base = ar.replace(HARAKAT, '');
      const i = at != null ? at : base.indexOf(hl);
      if (i >= 0) {
        const top = el('span', 'arw-top');
        top.setAttribute('aria-hidden', 'true');
        top.appendChild(document.createTextNode(base.slice(0, i)));
        top.appendChild(tx('b', 'arw-hl c' + (c || 0), hl));
        top.appendChild(document.createTextNode(base.slice(i + hl.length)));
        w.appendChild(top);
      }
    }
    return w;
  }

  /* diagramma "scheletro → due letture" */
  function VAR(it) {
    const p = el('div', 'var');
    p.appendChild(tx('div', 'var-h', it.h));
    p.appendChild(el('div', 'var-rasm', [arWord(it.rasm.ar, it.rasm.hl, it.rasm.at, 'rasm', 0), tx('div', 'var-cap', it.rasm.cap)]));
    const fork = el('div', 'var-fork');
    fork.innerHTML = '<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="fk fk1" pathLength="1" d="M50 0 V12 C50 24 25 22 25 40"/>' +
      '<path class="fk fk2" pathLength="1" d="M50 0 V12 C50 24 75 22 75 40"/></svg>';
    fork.appendChild(tx('span', 'var-fork-l', it.fork));
    p.appendChild(fork);
    p.appendChild(el('div', 'var-rds', it.rd.map(d => el('div', 'var-rd c' + d.c, [
      arWord(d.ar, d.hl, d.at, 'rdw', d.c), tx('div', 'var-tr', d.tr), tx('div', 'var-m', d.m), tx('div', 'var-who', d.who),
    ]))));
    return p;
  }

  /* collazione di due testi, con le parole in più accese in oro e il vuoto dove mancano */
  function CMP(it) {
    const b = el('div', 'cmp');
    b.appendChild(tx('div', 'cmp-h', it.h));
    it.rows.forEach(rw => {
      const line = el('div', 'cmp-ar');
      line.dir = 'rtl';
      if (rw.gap === 'start') line.appendChild(el('span', 'cmp-gap'));
      line.appendChild(arWord(rw.ar, rw.hl, null, 'cmpw', 3));
      if (rw.gap === 'end') line.appendChild(el('span', 'cmp-gap'));
      b.appendChild(el('div', 'cmp-row' + (rw.other ? ' other' : ''), [emText(el('p', 'cmp-s'), rw.s, rw.em), line]));
    });
    if (it.q) b.appendChild(tx('p', 'cmp-q', it.q));
    return b;
  }

  function P(it, cls) { return tex('p', 'p ' + (cls || ''), it); }

  function Q(it, cls, opt) {
    const src = sourceOf(it);
    const f = el('figure', 'q ' + (cls || '') + (src ? ' src-' + src : ''));
    if (it.l) f.appendChild(tx('figcaption', 'q-l', it.l));
    f.appendChild(tex('blockquote', 'q-s', it));
    if (it.r) {
      const r = el('div', 'q-r');
      if (opt && opt.hl) highlight(r, it.r, opt.hl); else r.textContent = it.r;
      f.appendChild(r);
    }
    return f;
  }
  function highlight(e, text, word) {
    const parts = text.split(word);
    parts.forEach((p, i) => {
      if (p) e.appendChild(document.createTextNode(p));
      if (i < parts.length - 1) e.appendChild(tx('span', 'hl', word));
    });
  }
  function CARD(it, cls) {
    return el('div', 'card ' + (cls || ''), [tx('h3', 'card-h', it.h), tex('p', 'card-s', it)]);
  }
  function TABLE(it, hiRow) {
    const t = el('table', 'tbl');
    const head = el('thead'), htr = el('tr');
    it.rows[0].forEach(c => htr.appendChild(tx('th', '', c)));
    head.appendChild(htr); t.appendChild(head);
    const body = el('tbody');
    it.rows.slice(1).forEach((r, i) => {
      const tr = el('tr', (i + 1) === hiRow ? 'hi' : '');
      r.forEach((c, j) => {
        if (it.build === j) tr.appendChild(el('td', 'bstep', tx('span', 'bval', c)));   // compare con un click
        else tr.appendChild(tx('td', '', c));
      });
      body.appendChild(tr);
    });
    t.appendChild(body);
    return t;
  }
  function IMG(it, cls) {
    const fig = el('figure', 'img ' + (cls || ''));
    const im = new Image();
    im.src = 'assets/' + it.f; im.alt = ''; im.draggable = false; im.decoding = 'async';
    fig.appendChild(el('div', 'img-w', im));
    if (it.cap && it.cap.length) {
      const c = el('figcaption', 'img-cap');
      it.cap.forEach((line, i) => c.appendChild(tx('span', i === 0 ? 'cap0' : 'capn', line)));
      fig.appendChild(c);
    }
    fig.style.setProperty('--w', it.w);
    return fig;
  }
  function BAND(it) { return el('div', 'band', tex('p', 'band-s', it)); }

  /* pagina di Corano come stampata oggi: titolo della sura, basmala, versetti vocalizzati con il numero */
  const arDigits = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  function MUSHAF(it) {
    const page = el('div', 'mushaf');
    page.lang = 'ar'; page.dir = 'rtl';
    page.appendChild(el('div', 'mu-h', tx('span', '', it.h)));
    page.appendChild(tx('div', 'mu-bism', it.bism));
    const body = el('p', 'mu-text');
    it.v.forEach((v, i) => {
      body.appendChild(tx('span', 'mu-v', v));
      const num = tx('span', 'mu-n', arDigits((it.n0 || 1) + i));
      num.setAttribute('aria-hidden', 'true');
      body.appendChild(num);
      body.appendChild(document.createTextNode(' '));
    });
    page.appendChild(body);
    const fig = el('figure', 'img mu-fig', el('div', 'mu-frame', page));
    if (it.cap && it.cap.length) {
      const c = el('figcaption', 'img-cap');
      it.cap.forEach((line, i) => c.appendChild(tx('span', i === 0 ? 'cap0' : 'capn', line)));
      fig.appendChild(c);
    }
    return fig;
  }
  function COL(it, cls) {
    if (isArabic(it.s)) {
      const e = tx('div', 'col col-ar ' + (cls || ''), it.s);
      e.dir = 'rtl'; e.lang = 'ar';
      return e;
    }
    return tx('div', 'col col-lat ' + (cls || ''), it.s);
  }
  const row = (cls, kids) => el('div', 'row rv ' + cls, kids);
  const rv = node => { node.classList.add('rv'); return node; };

  /* =====================================================================
     COMPOSIZIONE DELLE SCENE (segue il campo `layout` di data.js)
     ===================================================================== */
  /* ---------- immagine d'atmosfera della scena (dipinto, incisione, tavola) ---------- */
  function addArt(s, a) {
    const fig = el('figure', `art art-${a.mode} art-${a.pos}`);
    fig.setAttribute('aria-hidden', 'true');
    const im = new Image();
    im.src = 'assets/art/' + a.f; im.alt = ''; im.draggable = false;
    fig.appendChild(el('div', 'art-in', im));
    if (a.cap) fig.appendChild(tx('figcaption', 'art-cap', a.cap));
    s.insertBefore(fig, s.firstChild);
    s.classList.add('has-art', 'has-art-' + a.pos, 'has-' + a.mode);
  }

  /* ---------- coreografia d'ingresso: ogni "atomo" entra con il suo ritmo ---------- */
  const ATOMS = [
    '.art', '.title', '.tt-rule', '.tt-h', '.tt-a', '.tt-b', '.q-hero', '.op-num', '.op-l', '.op-rule', '.op-h', '.op-sub',
    '.p', '.q', '.card', '.tbl tr', '.band', '.col', '.img', '.tele-b', '.tele-a', '.tl-m', '.num-n', '.num-s',
    '.obj-q', '.next', '.ms-facts li', '.ms-obs', '.ms-credit', '.arrow', '.timeline',
    '.var-h', '.var-rasm', '.var-fork', '.var-rd', '.cmp-h', '.cmp-row', '.cmp-q',
  ].join(',');
  function choreograph(s) {
    let i = 0;
    s.querySelectorAll(ATOMS).forEach(a => {
      if (a.parentElement.closest('.q, .card, .next, .band, .img, .qbox .p')) return; // niente atomi annidati
      a.classList.add('an');
      a.style.setProperty('--i', a.classList.contains('art') ? 0 : i++);
    });
  }
  function play(s, base) {
    if (REDUCED || !s) return;
    s.classList.remove('play');
    s.style.setProperty('--base', base + 'ms');
    void s.offsetWidth;            // riavvia le animazioni CSS
    s.classList.add('play');
  }

  function buildScene(sc) {
    const s = buildSceneInner(sc);
    if (sc.art) addArt(s, sc.art);
    if (s.querySelector('.band, .q-band')) s.classList.add('has-band');
    choreograph(s);
    s._steps = [...s.querySelectorAll('.bstep')];   // elementi che compaiono uno per click
    s._shown = s._steps.length;
    return s;
  }

  /* ---------- comparse "a tappe" dentro una scena ---------- */
  function setSteps(s, n, fresh) {
    if (!s || !s._steps || !s._steps.length) return;
    s._shown = Math.max(0, Math.min(n, s._steps.length));
    s._steps.forEach((e, i) => {
      e.classList.toggle('revealed', i < s._shown);
      e.classList.toggle('just', !!fresh && i === s._shown - 1);
    });
  }
  /* entrando in avanti la scena parte "chiusa"; tornando indietro la si ritrova completa */
  const primeSteps = (i, full) => { const s = sceneEls[i]; if (s && s._steps.length) setSteps(s, full ? s._steps.length : 0); };
  function stepForward() {
    const s = !onMap && sceneEls[pos - 1];
    if (s && s._steps.length && s._shown < s._steps.length) { setSteps(s, s._shown + 1, true); return true; }
    return false;
  }
  function stepBack() {
    const s = !onMap && sceneEls[pos - 1];
    if (s && s._steps.length && s._shown > 0) { setSteps(s, s._shown - 1); return true; }
    return false;
  }

  function buildSceneInner(sc) {
    const I = sc.items;
    // `comp` (facoltativo) sceglie l'impaginazione di un'altra scena: così una lezione nuova riusa le
    // composizioni esistenti con numeri di scena propri (vedi references/composizioni.md). Senza `comp` vale `n`.
    const key = sc.comp != null ? sc.comp : sc.n;
    const s = el('section', 'scene s' + key);
    s.dataset.n = sc.n;

    // scene a impaginazione speciale
    if (key === 1) {
      s.classList.add('sc-title');
      add(s, [el('div', 'tt-rule rv'), tx('h1', 'tt-h rv', sc.title), tx('p', 'tt-a rv', I[0].s), tx('p', 'tt-b rv', I[1].s)]);
      return s;
    }
    if (key === 2) {
      s.classList.add('sc-prayer');
      s.appendChild(Q(I[0], 'q-hero rv'));
      return s;
    }
    if (/Section opener/.test(sc.layout)) {
      s.classList.add('sc-open');
      const num = sc.sec && sc.sec.indexOf(' · ') > 0 ? sc.sec.split(' · ')[0] : null;
      if (num) { const nn = tx('div', 'op-num', num); nn.setAttribute('aria-hidden', 'true'); s.appendChild(nn); }
      add(s, [tx('div', 'op-l rv', sc.title), el('div', 'op-rule rv'), tx('h2', 'op-h rv', I[0].s),
              I[1] ? tx('p', 'op-sub rv', I[1].s) : null]);
      return s;
    }
    if (I.some(it => it.t === 'mushaf')) {          // indizio: manoscritto accanto a un Corano di oggi
      s.classList.add('sc-hint');
      s.appendChild(tx('h2', 'title rv', sc.title));
      add(s, el('div', 'body', [row('hint', [IMG(I.find(it => it.t === 'img'), 'hint-ms'), MUSHAF(I.find(it => it.t === 'mushaf'))])]));
      return s;
    }
    if (/Manuscript detail/.test(sc.layout)) {
      s.classList.add('sc-ms');
      s.appendChild(tx('h2', 'title rv', sc.title));
      const facts = el('ul', 'ms-facts', I.filter((it, j) => it.t === 'p' && j < I.length - 1).map(it => tx('li', '', it.s)));
      const obs = I.find(it => it.t === 'q');
      const credit = I[I.length - 1];
      add(s, el('div', 'body', [row('ms', [
        IMG(I.find(it => it.t === 'img'), 'ms-photo'),
        el('div', 'ms-text', [COL(I[0]), facts, tx('p', 'ms-obs', obs.s), tx('p', 'ms-credit', credit.s)]),
      ])]));
      return s;
    }

    if (sc.title) s.appendChild(tx('h2', 'title rv', sc.title));
    const b = el('div', 'body');
    s.appendChild(b);
    const put = (...k) => add(b, k);

    switch (key) {
      case 3:
      case 10.5:
        put(rv(P(I[0], 'p-question')), row('g2', [CARD(I[1]), CARD(I[2])]));
        break;
      case 4:
        put(Q(I[0], 'q-block rv'), row('g3', [CARD(I[1]), CARD(I[2]), CARD(I[3])]));
        break;
      case 6: {
        const cols = [0, 1, 2].map(k => el('div', 'ar-col', [COL(I[3 * k]), P(I[3 * k + 1], 'p-translit'), P(I[3 * k + 2], 'p-desc')]));
        put(row('g3 ar3', cols), Q(I[9], 'q-band rv'));
        break;
      }
      case 7:
        put(row('chain', [0, 1, 2, 3].map(k => CARD(I[k], 'card-chain'))),
            row('g2', [Q(I[4]), Q(I[5])]), BAND(I[6]));
        break;
      case 8:
        put(row('g2 face', [Q(I[0]), Q(I[1])]), rv(el('div', '', TABLE(I[2]))));
        break;
      case 10:
        put(rv(el('div', '', TABLE(I[0], I[0].hi || 2))), BAND(I[1]));
        break;
      case 11:
        put(row('g3 cols11', [
          el('div', 'stack', [COL(I[0]), CARD(I[1]), CARD(I[2])]),
          el('div', 'stack', [COL(I[3]), CARD(I[4])]),
          el('div', 'stack', [COL(I[5]), CARD(I[6])]),
        ]), Q(I[7], 'q-band rv'));
        break;
      case 12:
        put(Q(I[0], 'q-block rv'), row('g3', [CARD(I[1]), CARD(I[2]), CARD(I[3])]), BAND(I[4]));
        break;
      case 13:
        put(Q(I[0], 'q-block rv'), row('g3', [Q(I[1]), Q(I[2]), Q(I[3])]));
        break;
      case 14:
      case 19:
        put(row('g2', [Q(I[0]), Q(I[1])]), row('g2', [CARD(I[2]), CARD(I[3])]));
        break;
      case 15:
        put(rv(el('div', 'stmt', [P(I[0], 'p-stmt1'), P(I[1], 'p-stmt2')])), rv(el('div', '', TABLE(I[2]))));
        break;
      case 16: {
        // catena di cinque riquadri: il testo resta identico (le frecce sono il testo originale " → ")
        const chain = el('div', 'tele');
        const parts = I[0].s.split(' → ');
        parts.forEach((part, i) => {
          chain.appendChild(tx('span', 'tele-b tele-' + i, part));
          if (i < parts.length - 1) chain.appendChild(tx('span', 'tele-a', ' → '));
        });
        put(row('g16', [
          el('div', 'stack', [chain, P(I[1], 'p-cap'), Q(I[2])]),
          el('div', 'stack', [CARD(I[3]), Q(I[4])]),
        ]));
        break;
      }
      case 18:
        put(rv(P(I[0], 'p-intro')), row('g3', [Q(I[1]), Q(I[2]), Q(I[3], 'q-dark')]), BAND(I[4]));
        break;
      case 20:
        put(el('div', 'photos rv', [IMG(I[0], 'photo'), IMG(I[1], 'photo'), IMG(I[2], 'photo')]), BAND(I[3]));
        break;
      case 21:
        put(rv(P(I[0], 'p-lead')), row('g2 vars', [VAR(I[1]), VAR(I[2])]), Q(I[3], 'q-band rv'));
        break;
      case 22: {
        const tl = el('div', 'timeline rv');
        I.slice(0, 4).forEach(c => {
          const m = el('div', 'tl-m', [el('div', 'tl-dot'), tx('div', 'tl-h', c.h)]);
          const p = el('p', 'tl-s');
          const k = c.s.lastIndexOf(' — ');
          if (k > 0) { p.appendChild(document.createTextNode(c.s.slice(0, k))); p.appendChild(tx('span', 'tl-r', c.s.slice(k))); }
          else p.textContent = c.s;
          m.appendChild(p);
          tl.appendChild(m);
        });
        put(tl, BAND(I[4]));
        break;
      }
      case 23:
        put(row('g2', [Q(I[0]), Q(I[1])]), el('div', 'qbox rv', P(I[2], 'p-qbox')));
        break;
      case 24:
        put(row('grid6', I.slice(0, 6).map(q => Q(q, 'q-card'))), BAND(I[6]));
        break;
      case 25:
        put(rv(P(I[0], 'p-legend')), row('cmps', [CMP(I[1]), CMP(I[2])]));
        break;
      case 26:
        put(row('g3', [Q(I[0]), Q(I[1]), Q(I[2])]), row('g2', [CARD(I[3]), CARD(I[4], 'card-gold')]));
        break;
      case 27:
        put(row('g2 face', [Q(I[0], '', { hl: 'hawā' }), Q(I[1], '', { hl: 'hawā' })]), Q(I[2], 'q-block rv'), BAND(I[3]));
        break;
      case 28:
        [[0, 1], [2, 3]].forEach(([a, c]) => put(row('apo', [Q(I[a]), el('div', 'arrow'), CARD(I[c])])));
        break;
      case 29:
        put(row('g3', [Q(I[0]), Q(I[1]), Q(I[2])]), row('pincer', [CARD(I[3], 'jaw jaw-l'), CARD(I[4], 'jaw jaw-r')]));
        break;
      case 30:
        put(row('g2 duo', [
          el('div', 'stack cool', [COL(I[0]), Q(I[1]), Q(I[2])]),
          el('div', 'stack warm', [COL(I[3]), Q(I[4]), Q(I[5])]),
        ]));
        break;
      case 31:
        put(row('g31', [
          el('div', 'stairs-w', [el('div', 'stairs', [CARD(I[0], 'step step1'), CARD(I[1], 'step step2'), CARD(I[2], 'step step3')]), P(I[3], 'p-src')]),
          el('div', 'stack', [Q(I[4]), Q(I[5])]),
        ]));
        break;
      case 32:
        I.forEach(c => put(row('obj', [tx('p', 'obj-q', c.h), el('div', 'card card-ans', tx('p', 'card-s', c.s))])));
        break;
      case 33:
        I.slice(0, 3).forEach(c => put(row('num', [tx('div', 'num-n', c.h), tx('p', 'num-s', c.s)])));
        put(BAND(I[3]));
        break;
      default:
        // composizione generica, per sicurezza
        I.forEach(it => {
          const f = { p: P, q: Q, card: CARD, table: TABLE, img: IMG, band: BAND, col: COL }[it.t];
          if (f) put(rv(f(it)));
        });
    }
    return s;
  }

  /* =====================================================================
     SEZIONI, MAPPA, CORNICI
     ===================================================================== */
  const secs = [];
  const secOf = [];
  SC.forEach((sc, i) => {
    if (sc.sec || !secs.length) secs.push({ name: sc.sec, first: i, scenes: [] });
    secs[secs.length - 1].scenes.push(i);
    secOf[i] = secs.length - 1;
  });
  const NS = secs.length;
  /* colore d'accento di ogni sezione (atmosfera, filetti, tappe della mappa) */
  const SEC_COL = ['#D2AE5C', '#6F95D8', '#E3C47C', '#C2452F', '#D9A066', '#9DB6E8'];   // palette «Icona»

  const stage = document.getElementById('stage');
  const world = document.getElementById('world');
  const mapL = document.getElementById('map');
  const framesL = document.getElementById('frames');
  const par = document.querySelector('#atmo .par');
  const dotsL = document.getElementById('dots');

  /* --- percorso SVG (Catmull-Rom → Bézier) --- */
  const VB = { w: 1600, h: 900 };
  const pts = [{ x: .0, y: .62 }].concat(STATIONS, [{ x: .93, y: .62 }]).map(p => ({ x: p.x * VB.w, y: p.y * VB.h }));
  function seg(i) { // curva da pts[i] a pts[i+1]
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    const f = n => n.toFixed(1);
    return `C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  const NSVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) { const e = document.createElementNS(NSVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  const pathSvg = svg('svg', { id: 'path', viewBox: `0 0 ${VB.w} ${VB.h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  let full = `M ${pts[0].x} ${pts[0].y} `;
  for (let i = 0; i < pts.length - 1; i++) full += seg(i) + ' ';
  pathSvg.appendChild(svg('path', { d: full, class: 'glowline' }));
  pathSvg.appendChild(svg('path', { d: full, class: 'base' }));
  const litSegs = [];
  for (let k = 0; k < NS - 1; k++) { // da tappa k a tappa k+1 (indici pts = k+1, k+2)
    const i = k + 1;
    const p = svg('path', { d: `M ${pts[i].x} ${pts[i].y} ${seg(i)}`, class: 'lit', pathLength: '1' });
    pathSvg.appendChild(p); litSegs.push(p);
  }
  mapL.appendChild(pathSvg);

  /* --- titolo della lezione in alto a sinistra --- */
  const s1 = SC[0];
  mapL.appendChild(el('div', 'map-title', [
    tx('p', 'mt-a', s1.items[0].s),
    tx('h1', 'mt-h', s1.title),
    tx('p', 'mt-b', s1.items[1].s),
    el('div', 'mt-rule'),
  ]));

  /* --- candela e codice aperto (SVG vettoriale) --- */
  /* --- LA TENDA: pianta del tabernacolo disegnata dietro il cammino (viewBox 1600×900 = 16:9) --- */
  const plan = el('div', 'plan');
  plan.setAttribute('aria-hidden', 'true');
  /* Pianta disegnata a misura del palco (viewBox 1600×900). Asse processionale a y = 558 (0.62):
     porta → altare degli olocausti → conca → candelabro → altare dell'incenso → velo → arca. */
  const AX = 558;
  const T = (x, y, s, c) => `<text x="${x}" y="${y}" class="${c || 'pl'}" text-anchor="middle">${s}</text>`;
  let posts = '';
  for (let x = 40; x <= 1560; x += 40) posts += `<circle class="pst" cx="${x}" cy="300" r="4"/><circle class="pst" cx="${x}" cy="820" r="4"/>`;
  for (let y = 340; y <= 780; y += 40) { if (y < 470 || y > 650) posts += `<circle class="pst" cx="40" cy="${y}" r="4"/>`; posts += `<circle class="pst" cx="1560" cy="${y}" r="4"/>`; }
  let boards = '';
  for (let x = 872; x <= 1530; x += 22) boards += `M${x} 400 v10 M${x} 710 v10 `;
  const stripes = (x, y1, y2, gapA, gapB) => ['#3D6BC4', '#7B4BA8', '#C2452F', '#F4ECD8'].map((c, i) => {
    const xx = x + i * 4;
    return gapA ? `<path class="weave" stroke="${c}" d="M${xx} ${y1} V${gapA} M${xx} ${gapB} V${y2}"/>` : `<path class="weave" stroke="${c}" d="M${xx} ${y1} V${y2}"/>`;
  }).join('');
  plan.innerHTML =
    '<svg viewBox="0 0 1600 900" preserveAspectRatio="none">' +
    '<defs><radialGradient id="shek" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE7A8" stop-opacity=".55"/><stop offset=".4" stop-color="#D2AE5C" stop-opacity=".18"/><stop offset="1" stop-color="#D2AE5C" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="fire" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#E8763A" stop-opacity=".45"/><stop offset="1" stop-color="#E8763A" stop-opacity="0"/></radialGradient></defs>' +
    // zone che si accendono: atrio, Santo, Santo dei Santi
    '<rect class="zone z0" x="40" y="300" width="1520" height="520"/>' +
    '<rect class="zone z1" x="860" y="400" width="400" height="320"/>' +
    '<rect class="zone z2" x="1260" y="400" width="280" height="320"/>' +
    // ATRIO: recinto di cortine di lino sostenute da colonne, con la porta a oriente
    '<path class="curtain" d="M40 470 V300 H1560 V820 H40 V650"/>' + posts +
    stripes(30, 470, 650) +
    T(150, 455, 'LA PORTA') +
    // altare degli olocausti (bronzo, quattro corni, fuoco)
    '<circle cx="384" cy="' + AX + '" r="70" fill="url(#fire)"/>' +
    '<rect class="bronze" x="349" y="' + (AX - 35) + '" width="70" height="70"/>' +
    '<path class="bronze" d="M349 ' + (AX - 35) + ' l-9 -9 M419 ' + (AX - 35) + ' l9 -9 M349 ' + (AX + 35) + ' l-9 9 M419 ' + (AX + 35) + ' l9 9 M359 ' + AX + ' H409 M384 ' + (AX - 25) + ' V' + (AX + 25) + '"/>' +
    T(384, AX - 62, 'ALTARE DEGLI OLOCAUSTI') +
    // conca di bronzo con l'acqua
    '<circle class="bronze" cx="640" cy="' + AX + '" r="30"/><circle class="water" cx="640" cy="' + AX + '" r="21"/>' +
    T(640, AX - 62, 'LA CONCA') +
    // LA TENDA: assi d'oro, ingresso tessuto, Santo e Santo dei Santi
    '<rect class="tent" x="860" y="400" width="680" height="320"/>' +
    '<path class="boards" d="' + boards + '"/>' +
    stripes(852, 400, 720, AX - 28, AX + 28) +
    // Santo: candelabro a sette bracci, tavola dei pani, altare dell'incenso
    '<g class="menorah"><path d="M960 ' + (AX + 30) + ' V' + (AX - 26) + ' M940 ' + (AX + 30) + ' H980' +
      ' M960 ' + (AX + 4) + ' Q936 ' + (AX + 4) + ' 936 ' + (AX - 26) + ' M960 ' + (AX + 4) + ' Q984 ' + (AX + 4) + ' 984 ' + (AX - 26) +
      ' M960 ' + (AX + 12) + ' Q924 ' + (AX + 12) + ' 924 ' + (AX - 26) + ' M960 ' + (AX + 12) + ' Q996 ' + (AX + 12) + ' 996 ' + (AX - 26) +
      ' M960 ' + (AX - 4) + ' Q948 ' + (AX - 4) + ' 948 ' + (AX - 26) + ' M960 ' + (AX - 4) + ' Q972 ' + (AX - 4) + ' 972 ' + (AX - 26) + '"/>' +
      [924, 936, 948, 960, 972, 984, 996].map(x => `<circle class="flame-d" cx="${x}" cy="${AX - 31}" r="3.5"/>`).join('') + '</g>' +
    T(960, AX - 62, 'IL CANDELABRO') +
    '<rect class="goldobj" x="1010" y="414" width="66" height="30"/>' +
    [0, 1, 2, 3, 4, 5].map(i => `<rect class="loaf" x="${1015 + i * 10}" y="419" width="7" height="8"/><rect class="loaf" x="${1015 + i * 10}" y="432" width="7" height="8"/>`).join('') +
    
    '<rect class="goldobj" x="1135" y="' + (AX - 17) + '" width="34" height="34"/>' +
    '<path class="smoke" d="M1146 ' + (AX - 20) + ' q-8 -12 0 -22 q8 -10 0 -20 M1158 ' + (AX - 20) + ' q8 -12 0 -22 q-8 -10 0 -20"/>' +
    T(1152, AX - 72, "ALTARE DELL'INCENSO") +
    // IL VELO, squarciato dove passa il cammino
    '<g class="veilg">' + stripes(1254, 400, 720, AX - 26, AX + 26) + '</g>' +
    '<path class="tear" d="M1254 ' + (AX - 26) + ' l8 10 l-6 8 M1270 ' + (AX + 26) + ' l-8 -10 l6 -8"/>' +
    T(1262, 388, 'IL VELO') +
    // Santo dei Santi: la gloria e l'arca con i cherubini
    '<circle cx="1408" cy="' + AX + '" r="110" fill="url(#shek)" class="shek"/>' +
    '<rect class="ark" x="1363" y="' + (AX - 18) + '" width="90" height="46"/>' +
    '<path class="ark-w" d="M1368 ' + (AX - 18) + ' Q1380 ' + (AX - 52) + ' 1406 ' + (AX - 24) + ' M1448 ' + (AX - 18) + ' Q1436 ' + (AX - 52) + ' 1410 ' + (AX - 24) + '"/>' +
    T(1408, AX - 72, "L'ARCA") +
    // nomi dei luoghi
    T(1060, 750, 'IL SANTO', 'pr') + T(1400, 750, 'IL SANTO DEI SANTI', 'pr') + T(450, 860, "L'ATRIO", 'pr') +
    '</svg>';  mapL.insertBefore(plan, mapL.firstChild);
  const zones = [...plan.querySelectorAll('.zone')];

  const candle = el('div', 'candle');
  candle.setAttribute('aria-hidden', 'true');
  candle.innerHTML =
    '<svg viewBox="0 0 200 200">' +
    '<defs>' +
    '<radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#C9A55A" stop-opacity=".34"/><stop offset=".45" stop-color="#C9A55A" stop-opacity=".1"/><stop offset="1" stop-color="#C9A55A" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#C9A55A"/><stop offset=".55" stop-color="#F3EBDD"/><stop offset="1" stop-color="#F3EBDD" stop-opacity=".1"/></linearGradient>' +
    '<linearGradient id="wx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F3EBDD" stop-opacity=".22"/><stop offset=".5" stop-color="#F3EBDD" stop-opacity=".42"/><stop offset="1" stop-color="#F3EBDD" stop-opacity=".16"/></linearGradient>' +
    '</defs>' +
    '<circle class="candle-glow" cx="118" cy="70" r="80" fill="url(#cg)"/>' +
    // codice aperto
    '<g fill="none" stroke="#C9A55A" stroke-opacity=".38" stroke-width="1.2">' +
    '<path d="M18 168 C 40 158, 62 158, 82 166 L 82 186 C 62 178, 40 178, 18 188 Z"/>' +
    '<path d="M82 166 C 102 158, 124 158, 146 168 L 146 188 C 124 178, 102 178, 82 186"/>' +
    '<path d="M28 170 C 44 164, 60 164, 74 169 M28 176 C 44 170, 60 170, 74 175 M90 169 C 104 164, 120 164, 136 170 M90 175 C 104 170, 120 170, 136 176" stroke-opacity=".22"/>' +
    '</g>' +
    // candela
    '<rect x="110" y="96" width="16" height="74" rx="2" fill="url(#wx)"/>' +
    '<ellipse cx="118" cy="96" rx="8" ry="2.2" fill="#F3EBDD" fill-opacity=".35"/>' +
    '<path d="M104 170 h28 l3 6 h-34 z" fill="#C9A55A" fill-opacity=".35"/>' +
    '<line x1="118" y1="96" x2="118" y2="89" stroke="#0E0C0A" stroke-width="1.4"/>' +
    '<path class="flame" d="M118 54 C 124 66, 128 75, 125 83 C 123 88, 120 90, 118 90 C 116 90, 113 88, 111 83 C 108 75, 112 66, 118 54 Z" fill="url(#fl)" fill-opacity=".9"/>' +
    '<path class="flame-in" d="M118 70 C 121 76, 122 81, 120.5 85 C 119.8 87, 118.8 88, 118 88 C 117.2 88, 116.2 87, 115.5 85 C 114 81, 115 76, 118 70 Z" fill="#F3EBDD" fill-opacity=".85"/>' +
    '</svg>';
  /* la candela della Lezione 1 non serve qui: la luce è nel Santo dei Santi */

  /* --- le tappe --- */
  function subLabel(k) {
    const sc = SC[secs[k].first];
    if (/Section opener/.test(sc.layout)) return (sc.items[1] || sc.items[0]).s;   // nella Tenda: il sottotitolo, breve
    if (k > 0 && sc.title) return sc.title;
    return null;
  }
  const stationEls = secs.map((sec, k) => {
    const st = STATIONS[k];
    const b = el('button', 'station' + (st.left ? ' left' : '') + (st.narrow || k === secs.length - 1 ? ' edge' : ''));
    b.style.left = (st.x * 100) + '%';
    b.style.top = (st.y * 100) + '%';
    b.setAttribute('aria-label', sec.name);
    b.style.setProperty('--acc', SEC_COL[k % SEC_COL.length]);
    const sub = subLabel(k);
    add(b, [
      el('span', 'st-dot', [el('span', 'st-halo'), el('span', 'st-ring'), el('span', 'st-core')]),
      el('span', 'st-lab', [tx('span', 'st-name', sec.name), sub ? tx('span', 'st-sub', sub) : null]),
    ]);
    b.addEventListener('click', e => {
      e.stopPropagation(); b.blur();
      if (!onMap) return;
      run(() => enterScene(sec.first + 1));
    });
    mapL.appendChild(b);
    return b;
  });

  /* --- invito finale (dall'ultima card del contenuto) --- */

  /* --- cornici di sezione con le scene --- */
  const sceneEls = [];
  const frameEls = secs.map((sec, k) => {
    const f = el('div', 'frame');
    f.dataset.sec = k;
    sec.scenes.forEach(i => {
      const s = buildScene(SC[i]);
      s.classList.add('sec-' + k);
      s.style.setProperty('--acc', SEC_COL[k % SEC_COL.length]);
      sceneEls[i] = s; f.appendChild(s);
    });
    framesL.appendChild(f);
    return f;
  });

  /* --- puntini di progresso --- */
  const dotEls = secs.map(() => { const d = el('i'); dotsL.appendChild(d); return d; });

  /* --- precarica immagini --- */
  SC.forEach(sc => sc.items.forEach(it => { if (it.t === 'img') { const im = new Image(); im.src = 'assets/' + it.f; } }));

  /* =====================================================================
     CAMERA
     ===================================================================== */
  let cam = { x: MAPCAM.x, y: MAPCAM.y, z: 1 };
  let settled = false;       // true = scena a riposo, trasformazioni azzerate (nitidezza massima)
  let flying = false;        // true = volo lungo il sentiero tra due sezioni
  let activeFrame = null;

  const stationCam = k => ({ x: STATIONS[k].x, y: STATIONS[k].y, z: Z });

  function positionFrames() {
    const w = stage.clientWidth, h = stage.clientHeight;
    frameEls.forEach((f, k) => {
      const st = STATIONS[k];
      f.style.transform = `translate(${st.x * w - w / (2 * Z)}px, ${st.y * h - h / (2 * Z)}px) scale(${1 / Z})`;
    });
  }
  function applyCam() {
    if (settled) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    world.style.transform = `translate(${w / 2}px, ${h / 2}px) scale(${cam.z}) translate(${-cam.x * w}px, ${-cam.y * h}px)`;
    const k = Math.log(cam.z) / Math.log(Z);          // 0 = mappa, 1 = scena
    // staffetta netta: prima la mappa (tappe, titoli di sezione) si dissolve del tutto, poi compare la scena,
    // così il titolo della tappa e la slide non si sovrappongono mai.
    // In volo lungo il sentiero la mappa resta piena più a lungo (si viaggia a ingrandimento intermedio).
    const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mo = flying ? 1 - ss(0.45, 0.64, k) : 1 - ss(0.28, 0.56, k);
    mapL.style.opacity = mo;
    mapL.style.visibility = mo <= 0.001 ? 'hidden' : 'visible';
    mapL.style.pointerEvents = k < 0.02 ? 'auto' : 'none';
    if (activeFrame) activeFrame.style.opacity = flying ? ss(0.65, 0.95, k) : ss(0.58, 0.92, k);
    par.style.transform = `scale(${1 + 0.08 * k})`;
  }
  function settle() {
    settled = true;
    world.style.transform = 'none';
    if (activeFrame) { activeFrame.style.transform = 'none'; activeFrame.style.opacity = 1; }
    mapL.style.visibility = 'hidden';
    mapL.style.pointerEvents = 'none';
  }
  function unsettle() {
    if (!settled) return;
    settled = false;
    positionFrames();
    applyCam();
  }
  function animateCam(to, dur) {
    return new Promise(res => {
      const from = { x: cam.x, y: cam.y, z: cam.z };
      const r = from.z / to.z;
      let Pt = null;
      if (Math.abs(1 - r) > 1e-6) Pt = { x: (to.x - from.x * r) / (1 - r), y: (to.y - from.y * r) / (1 - r) };
      const t0 = performance.now();
      let raf = 0, tmo = 0;
      // rAF per la fluidità; un timer di riserva garantisce che l'animazione finisca
      // anche se il browser sospende rAF (scheda nascosta, finestra minimizzata…)
      const schedule = () => {
        raf = requestAnimationFrame(tick);
        tmo = setTimeout(tick, 100);
      };
      function tick() { cancelAnimationFrame(raf); clearTimeout(tmo); step(performance.now()); }
      function step(now) {
        const t = Math.min(1, (now - t0) / dur);
        const e = EASE(t);
        const z = from.z * Math.pow(to.z / from.z, e);
        if (Pt) { const q = from.z / z; cam = { x: Pt.x + (from.x - Pt.x) * q, y: Pt.y + (from.y - Pt.y) * q, z }; }
        else cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z };
        if (t >= 1) cam = { x: to.x, y: to.y, z: to.z };
        applyCam();
        if (t < 1) schedule(); else res();
      }
      schedule();
    });
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* animazione generica: rAF per la fluidità, timer di riserva se rAF è sospeso */
  function tween(dur, fn) {
    return new Promise(res => {
      const t0 = performance.now();
      let raf = 0, tmo = 0;
      const sched = () => { raf = requestAnimationFrame(tick); tmo = setTimeout(tick, 100); };
      function tick() {
        cancelAnimationFrame(raf); clearTimeout(tmo);
        const t = Math.min(1, (performance.now() - t0) / dur);
        fn(t);
        if (t < 1) sched(); else res();
      }
      sched();
    });
  }

  /* =====================================================================
     ZOOM DENTRO UN DETTAGLIO: la scena successiva "nasce" da un elemento
     chiave n1>n2 = scene adiacenti (campo n di data.js); fx/fy = punto nell'elemento
     ===================================================================== */
  const DETAIL = {
    '9>10':  { sel: '.art img', fx: .73, fy: .5, zoom: 8 },   // il Bambino nel grembo della Vergine (icona di Ustjug)
  };
  const DZ_MS = REDUCED ? 300 : 1500;

  function focalPoint(scene, spec) {
    const el = scene.querySelector(spec.sel);
    if (!el) return null;
    const sr = scene.getBoundingClientRect();
    let r = el.getBoundingClientRect();
    if (spec.text) { const rg = document.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); } // riquadro dei glifi
    if (!r.width || !r.height) return null;
    let x = r.left + spec.fx * r.width, y = r.top + spec.fy * r.height;
    if (el.tagName === 'IMG' && el.naturalWidth) {
      const fit = getComputedStyle(el).objectFit;
      if (fit === 'cover' || fit === 'contain') {   // punto sull'immagine visibile, non sul riquadro
        const s = (fit === 'cover' ? Math.max : Math.min)(r.width / el.naturalWidth, r.height / el.naturalHeight);
        const w = el.naturalWidth * s, h = el.naturalHeight * s;
        x = r.left + (r.width - w) / 2 + spec.fx * w;
        y = r.top + (r.height - h) / 2 + spec.fy * h;
      }
    }
    return { x: x - sr.left, y: y - sr.top, w: sr.width, h: sr.height };
  }
  function flashOf(frame) {
    let f = frame.querySelector('.flash');
    if (!f) { f = el('div', 'flash'); frame.appendChild(f); }
    return f;
  }
  /* A = scena con il dettaglio, B = scena che ne nasce; dir 1 = avanti, -1 = indietro (stesso film al contrario) */
  async function detailZoom(ai, bi, spec, dir) {
    const A = sceneEls[ai], B = sceneEls[bi];
    A.classList.add('on'); B.classList.add('on');
    const f = focalPoint(A, spec);
    if (!f) { A.classList.remove('on'); B.classList.remove('on'); (dir > 0 ? A : B).classList.add('on'); return crossfade(dir > 0 ? ai : bi, dir > 0 ? bi : ai, dir); }
    const flash = flashOf(A.parentElement);
    flash.style.left = (f.w / 2) + 'px'; flash.style.top = (f.h / 2) + 'px';
    const S = spec.zoom, cx = f.w / 2, cy = f.h / 2;
    A.style.transformOrigin = '0 0'; B.style.transformOrigin = '50% 50%';
    A.style.willChange = B.style.willChange = 'transform, opacity';
    if (dir > 0) play(B, Math.round(DZ_MS * 0.55));
    await tween(DZ_MS, t => {
      const e = EASE(dir > 0 ? t : 1 - t);
      const s = Math.pow(S, e);
      const px = f.x + (cx - f.x) * e, py = f.y + (cy - f.y) * e;
      A.style.transform = `translate(${px - f.x * s}px, ${py - f.y * s}px) scale(${s})`;
      A.style.opacity = 1 - smooth(0.52, 0.86, e);
      const bp = smooth(0.5, 1, e);
      B.style.opacity = bp;
      B.style.transform = `scale(${0.28 + 0.72 * EASE(bp)})`;
      flash.style.opacity = (Math.sin(Math.PI * smooth(0.35, 0.92, e)) * 0.75).toFixed(3);
    });
    (dir > 0 ? A : B).classList.remove('on');
    [A, B].forEach(s => { s.style.transform = s.style.opacity = s.style.transformOrigin = s.style.willChange = ''; });
    flash.style.opacity = 0;
  }

  /* =====================================================================
     MANOSCRITTI: dalla fila di tre, il primo si ingrandisce e gli altri spariscono;
     poi, da un dettaglio all'altro, cambiano solo la foto e le caratteristiche.
     A = scena lo, B = scena hi; dir -1 rifà lo stesso film al contrario.
     ===================================================================== */
  const MS_MS = 1300, SWAP_MS = 950;
  const fade = (els, v) => els.forEach(e => { e.style.opacity = v; });
  function morphEnd(A, B, dir, els) {
    (dir > 0 ? A : B).classList.remove('on');
    els.forEach(e => { e.style.opacity = e.style.transform = e.style.transformOrigin = e.style.willChange = ''; });
  }
  async function msGrow(ai, bi, dir) {
    const A = sceneEls[ai], B = sceneEls[bi];
    A.classList.remove('play'); B.classList.remove('play');   // niente coreografia d'ingresso: si vede tutto subito
    A.classList.add('on'); B.classList.add('on');
    const imA = A.querySelector('.photo img'), imB = B.querySelector('.ms-photo img');
    const ra = imA && imA.getBoundingClientRect(), rb = imB && imB.getBoundingClientRect();
    if (!ra || !rb || !ra.width || !rb.width) {
      A.classList.remove('on'); B.classList.remove('on'); (dir > 0 ? A : B).classList.add('on');
      return crossfade(dir > 0 ? ai : bi, dir > 0 ? bi : ai, dir);
    }
    const k = B.offsetWidth / B.getBoundingClientRect().width;   // da pixel dello schermo a pixel della scena (la camera scala)
    const dx = (ra.left - rb.left) * k, dy = (ra.top - rb.top) * k, sx = ra.width / rb.width, sy = ra.height / rb.height;
    const firstCap = A.querySelector('.photo .img-cap');
    const outA = [...A.querySelectorAll('.title, .band, .art, .photo:not(:first-child)')].concat(firstCap ? [firstCap] : []);
    const inB = [...B.querySelectorAll('.title, .ms-text, .art')];
    imA.style.opacity = 0;
    imB.style.transformOrigin = '0 0'; imB.style.willChange = 'transform';
    await tween(MS_MS, t => {
      const e = EASE(dir > 0 ? t : 1 - t);
      imB.style.transform = `translate(${dx * (1 - e)}px, ${dy * (1 - e)}px) scale(${sx + (1 - sx) * e}, ${sy + (1 - sy) * e})`;
      fade(outA, 1 - smooth(0, 0.45, e));
      fade(inB, smooth(0.55, 1, e));
    });
    morphEnd(A, B, dir, [imA, imB, ...outA, ...inB]);
  }
  async function msSwap(ai, bi, dir) {
    const A = sceneEls[ai], B = sceneEls[bi];
    A.classList.remove('play'); B.classList.remove('play');
    A.classList.add('on'); B.classList.add('on');
    const pA = [...A.querySelectorAll('.ms-photo')], pB = [...B.querySelectorAll('.ms-photo')];
    const tA = [...A.querySelectorAll('.title, .ms-text')], tB = [...B.querySelectorAll('.title, .ms-text')];
    const u = B.offsetWidth / 100;
    [...pA, ...pB, ...tA, ...tB].forEach(e => { e.style.willChange = 'transform, opacity'; });
    await tween(SWAP_MS, t => {
      const e = EASE(dir > 0 ? t : 1 - t);
      const n = smooth(0, 0.6, e), o = smooth(0.4, 1, e);   // la foto nuova compare sopra la vecchia, poi la vecchia se ne va
      pA.forEach(p => { p.style.opacity = 1 - o; p.style.transform = `scale(${1 - 0.04 * o})`; });
      pB.forEach(p => { p.style.opacity = n; p.style.transform = `scale(${1.04 - 0.04 * n})`; });
      tA.forEach(x => { x.style.opacity = 1 - smooth(0, 0.45, e); x.style.transform = `translateY(${-1.2 * u * e}px)`; });
      tB.forEach(x => { x.style.opacity = smooth(0.5, 1, e); x.style.transform = `translateY(${1.2 * u * (1 - e)}px)`; });
    });
    morphEnd(A, B, dir, [...pA, ...pB, ...tA, ...tB]);
  }
  const MORPH = {};   // nessuna serie di manoscritti in questa lezione (msGrow/msSwap restano disponibili)

  /* =====================================================================
     VOLO LUNGO IL SENTIERO tra una sezione e la successiva
     ===================================================================== */
  const Z_MID = 2.2;
  async function flyPath(a, b, p) {
    const i = p - 1;
    flying = true;
    // 1 · la camera si solleva dalla tappa appena conclusa
    await animateCam({ x: STATIONS[a].x, y: STATIONS[a].y, z: Z_MID }, 750);
    // 2 · scorre lungo la curva dorata; il tratto percorso si accende (o si spegne, tornando indietro)
    const seg = litSegs[Math.min(a, b)], L = seg.getTotalLength(), fwd = b > a;
    showFrame(b); showScene(i);
    seg.style.transitionDuration = '1250ms';
    setDone(b, b); setDots(b, b);
    await tween(1250, t => {
      const e = EASE(t);
      const pt = seg.getPointAtLength(L * (fwd ? e : 1 - e));
      cam = { x: pt.x / VB.w, y: pt.y / VB.h, z: Z_MID * (1 - 0.16 * Math.sin(Math.PI * e)) };
      applyCam();
    });
    seg.style.transitionDuration = '';
    // 3 · scende nella tappa successiva, che si apre con il suo bagliore
    play(sceneEls[i], 640);
    stationEls[b].classList.add('go');
    await animateCam(stationCam(b), 950);
    stationEls[b].classList.remove('go');
    flying = false;
    pos = p; onMap = false;
    settle();
  }

  /* =====================================================================
     STATO E NAVIGAZIONE
     pos: 0 = mappa iniziale · 1..N = scene · N+1 = mappa finale
     ===================================================================== */
  let pos = 0;
  let onMap = true;
  let busy = false, queued = null;

  function setDone(d, cur) {
    stationEls.forEach((s, k) => {
      s.classList.toggle('done', k < d);
      s.classList.toggle('cur', k === cur);
    });
    litSegs.forEach((p, k) => p.classList.toggle('on', k < d));
    // la tenda si illumina man mano: atrio (4 parti), Santo (2), Santo dei Santi (1)
    if (NS === 6) [3, 5, 6].forEach((need, z) => zones[z].classList.toggle('on', d >= need));
    document.body.classList.toggle('at-end', d >= NS);
  }
  function setDots(cur, d) {
    dotEls.forEach((e, k) => { e.classList.toggle('cur', k === cur); e.classList.toggle('done', k < d); });
    document.body.style.setProperty('--sec-col', cur >= 0 ? SEC_COL[cur % SEC_COL.length] : '#C9A55A');
  }

  function showScene(i) {
    const f = frameEls[secOf[i]];
    f.querySelectorAll('.scene.on').forEach(s => { if (s !== sceneEls[i]) s.classList.remove('on'); });
    sceneEls[i].getAnimations && sceneEls[i].getAnimations({ subtree: true }).forEach(a => a.cancel());
    sceneEls[i].classList.add('on');
  }
  function showFrame(k) {
    frameEls.forEach((f, j) => { f.classList.toggle('vis', j === k); if (j !== k) f.style.opacity = 0; });
    activeFrame = k == null ? null : frameEls[k];
  }

  async function enterScene(p) {
    const i = p - 1, k = secOf[i];
    if (p !== pos) primeSteps(i, false);   // rientrando nella stessa scena (tasto M) le tappe restano come erano
    unsettle();
    showFrame(k);
    showScene(i);
    setDone(k, k);
    setDots(k, k);
    applyCam();
    play(sceneEls[i], Math.round(ZOOM_MS * 0.68));
    stationEls[k].classList.add('go');
    await animateCam(stationCam(k), ZOOM_MS);
    stationEls[k].classList.remove('go');
    pos = p; onMap = false;
    settle();
  }
  async function toMap(p) {
    unsettle();
    await animateCam(MAPCAM, ZOOM_MS);
    showFrame(null);
    onMap = true; pos = p;
    const d = p >= N + 1 ? NS : p === 0 ? 0 : secOf[p - 1];
    setDone(d, d < NS ? d : -1);
    setDots(d < NS ? d : -1, d);
  }
  async function move(p) {
    const a = secOf[pos - 1], b = secOf[p - 1], dir = p > pos ? 1 : -1;
    primeSteps(p - 1, dir < 0);
    if (a === b) {
      const lo = Math.min(pos, p) - 1, hi = Math.max(pos, p) - 1;
      const key = hi === lo + 1 ? SC[lo].n + '>' + SC[hi].n : null;
      const spec = key ? DETAIL[key] : null;
      const morph = key && !REDUCED ? MORPH[key] : null;
      if (morph) await morph(lo, hi, dir);
      else if (spec && !REDUCED) await detailZoom(lo, hi, spec, dir);
      else await crossfade(pos - 1, p - 1, dir);
      pos = p; return;
    }
    // fine sezione: volo lungo il sentiero fino alla tappa successiva
    if (!REDUCED && Math.abs(b - a) === 1) { unsettle(); await flyPath(a, b, p); return; }
    // (movimento ridotto) torna alla mappa, illumina la tappa, entra nella successiva
    unsettle();
    await animateCam(MAPCAM, ZOOM_MS);
    showFrame(null);
    onMap = true;
    setDone(b, b);
    setDots(b, b);
    await wait(HOLD_MS);
    await enterScene(p);
  }

  function crossfade(ai, bi, dir) {
    return new Promise(res => {
      const A = sceneEls[ai], B = sceneEls[bi];
      if (!A.animate) { A.classList.remove('on'); B.classList.add('on'); res(); return; }
      B.classList.add('on');
      const e = 'cubic-bezier(0.45, 0, 0.2, 1)';
      const u = stage.clientWidth / 100;
      const aOut = A.animate([
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
        { opacity: 0, transform: `translate3d(${-dir * 2.2 * u}px,0,0) scale(0.985)` },
      ], { duration: FADE_MS * 0.8, easing: e, fill: 'forwards' });
      const bIn = B.animate([
        { opacity: 0, transform: `translate3d(${dir * 3 * u}px,0,0) scale(1.012)` },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
      ], { duration: FADE_MS, easing: e, fill: 'backwards' });
      play(B, 90);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        A.classList.remove('on');
        aOut.cancel(); bIn.cancel();
        res();
      };
      bIn.finished.then(finish, finish);
      setTimeout(finish, FADE_MS + 120);   // garanzia: non restare mai bloccati
    });
  }

  function run(fn) {
    if (busy) { queued = fn; return; }
    busy = true;
    Promise.resolve().then(fn).catch(err => console.error(err)).then(() => {
      busy = false;
      updateHash();
      if (queued) { const q = queued; queued = null; run(q); }
    });
  }
  function next() {
    run(async () => {
      if (stepForward()) return;           // prima le comparse della scena, poi la scena successiva
      if (onMap) { if (pos === N + 1) return; await enterScene(pos === 0 ? 1 : pos); }
      else if (pos === N) await toMap(N + 1);
      else await move(pos + 1);
    });
  }
  function prev() {
    run(async () => {
      if (stepBack()) return;
      if (onMap) { if (pos === 0) return; await enterScene(pos === N + 1 ? N : pos); }
      else if (pos === 1) await toMap(0);
      else await move(pos - 1);
    });
  }
  function goMap() {
    run(async () => { if (!onMap) await toMap(pos); });
  }

  function updateHash() {
    const h = onMap ? (pos === N + 1 ? '#fine' : pos === 0 ? '#' : '#mappa') : '#' + pos;
    try { history.replaceState(null, '', h === '#' ? location.pathname + location.search : h); } catch (e) { /* file:// in alcuni browser */ }
  }

  /* =====================================================================
     AVVIO (con eventuale salto diretto: index.html#12, #fine)
     ===================================================================== */
  function jumpTo(p) {
    settled = false;
    positionFrames();
    if (p >= 1 && p <= N) {
      const i = p - 1, k = secOf[i];
      primeSteps(i, false);
      showFrame(k); showScene(i);
      cam = stationCam(k); pos = p; onMap = false;
      setDone(k, k); setDots(k, k);
      applyCam(); settle();
      play(sceneEls[i], 150);
    } else {
      showFrame(null);
      cam = { ...MAPCAM }; onMap = true;
      pos = p >= N + 1 ? N + 1 : 0;
      const d = pos === N + 1 ? NS : 0;
      setDone(d, d < NS ? d : -1); setDots(d < NS ? d : -1, d);
      applyCam();
    }
  }
  const h = (location.hash || '').replace('#', '');
  if (/^\d+$/.test(h)) jumpTo(Math.max(1, Math.min(N, +h)));
  else if (h === 'fine') jumpTo(N + 1);
  else jumpTo(0);

  window.addEventListener('resize', () => { if (!settled) { positionFrames(); applyCam(); } });

  /* intro della mappa: il sentiero e le tappe si accendono una dopo l'altra */
  stationEls.forEach((s, k) => s.style.setProperty('--k', k));
  if (onMap && !REDUCED) {
    document.body.classList.add('intro');
    setTimeout(() => document.body.classList.remove('intro'), 4200);
  }

  /* =====================================================================
     PULVISCOLO DORATO (canvas leggero, 30 fps, si ferma a scheda nascosta)
     ===================================================================== */
  (function dust() {
    if (REDUCED) return;
    const cv = document.createElement('canvas');
    cv.className = 'dust';
    document.getElementById('atmo').appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const P = [];
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
    }
    size(); window.addEventListener('resize', size);
    for (let i = 0; i < 70; i++) P.push({
      x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.6,
      vx: (Math.random() - .5) * .00012, vy: -.00006 - Math.random() * .00016,
      ph: Math.random() * 6.28, sp: .4 + Math.random() * 1.2,
    });
    let last = 0;
    function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(100, t - last); last = t;
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02;
        const a = .18 + .32 * (0.5 + 0.5 * Math.sin(t / 1000 * p.sp + p.ph));
        const r = p.r * dpr;
        const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, r * 4);
        g.addColorStop(0, `rgba(232, 205, 140, ${a})`);
        g.addColorStop(1, 'rgba(201, 165, 90, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, r * 4, 0, 6.2832); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  })();

  /* =====================================================================
     INPUT: click ovunque, tastiera, fullscreen, cursore
     ===================================================================== */
  let fsAsked = false;
  function looksFullscreen() {
    return !!document.fullscreenElement ||
      (window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2);
  }
  function requestFS() {
    const d = document.documentElement;
    const f = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!f) return false;
    try { const r = f.call(d); if (r && r.catch) r.catch(() => {}); } catch (e) { return false; }
    return true;
  }
  /* primo gesto: entra in modalità proiezione (senza avanzare) */
  function firstGesture() {
    if (fsAsked) return false;
    fsAsked = true;
    if (looksFullscreen()) return false;
    return requestFS();
  }

  document.addEventListener('click', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.station, #hud button, #index, #jumpbox')) return;
    if (firstGesture()) return;
    next();
  });
  document.getElementById('mapbtn').addEventListener('click', e => {
    e.stopPropagation(); e.currentTarget.blur(); fsAsked = true; goMap();
  });

  /* =====================================================================
     SALTO DIRETTO A UNA SLIDE
     · numero + Invio (come in PowerPoint)   · indice delle slide (tasto I o pulsante)
     ===================================================================== */
  function sceneLabel(sc) {
    if (/Section opener/.test(sc.layout)) return (sc.items[1] || sc.items[0]).s;   // nella Tenda: il sottotitolo, breve
    if (sc.title) return sc.title;
    const it = sc.items[0];
    return it.r || it.s || '';
  }
  /* salto animato: stessa sezione = dissolvenza; altra sezione = passaggio dalla mappa */
  function goTo(p) {
    p = Math.max(1, Math.min(N, p | 0));
    run(async () => {
      if (onMap) { await enterScene(p); return; }
      if (p === pos) return;
      const a = secOf[pos - 1], b = secOf[p - 1];
      primeSteps(p - 1, false);
      if (a === b) { await crossfade(pos - 1, p - 1, p > pos ? 1 : -1); pos = p; return; }
      unsettle();
      await animateCam(MAPCAM, ZOOM_MS);
      showFrame(null);
      onMap = true;
      setDone(b, b); setDots(b, b);
      await wait(REDUCED ? 0 : 350);
      await enterScene(p);
    });
  }

  /* numero digitato */
  const jumpBox = el('div', '', [tx('span', 'jb-n', ''), tx('span', 'jb-t', '')]);
  jumpBox.id = 'jumpbox';
  document.body.appendChild(jumpBox);
  let jumpBuf = '', jumpT = null;
  function showJump() {
    clearTimeout(jumpT);
    if (!jumpBuf) { jumpBox.classList.remove('on'); return; }
    const p = +jumpBuf, ok = p >= 1 && p <= N;
    jumpBox.querySelector('.jb-n').textContent = '→ ' + jumpBuf;
    jumpBox.querySelector('.jb-t').textContent = ok ? sceneLabel(SC[p - 1]) : '—';
    jumpBox.classList.toggle('bad', !ok);
    jumpBox.classList.add('on');
    jumpT = setTimeout(() => { jumpBuf = ''; showJump(); }, 4000);   // se non premi Invio, sparisce
  }

  /* indice delle slide */
  const index = el('div');
  index.id = 'index';
  index.setAttribute('role', 'dialog');
  const idxGrid = el('div', 'ix-grid');
  secs.forEach((sec, k) => {
    const col = el('div', 'ix-sec');
    col.style.setProperty('--acc', SEC_COL[k % SEC_COL.length]);
    col.appendChild(tx('div', 'ix-h', sec.name));
    sec.scenes.forEach(i => {
      const b = el('button', 'ix-it', [tx('span', 'ix-n', String(i + 1)), tx('span', 'ix-t', sceneLabel(SC[i]))]);
      b.dataset.p = i + 1;
      b.addEventListener('click', ev => { ev.stopPropagation(); closeIndex(); goTo(i + 1); });
      col.appendChild(b);
    });
    idxGrid.appendChild(col);
  });
  index.appendChild(idxGrid);
  document.body.appendChild(index);
  index.addEventListener('click', ev => { if (ev.target === index) closeIndex(); ev.stopPropagation(); });
  function openIndex() {
    index.querySelectorAll('.ix-it').forEach(b => b.classList.toggle('cur', !onMap && +b.dataset.p === pos));
    index.classList.add('on');
    wake();
  }
  function closeIndex() { index.classList.remove('on'); }
  const idxBtn = document.getElementById('idxbtn');
  if (idxBtn) idxBtn.addEventListener('click', e => { e.stopPropagation(); e.currentTarget.blur(); fsAsked = true; index.classList.contains('on') ? closeIndex() : openIndex(); });

  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    // --- indice aperto: solo chiusura (o numero + Invio) ---
    if (index.classList.contains('on') && (k === 'Escape' || k === 'i' || k === 'I')) { e.preventDefault(); closeIndex(); return; }
    if (k === 'i' || k === 'I') { e.preventDefault(); openIndex(); return; }
    // --- numero + Invio ---
    if (/^[0-9]$/.test(k)) { e.preventDefault(); jumpBuf = (jumpBuf + k).slice(-3); showJump(); return; }
    if (k === 'Backspace' && jumpBuf) { e.preventDefault(); jumpBuf = jumpBuf.slice(0, -1); showJump(); return; }
    if (k === 'Enter' && jumpBuf) {
      e.preventDefault(); fsAsked = true;
      const p = +jumpBuf; jumpBuf = ''; showJump(); closeIndex();
      if (p >= 1 && p <= N) goTo(p);
      return;
    }
    if (index.classList.contains('on')) return;     // con l'indice aperto le frecce non sfogliano
    if (k === 'ArrowRight' || k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'ArrowDown') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.classList.contains('station') && k === ' ') { document.activeElement.click(); return; }
      if (firstGesture()) return;
      next();
    } else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') {
      e.preventDefault(); fsAsked = true; prev();
    } else if (k === 'Enter') {
      if (document.activeElement && document.activeElement.classList.contains('station')) return; // click nativo
      e.preventDefault();
      if (firstGesture()) return;
      next();
    } else if (k === 'm' || k === 'M') {
      e.preventDefault(); goMap();
    } else if (k === 'f' || k === 'F') {
      e.preventDefault(); fsAsked = true;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else requestFS();
    } else if (k === 'Home') {
      e.preventDefault(); run(async () => { if (!onMap) await toMap(0); else { pos = 0; setDone(0, 0); setDots(0, 0); } });
    }
    // Esc: gestito dal browser (esce dal fullscreen, la pagina resta aperta)
  });

  /* cursore e indicatori: spariscono dopo qualche secondo di inattività */
  let idleT = null, lastXY = '';
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('idle'), IDLE_MS);
  }
  document.addEventListener('mousemove', e => {
    const xy = e.screenX + ',' + e.screenY;
    if (xy === lastXY) return;
    lastXY = xy; wake();
  });
  wake();

  /* =====================================================================
     Modalità di controllo per lo sviluppo: index.html?verifica
     Mostra ogni scena e segnala quelle il cui contenuto esce dal palco.
     ===================================================================== */
  if (/verifica/.test(location.search)) {
    const out = [];
    frameEls.forEach(f => { f.classList.add('vis'); f.style.transform = 'none'; f.style.opacity = 1; });
    mapL.style.visibility = 'hidden';
    world.style.transform = 'none'; settled = true;
    sceneEls.forEach((s, i) => {
      sceneEls.forEach(x => x.classList.remove('on'));
      s.classList.add('on');
      const sb = s.getBoundingClientRect();
      let worst = 0;
      s.querySelectorAll('*').forEach(c => {
        if (c.closest('.art')) return;     // immagini d'atmosfera: ritagliate di proposito
        const r = c.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        worst = Math.max(worst, r.bottom - sb.bottom + 0.5, r.right - sb.right + 0.5, sb.left - r.left + 0.5);
      });
      out.push('scena ' + SC[i].n + ': ' + (worst > 1 ? 'TRABOCCA di ' + worst.toFixed(0) + 'px' : 'ok'));
    });
    sceneEls.forEach(x => x.classList.remove('on'));
    const pre = el('pre');
    pre.id = 'verifica';
    pre.textContent = out.join('\n');
    pre.style.cssText = 'position:fixed;z-index:9;left:0;top:0;color:#fff;font:12px monospace;background:#000;';
    document.body.appendChild(pre);
  }
})();
