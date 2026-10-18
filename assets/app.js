// Saint Data — app de página única, sem dependências.
const $view = document.getElementById("view");
const S = { data: null, series: null, byId: new Map(), rank: new Map(), studios: [], watch: new Set() };

/* ================= utilidades ================= */
const nf = new Intl.NumberFormat("pt-BR");
const fmtSig = (v, d) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
function sig3(v) { const a = Math.abs(v); return fmtSig(v, a >= 100 ? 0 : a >= 10 ? 1 : 2); }
function compact(n) {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return sig3(n / 1e9) + " bi";
  if (a >= 1e6) return sig3(n / 1e6) + " mi";
  if (a >= 1e3) return sig3(n / 1e3) + " mil";
  return nf.format(Math.round(n));
}
function chg(x, { plain = false } = {}) {
  if (x == null || !isFinite(x)) return '<span class="chg muted">—</span>';
  const v = x * 100, a = Math.abs(v);
  const txt = (a >= 100 ? fmtSig(a, 0) : a >= 10 ? fmtSig(a, 1) : fmtSig(a, 2)) + "%";
  if (a < 0.005) return `<span class="chg muted">0%</span>`;
  const up = v > 0;
  return `<span class="chg ${up ? "up" : "down"}">${plain ? "" : `<span class="tri">${up ? "▲" : "▼"}</span>`}${txt}</span>`;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function ago(iso) {
  if (!iso) return "—";
  const s = (new Date(iso).getTime() - Date.now()) / 1000, a = Math.abs(s);
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute").replace("minutos", "min").replace("minuto", "min");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  if (a < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), "month");
  return rtf.format(Math.round(s / (86400 * 365)), "year");
}
const days = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
const dshort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dlong = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dt = (d) => new Date(d + "T12:00:00");
const likes = (g) => (g.up + g.down > 0 ? g.up / (g.up + g.down) : null);
const GENRES = { "Simulation": "Simulação", "Survival": "Sobrevivência", "Action": "Ação", "Roleplay & Avatar Sim": "Roleplay e Avatar", "Sports & Racing": "Esportes e Corrida", "Shooter": "Tiro", "RPG": "RPG", "Strategy": "Estratégia", "Shopping": "Compras", "Party & Casual": "Festa e Casual", "Adventure": "Aventura", "Obby & Platformer": "Obby e Plataforma", "Puzzle": "Quebra-cabeça", "Social": "Social", "Entertainment": "Entretenimento", "Education": "Educação", "Utility & Other": "Utilidade", "": "Sem gênero" };
const genre = (g) => GENRES[g] ?? g;
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

function icon(g, cls = "ic") {
  const L = esc(((g?.name || "?").match(/[\p{L}\p{N}]/u) || ["?"])[0].toUpperCase());
  return g?.icon ? `<img class="${cls}" src="${esc(g.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls}" aria-hidden="true">${L}</span>`;
}
const gl = (g) => `#/jogo/${g.id}`;
const sl = (name) => `#/estudio/${encodeURIComponent(name)}`;
const goIcon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>';
const starSvg = (on) => `<svg viewBox="0 0 20 20" width="16" height="16" ${on ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/></svg>`;

/* ================= séries ================= */
const BASE = window.SD_DATA || "https://raw.githubusercontent.com/SaintLukz/saint-data/dados/";
const HOUR = 3600e3;
function lastN(arr, n) { return arr.slice(Math.max(0, arr.length - n)); }
const spark = (g) => g.spark || [];
function peakOf(g) { return g.peak > 0 && g.days > 1 ? { v: g.peak, date: g.peakDate } : null; }
const hourlyPts = (s) => (s?.h || []).map((y, i) => ({ x: s.h0 + i * HOUR, y, hourly: true }));
const dailyPts = (d, key = "peak") => (d?.dates || []).map((x, i) => ({ x: new Date(x + "T12:00:00").getTime(), y: d[key][i], hourly: false }));
const gameCache = new Map();
async function loadGame(id) {
  if (!gameCache.has(id)) gameCache.set(id, fetch(BASE + "g/" + id + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return gameCache.get(id);
}
function sparkline(vals, w = 48, h = 22) {
  const v = vals.filter((x) => x != null);
  if (v.length < 2) return `<svg width="${w}" height="${h}" aria-hidden="true"><line x1="2" x2="${w - 2}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="2 3"/></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * (w - 2) + 1, h - 3 - ((y - lo) / r) * (h - 6)]);
  const up = v[v.length - 1] >= v[0];
  const c = up ? "var(--up)" : "var(--down)";
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${w - 1},${h}L1,${h}Z" fill="${c}" opacity=".12"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

/* ================= gráfico grande ================= */
const hfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (p) => (p.hourly ? hfmt.format(new Date(p.x)) : dshort.format(new Date(p.x)));
function bigChart(box, pts, fmt) {
  const real = pts.filter((p) => p.y != null);
  if (real.length < 2) {
    box.innerHTML = `<div class="chart-empty">Ainda há poucos pontos neste período.<br>O gráfico se completa conforme a coleta de hora em hora acumula histórico.</div>`;
    return;
  }
  const W = 640, H = 300, pt = 28, pb = 6;
  const ys = real.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo *= 0.95; hi *= 1.05; }
  lo -= (hi - lo) * 0.08;
  const n = pts.length;
  const X = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * (W - 12) + 2);
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let d = "", first = null, last = null, on = false, imax = null;
  pts.forEach((p, i) => { if (p.y == null) { on = false; return; } d += (on ? "L" : "M") + X(i).toFixed(1) + "," + Y(p.y).toFixed(1); on = true; first ??= i; last = i; if (imax == null || p.y > pts[imax].y) imax = i; });
  const dots = `<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--faint)"/></pattern>`;
  const grad = `<linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de jogadores"><defs>${dots}${grad}</defs><rect width="${W}" height="${H}" fill="url(#dots)"/>
    <path d="${d}L${X(last)},${H}L${X(first)},${H}Z" fill="url(#ar)"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(imax)}" cy="${Y(pts[imax].y)}" r="3" fill="var(--fg)"/>
    <circle cx="${X(last)}" cy="${Y(pts[last].y)}" r="9" fill="var(--accent)" opacity=".15"/><circle cx="${X(last)}" cy="${Y(pts[last].y)}" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.5"/>
    <line class="hl" x1="0" x2="0" y1="${pt}" y2="${H}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/><circle class="hd" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.5" visibility="hidden"/></svg>
    <div class="tip" style="left:${(X(imax) / W) * 100}%">${esc(fmt(pts[imax].y))}<span>${when(pts[imax])}</span></div>`;
  const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), hl = svg.querySelector(".hl"), hd = svg.querySelector(".hd");
  const reset = () => { hl.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); tip.style.left = (X(imax) / W) * 100 + "%"; tip.innerHTML = `${esc(fmt(pts[imax].y))}<span>${when(pts[imax])}</span>`; };
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
    let b = last, bd = Infinity;
    pts.forEach((p, i) => { if (p.y != null && Math.abs(X(i) - x) < bd) { bd = Math.abs(X(i) - x); b = i; } });
    hl.setAttribute("x1", X(b)); hl.setAttribute("x2", X(b)); hl.setAttribute("visibility", "visible");
    hd.setAttribute("cx", X(b)); hd.setAttribute("cy", Y(pts[b].y)); hd.setAttribute("visibility", "visible");
    tip.style.left = (X(b) / W) * 100 + "%";
    tip.innerHTML = `${esc(fmt(pts[b].y))}<span>${when(pts[b])}</span>`;
  });
  svg.addEventListener("pointerleave", reset);
}
const RANGES = [["1D", 24, "h"], ["1S", 168, "h"], ["1M", 720, "h"], ["3M", 92, "d"], ["1A", 366, "d"], ["Tudo", Infinity, "d"]];
function rangedChart(host, src, fmt, key) {
  let range = store.get("sd-range-" + key, "1S"), mode = "live";
  const draw = () => {
    const [, n, kind] = RANGES.find((r) => r[0] === range) ?? RANGES[1];
    let pts;
    if (kind === "h" && mode === "live" && src.hourly) pts = lastN(hourlyPts(src.hourly), n);
    else { const dd = kind === "h" ? Math.ceil(n / 24) : n; pts = dailyPts(src.daily); if (isFinite(dd)) pts = lastN(pts, dd); }
    bigChart(host.querySelector(".chart"), pts, fmt);
    host.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", b.dataset.range === range));
    host.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  };
  host.querySelector(".seg-row").innerHTML = `<div class="seg">${RANGES.map(([k]) => `<button type="button" data-range="${k}">${k}</button>`).join("")}</div><div class="seg"><button type="button" data-mode="live"><span class="live-dot"></span>Ao vivo</button><button type="button" data-mode="peak">Pico diário</button></div>`;
  host.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { range = b.dataset.range; store.set("sd-range-" + key, range); draw(); }));
  host.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; draw(); }));
  draw();
}

/* ================= agregações ================= */
function buildStudios() {
  const m = new Map();
  for (const g of S.data.games) {
    const k = g.creator || "Desconhecido";
    const e = m.get(k) ?? { name: k, verified: g.verified, type: g.creatorType, playing: 0, prev: 0, prevOk: true, visits: 0, games: [] };
    e.playing += g.playing; e.visits += g.visits; e.games.push(g);
    if (g.d1 != null) e.prev += g.playing / (1 + g.d1); else e.prevOk = false;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, d1: e.prevOk && e.prev > 0 ? e.playing / e.prev - 1 : null, newest: Math.min(...e.games.map((g) => days(g.created))) })).sort((a, b) => b.playing - a.playing);
}
function studioSpark(st) {
  return Array.from({ length: 24 }, (_, i) => { let s = 0, any = false; for (const g of st.games) { const v = spark(g)[i]; if (v != null) { s += v; any = true; } } return any ? s : null; });
}
function genreStats() {
  const m = new Map();
  for (const g of S.data.games) {
    const e = m.get(g.genre) ?? { genre: g.genre, playing: 0, prev: 0, ok: true, n: 0 };
    e.playing += g.playing; e.n++;
    if (g.d1 != null) e.prev += g.playing / (1 + g.d1); else e.ok = false;
    m.set(g.genre, e);
  }
  const tot = S.data.total || 1;
  return [...m.values()].map((e) => ({ ...e, share: e.playing / tot, d1: e.ok && e.prev ? e.playing / e.prev - 1 : null })).sort((a, b) => b.playing - a.playing);
}
const STOP = new Set(["the", "and", "for", "you", "with", "your", "new", "game", "simulator", "roblox", "update", "event", "beta", "alpha", "free", "upd", "updated", "das", "dos", "com", "para", "uma", "del", "los", "las"]);
function keywordTrends() {
  const recent = S.data.games.filter((g) => days(g.created) <= 30);
  const m = new Map();
  for (const g of recent) {
    const words = new Set((g.name.toLowerCase().match(/[\p{L}\p{N}+]{3,}/gu) || []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)));
    for (const w of words) { const e = m.get(w) ?? { w, n: 0, playing: 0, top: g }; e.n++; e.playing += g.playing; if (g.playing > e.top.playing) e.top = g; m.set(w, e); }
  }
  return [...m.values()].filter((e) => e.n >= 2).sort((a, b) => b.playing - a.playing);
}
const MILESTONES = [1e3, 2500, 5e3, 1e4, 25e3, 5e4, 1e5, 25e4, 5e5, 1e6, 2e6, 5e6];
function milestones() {
  return S.data.games.map((g) => { const next = MILESTONES.find((m) => m > g.playing); return next ? { g, next, frac: g.playing / next } : null; })
    .filter((x) => x && x.frac >= 0.8).sort((a, b) => b.next - a.next || b.frac - a.frac);
}
function treemap(items, W, H) {
  // squarified simples
  const total = items.reduce((a, b) => a + b.v, 0);
  const out = []; let x = 0, y = 0, w = W, h = H, rest = items.slice();
  const worst = (row, len, sum) => { const s2 = sum * sum, l2 = len * len; let mx = 0, mn = Infinity; for (const r of row) { mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); } return Math.max((l2 * mx) / s2, s2 / (l2 * mn)); };
  const scale = (W * H) / total;
  rest = rest.map((r) => ({ ...r, a: r.v * scale }));
  while (rest.length) {
    const len = Math.min(w, h); let row = [rest[0]], sum = rest[0].a, i = 1;
    while (i < rest.length) { const nr = row.concat(rest[i]), ns = sum + rest[i].a; if (worst(nr, len, ns) <= worst(row, len, sum)) { row = nr; sum = ns; i++; } else break; }
    const thick = sum / len; let off = 0;
    for (const r of row) { const sz = r.a / thick; if (w >= h) out.push({ ...r, x, y: y + off, w: thick, h: sz }); else out.push({ ...r, x: x + off, y, w: sz, h: thick }); off += sz; }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}

/* ================= componentes ================= */
function card(title, sub, href, body, foot = "") {
  return `<section class="card"><div class="card-h"><h3>${title}${sub ? `<small>${sub}</small>` : ""}</h3>${href ? `<a class="go" href="${href}" aria-label="Ver mais">${goIcon}</a>` : ""}</div>${body}${foot ? `<div class="card-foot">${foot}</div>` : ""}</section>`;
}
function rowSpark(g, sub, right) {
  return `<a class="r spark" href="${gl(g)}">${icon(g)}<span class="t"><span class="nm">${esc(g.name)}</span><span class="sb">${sub}</span></span><span>${sparkline(spark(g))}</span><span class="v">${right}</span></a>`;
}
function rowPlain(g, sub, right, rightSub = "") {
  return `<a class="r" href="${gl(g)}">${icon(g)}<span class="t"><span class="nm">${esc(g.name)}</span><span class="sb">${sub}</span></span><span class="v">${right}${rightSub}</span></a>`;
}
function rowStar(g) {
  const on = S.watch.has(g.id);
  return `<div class="r star"><a href="${gl(g)}">${icon(g)}</a><a class="t" href="${gl(g)}"><span class="nm">${esc(g.name)}</span><span class="sb">${esc(genre(g.genre))}</span></a><span class="v">${compact(g.playing)}${chg(g.d7 ?? g.d1)}</span><button class="star-btn${on ? " on" : ""}" type="button" data-star="${g.id}" aria-label="${on ? "Remover da" : "Adicionar à"} watchlist">${starSvg(on)}</button></div>`;
}
function wireStars(root, rerender) {
  root.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const id = Number(b.dataset.star);
    S.watch.has(id) ? S.watch.delete(id) : S.watch.add(id);
    store.set("sd-watch", [...S.watch]);
    rerender ? rerender() : (b.classList.toggle("on", S.watch.has(id)), (b.innerHTML = starSvg(S.watch.has(id))));
  }));
}
const empty = (t) => `<p class="empty">${t}</p>`;

/* ================= páginas ================= */
function pageHome() {
  const G = S.data.games, T = S.total;
  const prev = (() => { const i = Math.round((S.data.hour - 24 * HOUR - T.h0) / HOUR); return i >= 0 ? T.h[i] ?? null : null; })();
  const hasD1 = G.some((g) => g.d1 != null);
  const rising = G.filter((g) => g.d1 != null && g.playing >= 2000).sort((a, b) => b.d1 - a.d1).slice(0, 4);
  const trending = G.filter((g) => g.lists?.includes("top-trending")).slice(0, 3);
  const gen = genreStats().slice(0, 4);
  const ms = milestones().slice(0, 3);
  const studios = S.studios.slice(0, 4);
  const fresh = G.filter((g) => days(g.created) <= 30).slice(0, 4);
  const updated = G.slice().sort((a, b) => new Date(b.updated) - new Date(a.updated)).slice(0, 4);
  const breakouts = G.map((g) => ({ g, p: peakOf(g) })).filter((x) => x.p && x.g.playing < x.p.v * 0.6).sort((a, b) => b.p.v - a.p.v).slice(0, 4);
  const ups = G.filter((g) => g.d1 > 0).length, downs = G.filter((g) => g.d1 < 0).length;
  const atPeak = G.some((g) => spark(g).filter((v) => v != null).length > 1) ? G.filter((g) => g.playing >= g.high24 && spark(g).filter((v) => v != null).length > 1).length : null;
  const sorted = G.map((g) => g.playing);
  let half = 0, acc = 0; for (const v of sorted) { acc += v; half++; if (acc >= S.data.total / 2) break; }
  const median = sorted[Math.floor(sorted.length / 2)];
  const kw = keywordTrends().slice(0, 4);
  const months = monthly();

  $view.innerHTML = `<div class="home fade">
  <div class="col">
    <section class="hero" id="hero">
      <div class="hero-lbl">Jogando agora nos ${nf.format(G.length)} maiores jogos</div>
      <div class="hero-num">${nf.format(S.data.total)}</div>
      <div class="hero-delta">${prev ? `<span class="chg ${S.data.total >= prev ? "up" : "down"}"><span class="tri">${S.data.total >= prev ? "▲" : "▼"}</span>${compact(Math.abs(S.data.total - prev))} (${chg(S.data.total / prev - 1, { plain: true }).replace(/<[^>]+>/g, "")})</span><span class="muted">Últimas 24h</span>` : `<span class="muted">Primeira coleta · ${ago(S.data.t)}</span>`}</div>
      <div class="chart"></div>
      <div class="seg-row"></div>
    </section>
    <div class="grid2">
      ${card("Subindo", "Últimas 24h", "#/jogos/subindo", hasD1 ? `<div class="rows">${rising.map((g) => rowSpark(g, `${compact(g.playing)} jogando`, chg(g.d1))).join("")}</div>` : empty("A variação de 24h aparece quando houver 24 horas de coleta."))}
      ${card("Em alta", "Lista do Roblox", "#/jogos", `<div class="rows">${trending.map((g) => rowPlain(g, esc(genre(g.genre)), compact(g.playing), '<span class="sbv">jogando</span>')).join("") || empty("Sem dados.")}</div>`)}
      ${card("Gêneros", `Top ${nf.format(G.length)} · jogadores vs 24h atrás`, "#/generos", gen.map((x) => `<a class="hbar" href="#/genero/${encodeURIComponent(x.genre)}"><span class="l">${esc(genre(x.genre))}</span><span class="trk"><i style="width:${(x.share / gen[0].share) * 100}%"></i></span><span class="p">${Math.round(x.share * 100)}%</span>${chg(x.d1)}</a>`).join(""))}
      ${card("Marcos", "Perto do próximo", "#/jogos", ms.map(({ g, next, frac }) => `<a class="ms" href="${gl(g)}">${icon(g)}<span class="t" style="min-width:0"><span class="nm" style="font-size:13px;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</span><span class="trk"><i style="width:${frac * 100}%"></i></span></span><span class="v">${compact(next)}<small>faltam ${compact(next - g.playing)}</small></span></a>`).join("") || empty("Nenhum jogo perto de um marco."))}
    </div>
  </div>
  <aside class="rail">
    <div class="rail-h">Para você</div>
    <a class="promo" href="#/meus-jogos"><div><b>Monte sua watchlist</b><p>Toque na <strong>estrela</strong> de qualquer jogo para acompanhar seus favoritos em <strong>Meus jogos</strong>.</p></div><div class="stack">${G.slice(0, 3).map((g, i) => (g.thumb || g.icon ? `<img src="${esc(g.icon)}" alt="" referrerpolicy="no-referrer" style="left:${i * 22}px;top:${[14, 4, 18][i]}px;transform:rotate(${[-8, 0, 8][i]}deg);z-index:${i === 1 ? 2 : 1}">` : "")).join("")}</div></a>
    <section class="card" id="mp"></section>
    <section class="card"><div class="card-h"><h3>${months.label}</h3><small class="muted" style="text-decoration:underline dotted">Média do pico diário</small></div>
      <div class="big-stat">${compact(months.cur)}${months.prev ? chg(months.cur / months.prev - 1) + '<small class="muted" style="font-size:12px;font-weight:500">vs mês anterior</small>' : ""}</div>
      <div class="qbars">${months.items.map((m, i) => `<div><i class="${i === months.items.length - 1 ? "now" : ""}" style="height:${Math.max(6, (m.v / months.max) * 100)}%"></i><span>${m.k}</span></div>`).join("")}</div></section>
  </aside>
  </div>
  <div class="wrap" style="max-width:960px">
    <h2 class="sec-title">Mais jogos</h2>
    <div class="grid3" style="margin-top:12px">
      ${card("Quedas desde o pico", "Como estão agora", "#/jogos/caindo", breakouts.length ? `<div class="rows">${breakouts.map(({ g, p }) => `<a class="r" href="${gl(g)}">${icon(g)}<span class="t"><span class="nm">${esc(g.name)}</span><span class="sb">Pico ${compact(p.v)} · agora ${compact(g.playing)}</span></span><span class="chip">Perdeu ${Math.round((1 - g.playing / p.v) * 100)}%</span></a>`).join("")}</div>` : empty("Aparece quando houver alguns dias de histórico."))}
      ${card("Novos e crescendo", "Menos de 30 dias", "#/jogos/novos", `<div class="rows">${fresh.map((g) => rowSpark(g, `${Math.max(0, Math.round(days(g.created)))} dias · ${compact(g.playing)}`, chg(g.d1))).join("") || empty("Nenhum jogo novo no top.")}</div>`)}
      ${card("Recém-atualizados", "Novas versões", "#/jogos/atualizados", `<div class="rows">${updated.map((g) => rowSpark(g, `${compact(g.playing)} jogando`, `<span class="sbv">${ago(g.updated)}</span>`)).join("")}</div>`)}
    </div>
    <h2 class="sec-title">Todo o Roblox</h2>
    <div class="grid3" style="margin-top:12px">
      ${card("Top estúdios", "vs 24h atrás", "#/estudios", `<div class="rows">${studios.map((st) => `<a class="r" href="${sl(st.name)}">${icon(st.games[0])}<span class="t"><span class="nm">${esc(st.name)}</span><span class="sb">${esc(st.games[0].name)}${st.games.length > 1 ? ` + ${st.games.length - 1} mais` : ""}</span></span><span class="v">${compact(st.playing)}${chg(st.d1)}</span></a>`).join("")}</div>`)}
      ${card("Todos os jogos", `Top ${nf.format(G.length)} · vs 24h atrás`, "#/jogos", `
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span class="up">${hasD1 ? nf.format(ups) + " subindo" : "—"}</span><span class="down">${hasD1 ? nf.format(downs) + " caindo" : ""}</span></div>
        <div class="ud-bar">${hasD1 ? `<i style="flex:${ups};background:var(--up)"></i><i style="flex:${downs};background:var(--down)"></i>` : '<i style="flex:1;background:var(--card-2)"></i>'}</div>
        <div class="kv"><span>Na máxima de 24h</span><b>${atPeak == null ? "—" : nf.format(atPeak)}</b></div>
        <div class="kv"><span>Atualizados no último dia</span><b>${nf.format(G.filter((g) => days(g.updated) <= 1).length)}</b></div>
        <div class="kv"><span>Com menos de 30 dias</span><b>${nf.format(G.filter((g) => days(g.created) <= 30).length)}</b></div>`)}
      ${card("Mapa de calor", hasD1 ? "Últimas 24h" : "Por jogadores", "#/jogos", '<div class="tm" id="tm"></div>')}
    </div>
    <h2 class="sec-title">Mais estatísticas</h2>
    <div class="grid3" style="margin-top:12px">
      ${card("Tendências", "Jogos novos, 30 dias", "#/tendencias", `<div class="rows">${kw.map((k) => `<a class="r" href="#/tendencias">${icon(k.top)}<span class="t"><span class="nm">“${esc(k.w)}”</span><span class="sb">${compact(k.playing)} jogando</span></span><span class="v">${k.n}<span class="sbv">jogos</span></span></a>`).join("") || empty("Sem palavras repetidas nos jogos novos.")}</div>`)}
      ${card("Mais visitados", "Visitas de todos os tempos", "#/jogos/visitas", `<div class="rows">${G.slice().sort((a, b) => b.visits - a.visits).slice(0, 4).map((g) => rowPlain(g, `${compact(g.playing)} jogando`, compact(g.visits), '<span class="sbv">visitas</span>')).join("")}</div>`)}
      ${card("Todos os jogos", "Agora", "#/jogos", `
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span style="color:var(--accent)">${half} jogos</span><span class="muted">${nf.format(G.length - half)} jogos</span></div>
        <div class="ud-bar"><i style="flex:1;background:var(--accent)"></i><i style="flex:1;background:var(--card-2)"></i></div>
        <div style="text-align:center;font-size:12px" class="muted">Cada lado tem metade dos jogadores</div>
        <div class="kv"><span>Com mais de 1.000 jogando</span><b>${nf.format(G.filter((g) => g.playing > 1000).length)}</b></div>
        <div class="kv"><span>Com mais de 100 mil jogando</span><b>${nf.format(G.filter((g) => g.playing > 1e5).length)}</b></div>
        <div class="kv"><span>Jogo mediano do top</span><b>${nf.format(median)} jogando</b></div>`)}
    </div>
  </div>`;
  rangedChart(document.getElementById("hero"), { hourly: T, daily: T.d }, (v) => compact(v), "home");
  mostPlayed();
  const tm = document.getElementById("tm");
  const W = tm.clientWidth || 260, H = tm.clientHeight || 172;
  const items = G.slice(0, 40).map((g) => ({ g, v: g.playing }));
  tm.innerHTML = treemap(items, W, H).map(({ g, x, y, w, h }) => {
    const c = g.d1 == null ? "hsl(212 70% 46%)" : g.d1 >= 0 ? `hsl(140 ${45 + Math.min(40, g.d1 * 200)}% ${40 - Math.min(10, g.d1 * 40)}%)` : `hsl(2 ${50 + Math.min(35, -g.d1 * 200)}% 48%)`;
    const big = w > 70 && h > 60;
    return `<a href="${gl(g)}" title="${esc(g.name)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c}">${w > 26 && h > 26 && g.icon ? `<img src="${esc(g.icon)}" alt="" referrerpolicy="no-referrer">` : ""}${big ? `<span>${esc(g.name.slice(0, 22))}<br>${g.d1 == null ? compact(g.playing) : chg(g.d1, { plain: true }).replace(/<[^>]+>/g, "").replace(/^/, g.d1 >= 0 ? "+" : "−")}</span>` : ""}</a>`;
  }).join("");
}
function monthly() {
  const m = new Map();
  const TD = S.total.d || { dates: [], peak: [] };
  TD.dates.forEach((d, i) => { const k = d.slice(0, 7), v = TD.peak[i]; if (v == null) return; const e = m.get(k) ?? { s: 0, n: 0 }; e.s += v; e.n++; m.set(k, e); });
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const items = [...m.entries()].map(([k, e]) => ({ k: MES[Number(k.slice(5)) - 1], v: e.s / e.n, ym: k })).slice(-7);
  const cur = items[items.length - 1]?.v ?? S.data.total, prev = items.length > 1 ? items[items.length - 2].v : null;
  const last = items[items.length - 1]?.ym ?? S.data.t.slice(0, 7);
  return { items, cur, prev, max: Math.max(...items.map((i) => i.v), 1), label: `${MES[Number(last.slice(5)) - 1][0].toUpperCase() + MES[Number(last.slice(5)) - 1].slice(1)} ${last.slice(0, 4)}` };
}
function mostPlayed() {
  const box = document.getElementById("mp");
  if (!box) return;
  const tab = store.get("sd-mp", "mp");
  let body;
  if (tab === "wl") { const w = S.data.games.filter((g) => S.watch.has(g.id)).slice(0, 7); body = w.length ? w.map(rowStar).join("") : empty("Sua watchlist está vazia. Toque na estrela de um jogo para adicionar."); }
  else if (tab === "st") body = S.studios.slice(0, 7).map((st) => `<a class="r" href="${sl(st.name)}" style="grid-template-columns:34px minmax(0,1fr) auto">${icon(st.games[0], "ic")}<span class="t"><span class="nm">${esc(st.name)}</span><span class="sb">${st.games.length} ${st.games.length === 1 ? "jogo" : "jogos"}</span></span><span class="v">${compact(st.playing)}${chg(st.d1)}</span></a>`).join("");
  else body = S.data.games.slice(0, 7).map(rowStar).join("");
  box.innerHTML = `<div class="card-h"><div class="tabs-text"><button type="button" data-t="mp" class="${tab === "mp" ? "on" : ""}">Mais jogados</button><button type="button" data-t="wl" class="${tab === "wl" ? "on" : ""}">Watchlist</button><button type="button" data-t="st" class="${tab === "st" ? "on" : ""}">Estúdios</button></div><a class="go" href="${tab === "st" ? "#/estudios" : tab === "wl" ? "#/meus-jogos" : "#/jogos"}" aria-label="Ver tudo">${goIcon}</a></div><div class="rows">${body}</div><div class="card-foot">${S.data.games[0].d7 != null ? "vs esta hora na semana passada" : "vs 24h atrás"} · top ${nf.format(S.data.games.length)} jogos por jogadores agora</div>`;
  box.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => { store.set("sd-mp", b.dataset.t); mostPlayed(); }));
  wireStars(box, mostPlayed);
}

/* ---------- Jogos ---------- */
const GAME_TABS = [
  ["mais-jogados", "Mais jogados"], ["subindo", "Subindo"], ["caindo", "Caindo"], ["novos", "Novos"], ["atualizados", "Atualizados"], ["joias", "Joias escondidas"], ["visitas", "Mais visitados"],
];
function gameList(tab, genreFilter) {
  let G = S.data.games.slice();
  if (genreFilter != null) G = G.filter((g) => g.genre === genreFilter);
  switch (tab) {
    case "subindo": return G.filter((g) => g.d1 != null && g.playing >= 500).sort((a, b) => b.d1 - a.d1);
    case "caindo": return G.filter((g) => g.d1 != null && g.playing >= 500).sort((a, b) => a.d1 - b.d1);
    case "novos": return G.filter((g) => days(g.created) <= 60);
    case "atualizados": return G.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    case "joias": return G.filter((g) => (likes(g) ?? 0) >= 0.9 && g.playing < 20000 && g.up + g.down > 2000).sort((a, b) => likes(b) - likes(a));
    case "visitas": return G.sort((a, b) => b.visits - a.visits);
    case "watch": return G.filter((g) => S.watch.has(g.id));
    default: return G;
  }
}
const PAGE_TABS = (on) => `<div class="page-tabs">
  <a href="#/jogos" class="${on === "jogos" ? "on" : ""}"><i class="app-ic" style="--c1:#e9f1ff;--c2:#cfe0ff"><svg viewBox="0 0 20 20"><path d="M3.5 14.5 8 10l3 3 5.5-6.5" fill="none" stroke="#1f6ff2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></i>Jogos</a>
  <a href="#/generos" class="${on === "generos" ? "on" : ""}"><i class="app-ic" style="--c1:#6fb0ff;--c2:#2a6df0"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5.5" fill="#fff"/><path d="M10 10V4.5A5.5 5.5 0 0 1 15.5 10z" fill="#2a6df0"/></svg></i>Gêneros</a>
  <a href="#/tendencias" class="${on === "tendencias" ? "on" : ""}"><i class="app-ic" style="--c1:#ff8fd0;--c2:#e5309a"><svg viewBox="0 0 20 20"><rect x="5" y="11" width="2.4" height="4.5" rx="1" fill="#fff"/><rect x="8.8" y="8" width="2.4" height="7.5" rx="1" fill="#fff"/><rect x="12.6" y="5" width="2.4" height="10.5" rx="1" fill="#fff"/></svg></i>Tendências</a>
</div>`;
function gamesTable(list, { limit, extraCol } = {}) {
  const rows = list.slice(0, limit).map((g) => {
    const rk = S.rank.get(g.id);
    return `<tr data-href="${gl(g)}"><td class="rk ${rk <= 3 ? "g" + rk : ""}">${rk}</td><td class="l"><a class="gname" href="${gl(g)}">${icon(g)}<span><b>${esc(g.name)}</b><small>${esc(g.creator)} · ${esc(genre(g.genre))}</small></span></a></td>
      ${extraCol ? `<td>${extraCol.f(g)}</td>` : ""}<td class="pl">${nf.format(g.playing)}</td><td>${chg(g.d1h)}</td><td>${chg(g.d1)}</td><td>${chg(g.d7)}</td><td style="width:96px">${sparkline(spark(g), 80, 24)}</td></tr>`;
  }).join("");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Jogo</th>${extraCol ? `<th>${extraCol.t}</th>` : ""}<th>↓ Jogadores</th><th>1H</th><th>24H</th><th>7D</th><th>Tendência</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="l muted" style="padding:20px">Nada por aqui ainda.</td></tr>`}</tbody></table></div>`;
}
function wireRows(root) { root.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a")) location.hash = tr.dataset.href; })); }
function pageGames(tab = "mais-jogados", { genreFilter = null, title } = {}) {
  let limit = 100, q = "";
  const extra = tab === "atualizados" ? { t: "Atualizado", f: (g) => ago(g.updated) } : tab === "novos" ? { t: "Idade", f: (g) => `${Math.round(days(g.created))} dias` } : tab === "visitas" ? { t: "Visitas", f: (g) => compact(g.visits) } : tab === "joias" ? { t: "Aprovação", f: (g) => Math.round(likes(g) * 100) + "%" } : null;
  const render = () => {
    let list = gameList(tab, genreFilter);
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || (g.creator || "").toLowerCase().includes(q));
    const note = (tab === "subindo" || tab === "caindo") && !S.data.games.some((g) => g.d1 != null) ? '<p class="empty">Subindo e Caindo aparecem quando houver 24 horas de coleta.</p>' : "";
    document.getElementById("tbl").innerHTML = note + gamesTable(list, { limit, extraCol: extra }) + (list.length > limit ? `<button class="more-btn" id="more" type="button">Mostrar mais (${nf.format(list.length - limit)})</button>` : "");
    wireRows(document.getElementById("tbl"));
    document.getElementById("more")?.addEventListener("click", () => { limit += 200; render(); });
  };
  $view.innerHTML = `<div class="wrap fade">${genreFilter != null ? `<a class="back" href="#/generos">← Gêneros</a><div class="page-title">${esc(title)}</div>` : PAGE_TABS("jogos")}
    <div class="toolbar">${genreFilter != null ? "<span></span>" : `<div class="seg">${GAME_TABS.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${t}</button>`).join("")}<button type="button" data-tab="watch" class="${tab === "watch" ? "on" : ""}" aria-label="Watchlist">${starSvg(tab === "watch")}</button></div>`}
      <label class="searchbox"><svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8" stroke-linecap="round"/></svg><input id="tq" type="search" placeholder="Filtrar" aria-label="Filtrar jogos"></label></div>
    <div id="tbl"></div></div>`;
  $view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab === "mais-jogados" ? "#/jogos" : "#/jogos/" + b.dataset.tab; }));
  document.getElementById("tq").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); render(); });
  render();
}
function pageGenres() {
  const gs = genreStats();
  $view.innerHTML = `<div class="wrap fade">${PAGE_TABS("generos")}<div class="grid2">
    ${card("Participação", `Top ${nf.format(S.data.games.length)} · jogadores agora`, null, gs.map((x) => `<a class="hbar" href="#/genero/${encodeURIComponent(x.genre)}" style="grid-template-columns:minmax(0,130px) minmax(0,1fr) 40px 56px"><span class="l">${esc(genre(x.genre))}</span><span class="trk"><i style="width:${(x.share / gs[0].share) * 100}%"></i></span><span class="p">${(x.share * 100).toFixed(x.share < 0.1 ? 1 : 0).replace(".", ",")}%</span>${chg(x.d1)}</a>`).join(""))}
    ${card("Por gênero", "Jogos e jogadores", null, `<div class="rows">${gs.map((x) => { const top = S.data.games.find((g) => g.genre === x.genre); return `<a class="r" href="#/genero/${encodeURIComponent(x.genre)}">${icon(top)}<span class="t"><span class="nm">${esc(genre(x.genre))}</span><span class="sb">${x.n} jogos · maior: ${esc(top?.name)}</span></span><span class="v">${compact(x.playing)}${chg(x.d1)}</span></a>`; }).join("")}</div>`)}
  </div></div>`;
}
function pageTrends() {
  const kw = keywordTrends();
  $view.innerHTML = `<div class="wrap fade">${PAGE_TABS("tendencias")}<p class="muted" style="margin:-6px 0 14px">Palavras que se repetem nos nomes dos jogos criados nos últimos 30 dias, somando os jogadores de cada um.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Palavra</th><th>Jogos</th><th>↓ Jogando</th><th class="l">Maior jogo</th></tr></thead><tbody>
    ${kw.map((k, i) => `<tr data-href="${gl(k.top)}"><td class="rk">${i + 1}</td><td class="l"><b>“${esc(k.w)}”</b></td><td>${k.n}</td><td class="pl">${nf.format(k.playing)}</td><td class="l"><a class="gname" href="${gl(k.top)}" style="min-width:200px">${icon(k.top)}<span><b>${esc(k.top.name)}</b><small>${compact(k.top.playing)} jogando</small></span></a></td></tr>`).join("") || '<tr><td colspan="5" class="l muted" style="padding:20px">Sem palavras repetidas nos jogos novos.</td></tr>'}
    </tbody></table></div></div>`;
  wireRows($view);
}

/* ---------- Estúdios ---------- */
function pageStudios(tab = "mais-jogados") {
  let list = S.studios.slice();
  if (tab === "subindo") list = list.filter((s) => s.d1 != null && s.playing > 1000).sort((a, b) => b.d1 - a.d1);
  if (tab === "caindo") list = list.filter((s) => s.d1 != null && s.playing > 1000).sort((a, b) => a.d1 - b.d1);
  if (tab === "novos") list = list.filter((s) => s.newest <= 60);
  $view.innerHTML = `<div class="wrap fade"><div class="page-title"><i class="app-ic" style="--c1:#ffb35c;--c2:#f57b16"><svg viewBox="0 0 20 20"><rect x="6" y="3.5" width="8" height="13" rx="1.5" fill="#fff"/><path d="M8.3 6.5h1.2M10.5 6.5h1.2M8.3 9h1.2M10.5 9h1.2M8.3 11.5h1.2M10.5 11.5h1.2" stroke="#f57b16" stroke-width="1.2"/></svg></i>Estúdios</div>
    <div class="toolbar"><div class="seg">${[["mais-jogados", "Mais jogados"], ["subindo", "Subindo"], ["caindo", "Caindo"], ["novos", "Novos"]].map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${t}</button>`).join("")}</div></div>
    ${(tab === "subindo" || tab === "caindo") && !list.length ? '<p class="empty">Aparece quando houver 24 horas de coleta.</p>' : ""}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="l">Estúdio</th><th>Jogos</th><th>↓ Jogando</th><th>24H</th><th>Tendência</th></tr></thead><tbody>
    ${list.slice(0, 300).map((s, i) => `<tr data-href="${sl(s.name)}"><td class="rk ${i < 3 ? "g" + (i + 1) : ""}">${i + 1}</td><td class="l"><a class="gname" href="${sl(s.name)}">${icon(s.games[0])}<span><b>${esc(s.name)}${s.verified ? ' <span style="color:var(--accent)">✓</span>' : ""}</b><small>${esc(s.games[0].name)}${s.games.length > 1 ? ` + ${s.games.length - 1} mais` : ""}</small></span></a></td><td>${s.games.length}</td><td class="pl">${compact(s.playing)}</td><td>${chg(s.d1)}</td><td style="width:96px">${sparkline(studioSpark(s), 80, 24)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  $view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.tab === "mais-jogados" ? "#/estudios" : "#/estudios/" + b.dataset.tab; }));
  wireRows($view);
}
function pageStudio(name) {
  const s = S.studios.find((x) => x.name === name);
  if (!s) return notFound("Estúdio não encontrado", "#/estudios", "Estúdios");
  const rank = S.studios.indexOf(s) + 1;
  $view.innerHTML = `<div class="wrap fade"><a class="back" href="#/estudios">← Estúdios</a>
    <div class="g-head">${icon(s.games[0], "ic xl")}<div><h1>${esc(s.name)}</h1><div class="by"><span class="chip">#${rank} estúdio</span><span class="muted">${s.type === "Group" ? "Grupo" : "Usuário"}${s.verified ? " · verificado" : ""}</span></div></div></div>
    <section class="hero" id="sh"><div class="hero-lbl">Jogando agora em ${s.games.length} ${s.games.length === 1 ? "jogo" : "jogos"} do top</div><div class="hero-num">${nf.format(s.playing)}</div><div class="hero-delta">${chg(s.d1)}<span class="muted">vs 24h atrás · ${compact(s.visits)} visitas somadas</span></div><div class="chart"></div><div class="seg-row"></div></section>
    <div style="margin-top:22px">${gamesTable(s.games)}</div></div>`;
  const sp = studioSpark(s);
  const host = document.getElementById("sh");
  host.querySelector(".seg-row").innerHTML = '<div class="seg"><button type="button" class="on">24 horas</button></div>';
  bigChart(host.querySelector(".chart"), sp.map((y, i) => ({ x: S.data.hour - (23 - i) * HOUR, y, hourly: true })), (v) => compact(v));
  wireRows($view);
}

/* ---------- Jogo ---------- */
function pageGame(id) {
  const g = S.byId.get(Number(id));
  if (!g) return notFound("Jogo não encontrado", "#/jogos", "Jogos", `Este jogo saiu do top ${nf.format(S.data.games.length)} ou o link está errado.`);
  const rank = S.rank.get(g.id), lk = likes(g), p = peakOf(g);
  const since = null, firstVal = null;
  const studio = S.studios.find((x) => x.name === g.creator);
  const listNames = { "top-trending": "Em alta", "up-and-coming": "Promissores", "top-playing-now": "Mais jogados", "fun-with-friends": "Com amigos", "top-revisited": "Mais revisitados" };
  const on = S.watch.has(g.id);
  $view.innerHTML = `<div class="g-wrap fade">
    <div class="g-head">${icon(g, "ic xl")}<div style="min-width:0;flex:1 1 300px"><h1>${esc(g.name)}</h1><div class="by"><a href="${sl(g.creator)}">${esc(g.creator)}${g.verified ? ' <span style="color:var(--accent)">✓</span>' : ""}</a>${studio ? `<span class="chip">#${S.studios.indexOf(studio) + 1} estúdio</span>` : ""}<span class="chip">#${rank} jogo</span></div></div>
      <div class="acts"><button class="pill-btn icon${on ? " on" : ""}" type="button" id="gstar" aria-label="Watchlist">${starSvg(on)}</button><a class="pill-btn" href="https://www.roblox.com/games/${g.place}" target="_blank" rel="noopener">Abrir no Roblox ↗</a></div></div>
    <div class="g-grid"><div style="min-width:0">
      <section class="hero" id="gh"><div class="hero-num" style="margin-top:0">${nf.format(g.playing)}</div>
        <div class="hero-delta">${since != null ? `<span class="chg ${since >= 0 ? "up" : "down"}"><span class="tri">${since >= 0 ? "▲" : "▼"}</span>${compact(Math.abs(since))} (${(Math.abs(since / firstVal) * 100).toFixed(1).replace(".", ",")}%)</span><span class="muted">Desde o início do acompanhamento</span>` : `${chg(g.d1)}<span class="muted">Últimas 24h · coletado ${ago(S.data.t)}</span>`}</div>
        <div class="chart"></div><div class="seg-row"></div></section>
      <div class="strip"><div><small>Rank</small><b>#${rank}</b></div><div><small>Aprovação</small><b>${lk == null ? "—" : Math.round(lk * 100) + "%"}</b></div><div class="hot"><small>Visitas</small><b>${compact(g.visits)}</b></div><div class="hot"><small>Favoritos</small><b>${compact(g.fav)}</b></div><div><small>Máx. 24h</small><b>${compact(g.high24)}</b></div></div>
      <div class="g-tabs"><button type="button" data-gt="ov" class="on">Visão geral</button><button type="button" data-gt="ab">Sobre</button></div>
      <div id="gt"></div>
    </div>
    <aside class="g-side">
      <a class="thumb" href="https://www.roblox.com/games/${g.place}" target="_blank" rel="noopener">${g.thumb ? `<img src="${esc(g.thumb)}" alt="" referrerpolicy="no-referrer">` : icon(g, "ic xl")}<span class="play">▶ Jogar</span></a>
      <p>${esc((g.desc || "").split("\n").find((l) => l.trim()) || "Sem descrição.")}</p>
      <div class="facts"><div>Atualizado<b>${ago(g.updated)}</b></div><div>Criado<b>${ago(g.created)}</b></div><div>Servidor<b>${g.maxPlayers ?? "—"}</b></div><div>Gênero<b>${esc(genre(g.genre))}</b></div></div>
      ${(g.lists || []).length ? `<div class="by" style="display:flex;flex-wrap:wrap;gap:6px">${g.lists.map((l) => listNames[l]).filter(Boolean).map((t) => `<span class="chip">${t}</span>`).join("")}</div>` : ""}
    </aside></div></div>`;
  const gh = document.getElementById("gh");
  gh.querySelector(".chart").innerHTML = '<div class="chart-empty">Carregando histórico…</div>';
  let hist = null;
  loadGame(g.id).then((h) => { if (location.hash !== "#/jogo/" + g.id) return; hist = h; rangedChart(gh, { hourly: h, daily: h?.d }, (v) => compact(v), "game"); show(curTab); });
  document.getElementById("gstar").addEventListener("click", (e) => { S.watch.has(g.id) ? S.watch.delete(g.id) : S.watch.add(g.id); store.set("sd-watch", [...S.watch]); e.currentTarget.classList.toggle("on", S.watch.has(g.id)); e.currentTarget.innerHTML = starSvg(S.watch.has(g.id)); });
  const tabs = {
    ov: () => {
      const D = hist?.d || { dates: [new Date(Date.now() - 3 * HOUR).toISOString().slice(0, 10)], peak: [g.playing] };
      const arr = D.peak;
      const idx = new Map(D.dates.map((d, i) => [d, i]));
      const end = new Date(D.dates[D.dates.length - 1] + "T12:00:00");
      const d14 = Array.from({ length: 14 }, (_, k) => { const x = new Date(end.getTime() - (13 - k) * 864e5).toISOString().slice(0, 10); const i = idx.get(x); return { d: x, v: i == null ? null : arr[i] ?? null }; });
      const vals = d14.map((x) => x.v).filter((v) => v != null);
      const mx = Math.max(...vals, 1);
      const W = ["D", "S", "T", "Q", "Q", "S", "S"];
      const y = arr.length > 1 ? arr[arr.length - 2] : null;
      const wk = lastN(arr.filter((v) => v != null), 7);
      const avg7 = wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : null;
      const status = g.d1 == null ? ["Novo no histórico", ""] : g.d1 > 0.25 ? ["Disparando", "green"] : g.d1 > 0.02 ? ["Subindo", "green"] : g.d1 < -0.02 ? ["Caindo", ""] : ["Estável", ""];
      return `<div class="g-sec"><h2>Momento <span class="chip ${status[1]}">${status[0]}</span></h2>
        <p class="lead">${compact(g.playing)} <span>jogando agora</span>${y ? `, <b class="${g.playing >= y ? "up" : "down"}">${(g.playing / y).toFixed(1).replace(".", ",")}×</b> <span>o pico de ontem.</span>` : "<span>.</span>"}</p>
        <div class="muted" style="font-size:12.5px">Pico de jogadores por dia · últimos 14 dias</div>
        <div class="dbars">${d14.map((x, i) => `<div><i class="${i === d14.length - 1 ? "now" : ""}" style="height:${x.v == null ? 2 : Math.max(3, (x.v / mx) * 100)}%"></i><span>${i === d14.length - 1 ? "Hoje" : W[dt(x.d).getDay()]}</span></div>`).join("")}</div>
        <div class="trio"><div><small>Média de 7 dias</small><b>${compact(avg7)}</b></div><div><small>Pico de ontem</small><b>${compact(y)}</b>${g.d7 != null ? `<span>${chg(g.d7)} vs semana passada</span>` : ""}</div><div><small>Do pico</small><b>${p && p.v > 0 ? (g.playing === p.v ? "No pico" : "−" + ((1 - g.playing / p.v) * 100).toFixed(1).replace(".", ",") + "%") : "—"}</b>${p ? `<span>${compact(p.v)} em ${dshort.format(dt(p.date))}</span>` : ""}</div></div></div>`;
    },
    ab: () => `<div class="g-sec"><h2>Descrição</h2><p class="desc">${esc(g.desc) || "Sem descrição."}</p></div>
      <div class="g-sec"><h2>Ficha</h2><div class="facts" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div>Criado<b>${dlong.format(new Date(g.created))}</b></div><div>Atualizado<b>${dlong.format(new Date(g.updated))}</b></div><div>Gênero<b>${esc(genre(g.genre))}${g.genre2 ? " · " + esc(g.genre2) : ""}</b></div><div>Classificação<b>${esc(g.maturity || "—")}</b></div><div>Votos<b>${compact(g.up + g.down)}</b></div><div>ID do universo<b>${g.id}</b></div></div></div>`,
  };
  let curTab = "ov";
  const show = (k) => { curTab = k; document.getElementById("gt").innerHTML = tabs[k](); $view.querySelectorAll("[data-gt]").forEach((b) => b.classList.toggle("on", b.dataset.gt === k)); };
  $view.querySelectorAll("[data-gt]").forEach((b) => b.addEventListener("click", () => show(b.dataset.gt)));
  show("ov");
}

/* ---------- outras ---------- */
function pageWatch() {
  const list = S.data.games.filter((g) => S.watch.has(g.id));
  $view.innerHTML = `<div class="wrap fade"><div class="page-title"><i class="app-ic" style="--c1:#7aa7ff;--c2:#4161f0"><svg viewBox="0 0 20 20"><rect x="4" y="5" width="12" height="10" rx="3" fill="#fff"/><circle cx="8" cy="10" r="1.3" fill="#4161f0"/><circle cx="12" cy="10" r="1.3" fill="#4161f0"/></svg></i>Meus jogos</div>
  ${list.length ? gamesTable(list) : '<p class="empty" style="font-size:15px">Você ainda não marcou nenhum jogo. Toque na estrela ao lado de um jogo para ele aparecer aqui. A lista fica salva neste navegador.</p>'}</div>`;
  wireRows($view);
}
const SOON = {
  clipes: ["Clipes", "--c1:#ff8a7a;--c2:#ef3b2c", "Campanhas de clipes pagos por visualização. Esta seção depende de pagamentos e contas, e ainda não foi construída."],
  calls: ["Calls", "--c1:#f4f4f6;--c2:#e2e2e8", "Palpites se um jogo vai subir ou cair. Precisa de contas de usuário, por isso ainda não foi construída."],
  calendario: ["Calendário", "--c1:#ffffff;--c2:#ececf1", "Eventos e atualizações programadas dos jogos. Precisa de uma fonte de eventos que ainda não está na coleta."],
  cards: ["Cards", "--c1:#ffd76a;--c2:#ff9f1a", "Cartões colecionáveis dos jogos. Ainda não foi construída."],
  limiteds: ["Limiteds", "--c1:#d9a6ff;--c2:#9b4dff", "Preços de itens limitados do Roblox. Precisa de outra coleta de dados, ainda não construída."],
  mensagens: ["Mensagens", "--c1:#e9e9ee;--c2:#d9d9e0", "Conversas entre usuários. Precisa de contas, ainda não construída."],
  notificacoes: ["Notificações", "--c1:#e9e9ee;--c2:#d9d9e0", "Alertas quando um jogo da sua watchlist sobe ou cai. Ainda não construída."],
  entrar: ["Entrar", "--c1:#3d8bff;--c2:#0060e6", "Este site é só seu e fica protegido pelo login da Cloudflare. Contas dentro do site ainda não existem."],
};
function pageSoon(k) {
  const [t, c, d] = SOON[k];
  $view.innerHTML = `<div class="soon fade"><i class="app-ic" style="${c}"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="4" fill="#fff" opacity=".9"/></svg></i><h1>${t}</h1><p>${d}</p><p style="margin-top:14px"><span class="chip">Em breve</span></p></div>`;
}
function pageAbout() {
  $view.innerHTML = `<div class="soon fade" style="text-align:left;max-width:640px"><h1>Sobre os dados</h1>
  <p>O Saint Data coleta dados públicos do Roblox de hora em hora: as listas da página Charts em vários países e dispositivos, e os detalhes de cada jogo. Ficam os ${nf.format(S.data.games.length)} jogos com mais jogadores no momento da coleta.</p>
  <p style="margin-top:12px">Última coleta: <b>${dlong.format(new Date(S.data.t))}</b>, ${ago(S.data.t)}. Histórico: <b>${S.total.d?.dates?.length ?? 0} ${(S.total.d?.dates?.length ?? 0) === 1 ? "dia" : "dias"}</b>. As variações de 1h, 24h e 7 dias comparam com a mesma hora no passado, por isso aparecem conforme o histórico cresce.</p>
  <p style="margin-top:12px">O total no topo do Início soma só esses ${nf.format(S.data.games.length)} jogos, não o Roblox inteiro.</p></div>`;
}
function notFound(t, href, back, msg = "") { $view.innerHTML = `<div class="wrap fade"><a class="back" href="${href}">← ${back}</a><h1 class="page-title">${t}</h1><p class="muted">${msg}</p></div>`; }

/* ================= busca ================= */
const $layer = document.getElementById("search-layer"), $q = document.getElementById("search-q"), $res = document.getElementById("search-res");
function openSearch() { $layer.hidden = false; $q.value = ""; searchRender(); setTimeout(() => $q.focus(), 0); }
function closeSearch() { $layer.hidden = true; }
function searchRender() {
  if (!S.data) return;
  const q = $q.value.trim().toLowerCase();
  const games = (q ? S.data.games.filter((g) => g.name.toLowerCase().includes(q)) : S.data.games).slice(0, 8);
  const studios = q ? S.studios.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 4) : [];
  $res.innerHTML = games.map((g) => rowPlain(g, `${esc(g.creator)} · ${esc(genre(g.genre))}`, compact(g.playing))).join("") + studios.map((s) => `<a class="r" href="${sl(s.name)}">${icon(s.games[0])}<span class="t"><span class="nm">${esc(s.name)}</span><span class="sb">Estúdio · ${s.games.length} jogos</span></span><span class="v">${compact(s.playing)}</span></a>`).join("") || '<p class="empty">Nada encontrado.</p>';
}
document.getElementById("search-btn").addEventListener("click", openSearch);
$q.addEventListener("input", searchRender);
$layer.addEventListener("click", (e) => { if (e.target === $layer || e.target.closest("a")) closeSearch(); });
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeSearch(); document.getElementById("theme-pop").hidden = true; }
  if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});

/* ================= tema e menu ================= */
const $pop = document.getElementById("theme-pop"), $tb = document.getElementById("theme-btn");
function applyTheme(t) { const r = document.documentElement; if (t === "system") delete r.dataset.theme; else r.dataset.theme = t; store.set("sd-theme", t); $pop.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.themePick === t)); }
$tb.addEventListener("click", (e) => { e.stopPropagation(); $pop.hidden = !$pop.hidden; $tb.setAttribute("aria-expanded", String(!$pop.hidden)); });
$pop.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { applyTheme(b.dataset.themePick); $pop.hidden = true; }));
document.addEventListener("click", (e) => { if (!e.target.closest(".theme-wrap")) $pop.hidden = true; });
applyTheme(store.get("sd-theme", "system"));
const $app = document.querySelector(".app");
if (store.get("sd-collapsed", false)) $app.classList.add("collapsed");
document.getElementById("collapse").addEventListener("click", () => { $app.classList.toggle("collapsed"); store.set("sd-collapsed", $app.classList.contains("collapsed")); });

/* ================= rotas ================= */
function route() {
  if (!S.data) return;
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const [a = "", b, ...rest] = parts;
  const navKey = { "": "home", jogo: "jogos", generos: "jogos", genero: "jogos", tendencias: "jogos", estudio: "estudios" }[a] ?? a;
  document.querySelectorAll(".nav a").forEach((l) => l.classList.toggle("on", l.dataset.route === navKey));
  let title = "";
  if (a === "" ) pageHome();
  else if (a === "jogos") { pageGames(b || "mais-jogados"); title = "Jogos"; }
  else if (a === "jogo") { pageGame(b); title = S.byId.get(Number(b))?.name ?? "Jogo"; }
  else if (a === "generos") { pageGenres(); title = "Gêneros"; }
  else if (a === "genero") { const gname = [b, ...rest].join("/"); pageGames("mais-jogados", { genreFilter: gname, title: genre(gname) }); title = genre(gname); }
  else if (a === "tendencias") { pageTrends(); title = "Tendências"; }
  else if (a === "estudios") { pageStudios(b || "mais-jogados"); title = "Estúdios"; }
  else if (a === "estudio") { const n = [b, ...rest].join("/"); pageStudio(n); title = n; }
  else if (a === "meus-jogos") { pageWatch(); title = "Meus jogos"; }
  else if (a === "sobre") { pageAbout(); title = "Sobre os dados"; }
  else if (SOON[a]) { pageSoon(a); title = SOON[a][0]; }
  else pageHome();
  document.title = title ? `${title} · Saint Data` : "Saint Data · O que está rolando no Roblox";
  window.scrollTo(0, 0);
}

/* ================= carga ================= */
async function load() {
  try {
    const [data, total] = await Promise.all(["games.json", "total.json"].map((u) => fetch(BASE + u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} em ${u}`); return r.json(); })));
    S.data = data; S.total = total;
    S.byId = new Map(data.games.map((g) => [g.id, g]));
    S.rank = new Map(data.games.map((g, i) => [g.id, i + 1]));
    S.studios = buildStudios();
    S.watch = new Set(store.get("sd-watch", []));
    route();
  } catch (e) {
    $view.innerHTML = `<div class="soon"><h1>Não foi possível carregar os dados</h1><p>Recarregue a página. Se continuar, a coleta pode estar com problema. (${esc(e.message)})</p></div>`;
  }
}
addEventListener("hashchange", route);
load();
