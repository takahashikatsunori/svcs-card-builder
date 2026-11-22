'use strict';
/* =========================================================
 * KODAIRA SVCs 名刺メーカー
 * すべてブラウザ内で完結（Canvas で描画 → PNG / PDF を生成）
 * 座標・サイズの単位はすべて mm
 * ========================================================= */

const C = {
  blue: '#2A93C9', orange: '#EF7E2C', green: '#4DA63B', yellow: '#F3C21A',
  ink: '#2A2B1E', cream: '#FBF5E5', forest: '#3B8540', gray: '#77776a',
};
const BRAND4 = [C.blue, C.orange, C.green, C.yellow];

const FONTS = {
  gothic: { fam: '"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif', load: 'Noto Sans JP', w: { reg: 400, mid: 500, bold: 700 } },
  maru:   { fam: '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif', load: 'Zen Maru Gothic', w: { reg: 500, mid: 500, bold: 700 } },
  mincho: { fam: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif', load: 'Noto Serif JP', w: { reg: 400, mid: 600, bold: 700 } },
};

const IMG = {};   // logo, logoT(透過), ig, hp

/* ---------- 画像読み込み・ロゴ背景の透過処理 ---------- */
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// ロゴの生成り色の背景を透明化（外周から塗りつぶし + 文字の穴を除去）
function makeTransparentLogo(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const id = cx.getImageData(0, 0, w, h), p = id.data;
  // 背景色＝四隅の平均
  let br = 0, bg = 0, bb = 0, n = 0;
  for (const [x0, y0] of [[0, 0], [w - 12, 0], [0, h - 12], [w - 12, h - 12]])
    for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) { const i = (y * w + x) * 4; br += p[i]; bg += p[i + 1]; bb += p[i + 2]; n++; }
  br /= n; bg /= n; bb /= n;
  C.cream = `rgb(${Math.round(br)},${Math.round(bg)},${Math.round(bb)})`;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = Math.max(Math.abs(p[i * 4] - br), Math.abs(p[i * 4 + 1] - bg), Math.abs(p[i * 4 + 2] - bb));
  const T = 30;
  const removed = new Uint8Array(w * h), seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const fill = (start, collect) => {
    let sp = 0; stack[sp++] = start; seen[start] = 1; const comp = [];
    while (sp) {
      const i = stack[--sp]; comp.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    function push(j) { if (!seen[j] && dist[j] < T) { seen[j] = 1; stack[sp++] = j; } }
    return comp;
  };
  // 外周から
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!seen[i] && dist[i] < T) fill(i).forEach(j => removed[j] = 1); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!seen[i] && dist[i] < T) fill(i).forEach(j => removed[j] = 1); }
  // 文字部分（下部30%）の小さな穴（O, A, D, R など）
  const maxHole = w * h * 0.004;
  for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!seen[i] && dist[i] < T) { const comp = fill(i); if (comp.length < maxHole) comp.forEach(j => removed[j] = 1); }
  }
  // アルファ設定 + 境界のなじませ
  for (let i = 0; i < w * h; i++) {
    if (removed[i]) { p[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    const nb = (x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (y > 0 && removed[i - w]) || (y < h - 1 && removed[i + w]);
    if (nb && dist[i] < 90) {
      const a = Math.min(1, Math.max(0.05, (dist[i] - T) / (90 - T) + 0.25));
      p[i * 4] = clamp((p[i * 4] - (1 - a) * br) / a);
      p[i * 4 + 1] = clamp((p[i * 4 + 1] - (1 - a) * bg) / a);
      p[i * 4 + 2] = clamp((p[i * 4 + 2] - (1 - a) * bb) / a);
      p[i * 4 + 3] = Math.round(a * 255);
    }
  }
  cx.putImageData(id, 0, 0);
  return cv;
}
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

/* ---------- 描画ヘルパー（mm 単位） ---------- */
const NO_START = '、。，．・：；？！ー）」』】〕〉》｝)]},.!?:;ゃゅょっぁぃぅぇぉャュョッァィゥェォ々ゝヽ';

function makeD(ctx, k, W, H, b, fontKey) {
  const F = FONTS[fontKey] || FONTS.gothic;
  const D = { ctx, k, W, H, b, F };
  const hasLS = 'letterSpacing' in ctx;
  D.setFont = (size, weight, sp = 0, fam = F.fam) => {
    ctx.font = `${weight} ${(size * k).toFixed(2)}px ${fam}`;
    if (hasLS) ctx.letterSpacing = `${(sp * size * k).toFixed(2)}px`;
  };
  D.measure = str => ctx.measureText(str).width / k;
  D.rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x * k, y * k, w * k, h * k); };
  D.bg = color => D.rect(-b, -b, W + 2 * b, H + 2 * b, color);
  D.rrect = (x, y, w, h, r, color) => {
    ctx.beginPath(); ctx.roundRect(x * k, y * k, w * k, h * k, r * k); ctx.fillStyle = color; ctx.fill();
  };
  D.circle = (x, y, r, color) => { ctx.beginPath(); ctx.arc(x * k, y * k, r * k, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
  D.line = (x1, y1, x2, y2, lw, color) => {
    ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.lineWidth = lw * k; ctx.strokeStyle = color; ctx.stroke();
  };
  D.img = (img, x, y, w, h, smooth = true) => {
    ctx.imageSmoothingEnabled = smooth; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x * k, y * k, w * k, h * k);
    ctx.imageSmoothingEnabled = true;
  };
  // 1行テキスト（はみ出す場合は縮小）。y はベースライン
  D.text = (str, x, y, o) => {
    let s = o.size; const min = o.min ?? s * 0.6; const fam = o.fam || F.fam;
    D.setFont(s, o.weight, o.sp || 0, fam);
    while (o.maxW && D.measure(str) > o.maxW && s > min) { s *= 0.96; D.setFont(s, o.weight, o.sp || 0, fam); }
    ctx.fillStyle = o.color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x * k, y * k);
    return { w: D.measure(str), size: s };
  };
  D.wrap = (str, size, weight, maxW) => {
    D.setFont(size, weight);
    const out = [];
    for (const para of String(str).split(/\r?\n/)) {
      if (para === '') { out.push(''); continue; }
      let line = '';
      for (const ch of [...para]) {
        const t = line + ch;
        if (line && D.measure(t) > maxW && !NO_START.includes(ch)) {
          const brk = /[A-Za-z0-9@._\-]/.test(ch) ? line.lastIndexOf(' ') : -1;
          if (brk > 0) { out.push(line.slice(0, brk)); line = line.slice(brk + 1) + ch; }
          else { out.push(line); line = ch; }
        } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  // 複数行テキスト（top 基準）。maxLines / maxH に収まるよう縮小・省略。戻り値＝使用高さ
  D.para = (str, x, top, o) => {
    let s = o.size; const lh = o.lineH || 1.45; const min = o.min ?? s * 0.75;
    const allowed = sz => o.maxH != null ? Math.floor((o.maxH - sz) / (sz * lh) + 1 + 1e-6) : (o.maxLines || 99);
    let lines;
    for (;;) {
      lines = D.wrap(str, s, o.weight, o.maxW);
      const ml = Math.min(allowed(s), o.maxLines || 99);
      if (lines.length <= ml || s <= min) break;
      s = Math.max(min, s * 0.93);
    }
    const ml = Math.min(allowed(s), o.maxLines || 99);
    if (ml < 1) return 0;
    if (lines.length > ml) {
      lines = lines.slice(0, ml);
      D.setFont(s, o.weight);
      let last = lines[ml - 1];
      while (last && D.measure(last + '…') > o.maxW) last = [...last].slice(0, -1).join('');
      lines[ml - 1] = last + '…';
    }
    D.setFont(s, o.weight);
    ctx.fillStyle = o.color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    lines.forEach((ln, i) => ctx.fillText(ln, x * k, (top + s * 0.88 + i * s * lh) * k));
    return lines.length ? (lines.length - 1) * s * lh + s : 0;
  };
  return D;
}

/* ---------- 共通パーツ ---------- */
function colorBar(D, x, y, align = 'left', seg = 5, h = 0.8) {
  const total = seg * 4;
  let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  BRAND4.forEach((c, i) => D.rect(x0 + i * seg, y, seg, h, c));
  return h;
}

// 肩書・氏名・ふりがな・カラーバー。戻り値＝下端 y
function header(D, d, o) {
  const F = D.F; let y = o.top; const al = o.align || 'left';
  const ts = o.ts || 2.7, ns = o.ns || 6.2;
  if (d.title) {
    y += D.para(d.title, o.x, y, { size: ts, weight: F.w.mid, color: o.col.title, align: al, maxW: o.maxW, maxLines: 2, min: 1.9, lineH: 1.3 });
    y += 1.7;
  }
  if (d.name) {
    const r = D.text(d.name, o.x, y + ns * 0.88, { size: ns, weight: F.w.bold, color: o.col.name, align: al, maxW: o.maxW, sp: 0.08, min: 3.2 });
    y += r.size * 1.02;
  }
  if (d.kana) {
    y += 1.0;
    D.text(d.kana, o.x, y + 2.1 * 0.88, { size: 2.1, weight: F.w.reg, color: o.col.kana, align: al, maxW: o.maxW, sp: 0.1, min: 1.5 });
    y += 2.1;
  }
  if (o.bar !== false) { y += 1.9; y += colorBar(D, o.x, y, al); }
  return y;
}

function contactLines(d) {
  const a = [];
  if (d.tel) a.push({ l: 'TEL', v: d.tel });
  if (d.email) a.push({ l: 'MAIL', v: d.email });
  String(d.other || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 3).forEach(v => a.push({ l: '', v }));
  return a;
}

// 連絡先（下端 bottom から上に積む）。戻り値＝上端 y
function contacts(D, d, o) {
  const L = contactLines(d); if (!L.length) return o.bottom;
  const F = D.F, ctx = D.ctx, k = D.k;
  const s = o.size || 2.2, lh = s * 1.5, ls = s * 0.78;
  const anyLabel = L.some(it => it.l);
  const labelW = anyLabel ? s * 3.3 : 0;
  const first = o.bottom - (L.length - 1) * lh;
  L.forEach((it, i) => {
    const by = first + i * lh;
    if (o.align === 'center') {
      D.setFont(ls, F.w.bold, 0.05); const lw = it.l ? D.measure(it.l) + s * 0.6 : 0;
      D.setFont(s, F.w.reg); let vw = D.measure(it.v);
      const maxV = o.maxW - lw; const vs = vw > maxV ? s * maxV / vw : s; vw = Math.min(vw, maxV);
      const x0 = o.x - (lw + vw) / 2;
      if (it.l) D.text(it.l, x0, by, { size: ls, weight: F.w.bold, color: o.col.label, sp: 0.05 });
      D.text(it.v, x0 + lw, by, { size: vs, weight: F.w.reg, color: o.col.value });
    } else {
      if (it.l) D.text(it.l, o.x, by, { size: ls, weight: F.w.bold, color: o.col.label, sp: 0.05 });
      D.text(it.v, o.x + labelW, by, { size: s, weight: F.w.reg, color: o.col.value, maxW: o.maxW - labelW, min: s * 0.6 });
    }
  });
  void ctx; void k;
  return first - s * 0.88;
}

function message(D, d, o) {
  if (!d.message) return 0;
  return D.para(d.message, o.x, o.top, { size: o.size || 2.35, weight: D.F.w.reg, color: o.color, align: o.align || 'left', maxW: o.maxW, maxH: o.bottom - o.top, lineH: 1.5, min: 1.8 });
}

// QRコード（Instagram / 公式HP）
function qrs(D, d, x, y, h, o = {}) {
  const items = [];
  const igW = h * IMG.ig.naturalWidth / IMG.ig.naturalHeight;
  const s = h * 0.8;
  if (d.showIG) items.push({ w: igW, draw: xx => D.img(IMG.ig, xx, y, igW, h) });
  if (d.showHP) items.push({
    w: s, draw: xx => {
      D.img(IMG.hp, xx, y, s, s, false);
      D.text('公式HP', xx + s / 2, y + s + h * 0.125, { size: h * 0.1, weight: 700, color: o.labelColor || '#E0623F', align: 'center', fam: FONTS.gothic.fam, sp: 0.05 });
    }
  });
  if (!items.length) return 0;
  const gap = h * 0.05;
  const tw = items.reduce((a, it) => a + it.w, 0) + gap * (items.length - 1);
  let x0 = o.align === 'right' ? x - tw : o.align === 'center' ? x - tw / 2 : x;
  if (o.box) { const p = o.pad ?? 1; D.rrect(x0 - p, y - p, tw + 2 * p, h + 2 * p, o.r ?? 1.5, '#fff'); }
  items.forEach(it => { it.draw(x0); x0 += it.w + gap; });
  return tw;
}
const hasQR = d => d.showIG || d.showHP;

/* ---------- テンプレート ---------- */
const TEMPLATES = [
  {
    id: 'natural', name: 'ナチュラル', w: 91, h: 55,
    draw(D, d) {
      D.bg(C.cream);
      if (hasQR(d)) {
        D.img(IMG.logoT, 3, 2.5, 30, 30);
        qrs(D, d, 18, 35.6, 15.4, { align: 'center', box: true });
      } else D.img(IMG.logoT, 2.5, 11.5, 32, 32);
      D.line(36.2, 7, 36.2, 48, 0.2, '#d6c9a6');
      const col = { title: C.forest, name: C.ink, kana: C.gray, label: C.orange, value: C.ink };
      const y = header(D, d, { x: 40, top: 7.5, maxW: 47, col });
      const ct = contacts(D, d, { x: 40, bottom: 50, maxW: 47, col });
      message(D, d, { x: 40, top: y + 2.2, bottom: ct - 1.8, maxW: 47, color: '#4a4a3c' });
    },
  },
  {
    id: 'stripe', name: 'カラーストライプ', w: 91, h: 55,
    draw(D, d) {
      const b = D.b;
      D.bg('#fff');
      const sw = (91 + 2 * b) / 4;
      BRAND4.forEach((c, i) => D.rect(-b + i * sw, 52.4, sw + 0.05, 2.6 + b, c));
      if (hasQR(d)) {
        D.img(IMG.logoT, 61.5, 3.5, 24, 24);
        qrs(D, d, 73.5, 30.5, 16, { align: 'center' });
      } else D.img(IMG.logoT, 57, 9, 31, 31);
      const col = { title: C.blue, name: C.ink, kana: C.gray, label: C.blue, value: C.ink };
      const y = header(D, d, { x: 6, top: 7, maxW: 50, col });
      const ct = contacts(D, d, { x: 6, bottom: 48.8, maxW: 50, col });
      message(D, d, { x: 6, top: y + 2.2, bottom: ct - 1.8, maxW: 50, color: '#4a4a3c' });
    },
  },
  {
    id: 'forest', name: 'フォレスト', w: 91, h: 55,
    draw(D, d) {
      const b = D.b;
      D.bg('#fff');
      D.rect(-b, -b, 34 + b, 55 + 2 * b, C.forest);
      const sh = (55 + 2 * b) / 4;
      BRAND4.forEach((c, i) => D.rect(34, -b + i * sh, 1.2, sh + 0.05, c));
      if (hasQR(d)) {
        D.rrect(3, 3, 28, 28, 2.5, C.cream); D.img(IMG.logoT, 4, 4, 26, 26);
        D.rrect(3, 34, 28, 18, 2, '#fff');
        qrs(D, d, 17, 35.3, 15.2, { align: 'center' });
      } else { D.rrect(3, 13.5, 28, 28, 2.5, C.cream); D.img(IMG.logoT, 4, 14.5, 26, 26); }
      const col = { title: C.forest, name: C.ink, kana: C.gray, label: C.forest, value: C.ink };
      const y = header(D, d, { x: 40, top: 7.5, maxW: 47, col });
      const ct = contacts(D, d, { x: 40, bottom: 50, maxW: 47, col });
      message(D, d, { x: 40, top: y + 2.2, bottom: ct - 1.8, maxW: 47, color: '#4a4a3c' });
    },
  },
  {
    id: 'dark', name: 'モダンダーク', w: 91, h: 55,
    draw(D, d) {
      D.bg('#24261D');
      D.rrect(5, 5, 22, 22, 2.5, C.cream); D.img(IMG.logoT, 6, 6, 20, 20);
      const col = { title: C.yellow, name: '#ffffff', kana: '#b8b6a4', label: C.yellow, value: '#f1efe3' };
      const y = header(D, d, { x: 31, top: 6.5, maxW: 55, col, ns: 5.8 });
      const q = hasQR(d) ? qrs(D, d, 86, 35, 15, { align: 'right', box: true, pad: 1 }) : 0;
      const mw = q ? 86 - q - 2 - 2 - 5 : 81;
      const ct = contacts(D, d, { x: 5, bottom: 50.5, maxW: mw, col });
      message(D, d, { x: 5, top: Math.max(y, 27) + 3, bottom: ct - 1.8, maxW: mw, color: '#e6e4d6' });
    },
  },
  {
    id: 'vertical', name: '縦型', w: 55, h: 91,
    draw(D, d) {
      const b = D.b;
      D.bg('#fff');
      D.rect(-b, -b, 55 + 2 * b, 36 + b, C.cream);
      const sw = (55 + 2 * b) / 4;
      BRAND4.forEach((c, i) => D.rect(-b + i * sw, 36, sw + 0.05, 1.2, c));
      D.img(IMG.logoT, 11.5, 2.5, 32, 32);
      const col = { title: C.forest, name: C.ink, kana: C.gray, label: C.orange, value: C.ink };
      const y = header(D, d, { x: 27.5, top: 41.5, maxW: 47, align: 'center', col, bar: false });
      let bottom = 87;
      if (hasQR(d)) { qrs(D, d, 27.5, 73.5, 14.5, { align: 'center' }); bottom = 71; }
      const ct = contacts(D, d, { x: 27.5, bottom, maxW: 47, align: 'center', col, size: 2.1 });
      message(D, d, { x: 27.5, top: y + 2.2, bottom: ct - 1.8, maxW: 47, align: 'center', color: '#4a4a3c', size: 2.2 });
    },
  },
];

/* ---------- レンダリング ---------- */
function renderCard(tpl, d, k, bleed = 0, canvas) {
  const cv = canvas || document.createElement('canvas');
  cv.width = Math.round((tpl.w + 2 * bleed) * k);
  cv.height = Math.round((tpl.h + 2 * bleed) * k);
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.translate(bleed * k, bleed * k);
  const D = makeD(ctx, k, tpl.w, tpl.h, bleed, d.font);
  tpl.draw(D, d);
  return cv;
}

async function ensureFonts(d) {
  const f = FONTS[d.font] || FONTS.gothic;
  const text = [d.title, d.name, d.kana, d.message, d.tel, d.email, d.other, 'TELMAIL公式HP0123456789…'].join('');
  const specs = new Set();
  Object.values(f.w).forEach(w => specs.add(`${w} 20px "${f.load}"`));
  specs.add('700 20px "Noto Sans JP"');
  try { await Promise.all([...specs].map(s => document.fonts.load(s, text))); } catch (e) { /* オフライン時はシステムフォント */ }
}

/* ---------- PDF 生成（JPEG 埋め込みの最小 PDF） ---------- */
const PT = 72 / 25.4;
function dataURLtoBytes(u) {
  const s = atob(u.split(',')[1]); const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function buildPDF({ pageW, pageH, trim, image, placements, title }) {
  const enc = new TextEncoder();
  const chunks = []; let len = 0; const offsets = [];
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
  const f = v => (Math.round(v * 1000) / 1000).toString();
  const W = pageW * PT, H = pageH * PT;
  let content = '';
  for (const p of placements) {
    const x = p.x * PT, w = p.w * PT, h = p.h * PT, y = H - (p.y * PT) - h;
    content += p.rot
      ? `q 0 ${f(h)} ${f(-w)} 0 ${f(x + w)} ${f(y)} cm /Im0 Do Q\n`
      : `q ${f(w)} 0 0 ${f(h)} ${f(x)} ${f(y)} cm /Im0 Do Q\n`;
  }
  const obj = (n, body) => { offsets[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  const trimStr = trim ? ` /TrimBox [${f(trim * PT)} ${f(trim * PT)} ${f(W - trim * PT)} ${f(H - trim * PT)}]` : '';
  obj(3, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}]${trimStr} /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => {
    put(`<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    put(image.bytes); put('\nendstream');
  });
  const cBytes = enc.encode(content);
  obj(5, () => { put(`<< /Length ${cBytes.length} >>\nstream\n`); put(cBytes); put('\nendstream'); });
  const t = Array.from(title || 'card').map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  obj(6, () => put(`<< /Title <FEFF${t}> /Producer (KODAIRA SVCs Card Builder) >>`));
  const xref = len;
  put(`xref\n0 7\n0000000000 65535 f \n`);
  for (let i = 1; i <= 6; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/* ---------- UI ---------- */
const $ = s => document.querySelector(s);
const form = $('#form');
const STORE = 'svcs-card-builder-v1';
const DEFAULTS = {
  tpl: 'natural', font: 'gothic', title: 'サポーター', name: '小平 太郎', kana: 'Taro Kodaira',
  message: 'いざという時、地域の力に。', tel: '', email: '', other: '', showIG: true, showHP: true,
};
let state = { ...DEFAULTS };
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* ignore */ }

function readForm() {
  const fd = new FormData(form);
  ['title', 'name', 'kana', 'message', 'tel', 'email', 'other'].forEach(n => state[n] = (fd.get(n) || '').toString().trim());
  state.font = fd.get('font') || 'gothic';
  state.showIG = form.showIG.checked; state.showHP = form.showHP.checked;
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
function writeForm() {
  ['title', 'name', 'kana', 'message', 'tel', 'email', 'other'].forEach(n => form[n].value = state[n] || '');
  form.querySelectorAll('input[name=font]').forEach(r => r.checked = r.value === state.font);
  form.showIG.checked = !!state.showIG; form.showHP.checked = !!state.showHP;
}
const currentTpl = () => TEMPLATES.find(t => t.id === state.tpl) || TEMPLATES[0];

function buildTemplateGrid() {
  const grid = $('#templateGrid'); grid.innerHTML = '';
  TEMPLATES.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tpl'; btn.dataset.id = t.id;
    btn.innerHTML = `<canvas></canvas><span>${t.name}</span>`;
    btn.onclick = () => { state.tpl = t.id; readForm(); refresh(); };
    grid.appendChild(btn);
  });
}

let timer = null, token = 0;
function refresh() { clearTimeout(timer); timer = setTimeout(draw, 60); }
async function draw() {
  const my = ++token;
  readForm();
  const d = { ...state };
  const paint = () => {
    const t = currentTpl();
    renderCard(t, d, 14, 0, $('#previewCanvas'));
    document.querySelectorAll('.tpl').forEach(btn => {
      const tt = TEMPLATES.find(x => x.id === btn.dataset.id);
      btn.classList.toggle('active', tt.id === t.id);
      renderCard(tt, d, 3, 0, btn.querySelector('canvas'));
    });
    $('#sizeInfo').textContent = `${t.w}×${t.h}mm`;
    const w = [];
    if (!d.title) w.push('肩書'); if (!d.name) w.push('氏名');
    $('#warn').hidden = !w.length; $('#warn').textContent = w.length ? `※ ${w.join('・')}が未入力です。` : '';
  };
  paint();                       // まず即時描画
  await ensureFonts(d);
  if (my === token) paint();     // フォント読み込み後に再描画
}

function safeName(s) { return (s || 'card').replace(/[\\/:*?"<>|\s]+/g, '_'); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function withBusy(btn, fn) {
  btn.disabled = true; const t = btn.textContent; btn.textContent = '生成中…';
  try { readForm(); await ensureFonts(state); await new Promise(r => setTimeout(r, 30)); await fn(); }
  catch (e) { console.error(e); alert('生成に失敗しました：' + e.message); }
  finally { btn.disabled = false; btn.textContent = t; }
}
const dpiK = () => Number($('#dpi').value) / 25.4;
const baseName = () => `KODAIRA-SVCs_名刺_${safeName(state.name)}_${currentTpl().id}`;

$('#dlPng').onclick = e => withBusy(e.currentTarget, async () => {
  const bleed = $('#bleed').checked ? 3 : 0;
  const cv = renderCard(currentTpl(), state, dpiK(), bleed);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  download(blob, `${baseName()}_${$('#dpi').value}dpi${bleed ? '_塗り足し' : ''}.png`);
});

$('#dlPdf').onclick = e => withBusy(e.currentTarget, async () => {
  const t = currentTpl(); const bleed = $('#bleed').checked ? 3 : 0;
  const cv = renderCard(t, state, dpiK(), bleed);
  const image = { bytes: dataURLtoBytes(cv.toDataURL('image/jpeg', 0.95)), w: cv.width, h: cv.height };
  const pw = t.w + 2 * bleed, ph = t.h + 2 * bleed;
  const blob = buildPDF({ pageW: pw, pageH: ph, trim: bleed, image, placements: [{ x: 0, y: 0, w: pw, h: ph }], title: `名刺 ${state.name}` });
  download(blob, `${baseName()}${bleed ? '_塗り足し' : ''}.pdf`);
});

$('#dlSheet').onclick = e => withBusy(e.currentTarget, async () => {
  const t = currentTpl();
  const cv = renderCard(t, state, dpiK(), 0);
  const image = { bytes: dataURLtoBytes(cv.toDataURL('image/jpeg', 0.95)), w: cv.width, h: cv.height };
  const rot = t.h > t.w; // 縦型は90°回転して配置
  const placements = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) placements.push({ x: 14 + c * 91, y: 11 + r * 55, w: 91, h: 55, rot });
  const blob = buildPDF({ pageW: 210, pageH: 297, image, placements, title: `名刺 A4 10面 ${state.name}` });
  download(blob, `${baseName()}_A4-10面.pdf`);
});

form.addEventListener('input', refresh);
form.addEventListener('change', refresh);

(async function init() {
  const A = window.SVCS_ASSETS;
  [IMG.logo, IMG.ig, IMG.hp] = await Promise.all([loadImage(A.logo), loadImage(A.ig), loadImage(A.hp)]);
  IMG.logoT = makeTransparentLogo(IMG.logo);
  writeForm();
  buildTemplateGrid();
  draw();
})();
