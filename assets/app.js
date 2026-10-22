// Saint Data — aplicativo de página única. Única dependência: number-flow (números que rolam), carregada da CDN.
// Os dados vêm do ramo "dados" do repositório (atualizado a cada 10 minutos pelo coletor).

const BASE = window.SD_DATA || "https://raw.githubusercontent.com/SaintLukz/saint-data/dados/";
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const $view = document.getElementById("view");
const S = { data: null, total: null, byId: new Map(), rank: new Map(), studios: [], genres: [], words: null, watch: new Set(), shards: new Map(), gfiles: new Map() };

/* =========================================================== formatação */
const nfInt = new Intl.NumberFormat("pt-BR");
const nf = (v, d) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
const sig = (v) => { const a = Math.abs(v); return nf(v, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
function K(n) {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return sig(n / 1e9) + "B";
  if (a >= 1e6) return sig(n / 1e6) + "M";
  if (a >= 1e3) return sig(n / 1e3) + "K";
  return nfInt.format(Math.round(n));
}
function words(n) {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return sig(n / 1e9) + " bi";
  if (a >= 1e6) return sig(n / 1e6) + " mi";
  if (a >= 1e3) return sig(n / 1e3) + " mil";
  return nfInt.format(Math.round(n));
}
function pctTxt(x) { const a = Math.abs(x * 100); return (a >= 100 ? nf(a, 0) : a >= 10 ? nf(a, 1) : nf(a, 2)) + "%"; }
function chg(x, { sign = false } = {}) {
  if (x == null || !isFinite(x)) return '<span class="chg muted">—</span>';
  if (Math.abs(x) < 0.00005) return '<span class="chg muted">0%</span>';
  const up = x > 0;
  return `<span class="chg ${up ? "up" : "down"}">${sign ? (up ? "+" : "−") : `<span class="tri">${up ? "▲" : "▼"}</span>`}${pctTxt(x)}</span>`;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function ago(t) {
  if (!t) return "—";
  const s = (new Date(t).getTime() - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return "agora";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  if (a < 86400 * 365) return rtf.format(Math.round(s / (86400 * 30)), "month");
  return rtf.format(Math.round(s / (86400 * 365)), "year");
}
const ageDays = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity);
function age(iso) {
  const d = ageDays(iso);
  if (d < 1) return "Lançado hoje";
  if (d < 2) return "1 dia";
  if (d < 60) return `${Math.floor(d)} dias`;
  if (d < 365 * 2) return `${Math.floor(d / 30.4)} meses`;
  return `${Math.floor(d / 365)} anos`;
}
const hfmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dhfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const dyfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const likes = (g) => (g.up + g.down > 0 ? g.up / (g.up + g.down) : null);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const GENRES = { "Simulation": "Simulação", "Survival": "Sobrevivência", "Action": "Ação", "Roleplay & Avatar Sim": "Roleplay e Avatar", "Sports & Racing": "Esportes e Corrida", "Shooter": "Tiro", "RPG": "RPG", "Strategy": "Estratégia", "Shopping": "Compras", "Party & Casual": "Festa e Casual", "Adventure": "Aventura", "Obby & Platformer": "Obby e Plataforma", "Puzzle": "Quebra-cabeça", "Social": "Social", "Entertainment": "Entretenimento", "Education": "Educação", "Utility & Other": "Utilidade", "Playmade": "Playmade", "": "Sem gênero" };
const genre = (g) => GENRES[g] ?? g;
const LISTS = [
  ["top-earning", "Top faturamento", "#f0a020", "💰"], ["top-trending", "Em alta", "#ff2d87", "🔥"], ["up-and-coming", "Promissores", "#2fbf71", "🌱"],
  ["top-playing-now", "Mais populares", "#3b82f6", "👥"], ["top-revisited", "Mais revisitados", "#8b5cf6", "🔁"], ["fun-with-friends", "Com amigos", "#14b8a6", "🤝"],
  ["top-rated", "Mais bem avaliados", "#eab308", "⭐"], ["top-paid-access", "Acesso pago", "#64748b", "🎟️"],
];
const listName = (s) => LISTS.find((l) => l[0] === s)?.[1] ?? s;
let toastT;
function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg;
  t.classList.remove("bump"); if (!t.hidden) { void t.offsetWidth; t.classList.add("bump"); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
}

/* =========================================================== animações */
// números que rolam dígito a dígito (number-flow). Sem a CDN, cai para texto simples.
const FLOW_FMT = { int: {}, pct: { maximumFractionDigits: 1 } };
let flowReady = false;
import("https://cdn.jsdelivr.net/npm/number-flow@0.6.2/+esm").then(() => customElements.whenDefined("number-flow")).then(() => { flowReady = true; document.querySelectorAll("number-flow").forEach((el) => setFlow(el, Number(el.dataset.v), false)); }).catch(() => {});
const flowPrev = new Map(); // último valor mostrado em cada número (para rolar do antigo ao novo depois de recarregar)
function flowHTML(key, v, cls = "hero-num") { const from = flowPrev.has(key) ? flowPrev.get(key) : v; return `<number-flow class="${cls}" data-key="${key}" data-v="${from}" data-to="${v}">${nfInt.format(from)}</number-flow>`; }
function setFlow(el, v, animated = true) {
  if (!el || v == null || !isFinite(v)) return;
  el.dataset.v = v; if (el.dataset.key && !el.dataset.hover) flowPrev.set(el.dataset.key, v);
  if (flowReady && el.update) { el.locales = "pt-BR"; el.format = FLOW_FMT.int; el.animated = animated; el.update(Math.round(v)); }
  else el.textContent = nfInt.format(Math.round(v));
}
// depois de montar a página: cada número rola do valor anterior até o atual
function startFlows(root = $view) { root.querySelectorAll("number-flow[data-to]").forEach((el) => { const to = Number(el.dataset.to); delete el.dataset.to; setFlow(el, Number(el.dataset.v), false); requestAnimationFrame(() => setFlow(el, to)); }); }
// indicador que desliza até o botão ativo (seletores de período, abas)
const slideMem = new Map();
function slide(host, sel = "button.on, a.on", key = host?.id) {
  if (!host) return;
  const on = host.querySelector(sel); let ind = host.querySelector(":scope > .ind");
  if (!on) { ind?.remove(); return; }
  if (!ind) { ind = document.createElement("span"); ind.className = "ind"; host.prepend(ind); }
  host.classList.add("has-ind");
  const to = { l: on.offsetLeft, t: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  const from = key && slideMem.get(key);
  const put = (p) => { ind.style.width = p.w + "px"; ind.style.height = p.h + "px"; ind.style.transform = `translate(${p.l}px,${p.t}px)`; };
  if (from && (from.l !== to.l || from.w !== to.w)) { ind.style.transition = "none"; put(from); void ind.offsetWidth; ind.style.transition = ""; }
  put(to); if (key) slideMem.set(key, to);
}

/* =========================================================== ícones e peças */
const I = {
  go: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>',
  back: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
  star: (on) => `<svg viewBox="0 0 20 20" width="16" height="16" ${on ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/></svg>`,
  share: '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13V3M6.5 6.5 10 3l3.5 3.5"/><path d="M4 11v4.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V11"/></svg>',
  play: '<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M6 4.5v11l9-5.5z"/></svg>',
  search: '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2" stroke-linecap="round"/></svg>',
  starO: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z"/></svg>',
  refresh: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2"/></svg>',
  cal: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M3.5 8.5h13M7 3v3M13 3v3" stroke-linecap="round"/></svg>',
  users: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="7" r="3"/><path d="M2.5 16c.7-3 2.8-4.5 5.5-4.5s4.8 1.5 5.5 4.5M13.5 4.2a3 3 0 0 1 0 5.6M15.5 11.8c1.2.6 2 1.9 2.3 4.2"/></svg>',
  robux: '<svg class="robux" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1.8 13.4 4.9v6.2L8 14.2 2.6 11.1V4.9z"/><rect x="6" y="6" width="4" height="4" rx=".6"/></svg>',
};
const TAB_ICONS = {
  "": '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 9 10 3.5 16.5 9v7.5h-4.5v-4h-4v4H3.5z"/></svg>',
  watchlist: I.starO,
  screener: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 5.5h9M3 10h6M3 14.5h4"/><circle cx="14" cy="12" r="3"/><path d="m16.2 14.2 1.8 1.8"/></svg>',
  jogos: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/></svg>',
  estudios: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="3" width="11" height="14" rx="2"/><path d="M8 6.5h1M11 6.5h1M8 9.5h1M11 9.5h1M8 12.5h1M11 12.5h1" stroke-linecap="round"/></svg>',
  tendencias: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10h3l2-5 4 10 2-5h4"/></svg>',
  rankings: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 16V9M10 16V4M15 16v-5"/></svg>',
};
function icon(g, cls = "ic") {
  const L = esc(((g?.name || "?").match(/[\p{L}\p{N}]/u) || ["?"])[0].toUpperCase());
  return g?.icon ? `<img class="${cls}" src="${esc(g.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${cls}" aria-hidden="true">${L}</span>`;
}
const stack = (games) => `<span class="stack">${games.slice(0, 3).map((g) => icon(g)).join("")}</span>`;
// louros desenhados: folhas em arco ao redor do número
function leaves(cx, cy, r, from, to, n, size) {
  let out = "";
  for (let k = 0; k < n; k++) {
    const a = from + ((to - from) * k) / (n - 1), rad = (a * Math.PI) / 180;
    const x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
    out += `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="${(size * 0.42).toFixed(2)}" ry="${size.toFixed(2)}" transform="rotate(${a.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
  }
  return out;
}
const LAUREL = (cls = "") => `<svg class="${cls}" viewBox="0 0 14 28" fill="currentColor">${leaves(14, 14, 10.5, 115, 245, 5, 2.6)}</svg>`;
function rankBadge(n) {
  if (!n || n > 3) return `<span class="rank">${n ?? ""}</span>`;
  return `<span class="rank r${n}"><svg viewBox="0 0 28 28" fill="currentColor" opacity=".85">${leaves(14, 14.5, 11, 112, 238, 5, 2.3)}${leaves(14, 14.5, 11, 68, -58, 5, 2.3)}</svg>${n}</span>`;
}
const gl = (g) => `#/jogo/${g.id}`;
const sl = (name) => `#/estudio/${encodeURIComponent(name)}`;
const genl = (g) => `#/genero/${encodeURIComponent(g)}`;
const empty = (t) => `<p class="empty">${t}</p>`;
function card(title, sub, href, body, hrefLabel = "Ver tudo") {
  return `<section class="card"><div class="card-h"><h3>${title}${sub ? `<small>${sub}</small>` : ""}</h3>${href ? `<a class="see" href="${href}">${hrefLabel}</a>` : ""}</div>${body}</section>`;
}
function sparkline(vals, w = 80, h = 26) {
  const v = vals.map((x, i) => [i, x]).filter((p) => p[1] != null);
  if (v.length < 2) return `<svg width="${w}" height="${h}" aria-hidden="true"><line x1="2" x2="${w - 2}" y1="${h / 2}" y2="${h / 2}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="2 3"/></svg>`;
  const ys = v.map((p) => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), r = hi - lo || 1, n = vals.length - 1 || 1;
  const p = v.map(([i, y]) => [(i / n) * (w - 2) + 1, h - 3 - ((y - lo) / r) * (h - 6)]);
  const c = ys[ys.length - 1] >= ys[0] ? "var(--up)" : "var(--down)";
  const d = smooth(p);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${p[p.length - 1][0]},${h}L${p[0][0]},${h}Z" fill="${c}" opacity=".1"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

/* =========================================================== séries e gráfico */
// curva monotônica (Fritsch–Carlson): suave, sem "passar" dos pontos
function smooth(p) {
  const n = p.length;
  if (n < 2) return n ? `M${p[0][0]},${p[0][1]}` : "";
  if (n === 2) return `M${p[0][0]},${p[0][1]}L${p[1][0]},${p[1][1]}`;
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0] || 1e-6; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(p[i][0] + h).toFixed(1)},${(p[i][1] + t[i] * h).toFixed(1)} ${(p[i + 1][0] - h).toFixed(1)},${(p[i + 1][1] - t[i + 1] * h).toFixed(1)} ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
  }
  return d;
}
// série { t0, v } com passo -> pontos [{x: ms, y}]
const pts = (s, step) => (s && s.t0 != null ? s.v.map((y, i) => ({ x: s.t0 + i * step, y })) : []);
const sinceT = (arr, t) => arr.filter((p) => p.x >= t);
function thin(arr, max) { if (arr.length <= max) return arr; const k = Math.ceil(arr.length / max); return arr.filter((_, i) => i % k === 0 || i === arr.length - 1); }
function daily(d, key = "peak") { return (d?.dates || []).map((x, i) => ({ x: new Date(x + "T15:00:00Z").getTime(), y: d[key]?.[i] ?? null, day: true })); }

// gráfico de linha suave com pico, ponto atual que "respira", cursor, trecho futuro apagado e várias séries (para comparar)
// onHover(p | null): avisa quem usa o gráfico (o número grande acompanha o cursor)
function lineChart(box, series, { fmt = K, h = 250, peak = true, live = true, gapMax = 6, empty: emptyMsg, onHover = null, anim = true } = {}) {
  const all = series.flatMap((s) => s.pts.filter((p) => p.y != null));
  if (all.length < 2) { box.innerHTML = `<div class="chart-empty" style="height:${h - 20}px">${emptyMsg || "Ainda há poucos pontos neste período. O gráfico se completa a cada coleta (de 10 em 10 minutos)."}</div>`; onHover?.(null); return; }
  const W = 720, H = h, pt = 30, pb = 8, pr = 14;
  const xs = all.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = Math.min(...all.map((p) => p.y)), hi = Math.max(...all.map((p) => p.y));
  if (lo === hi) { lo *= 0.97; hi *= 1.03; if (hi === 0) hi = 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const X = (x) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * (W - pr - 2) + 2);
  const Y = (y) => pt + (1 - (y - lo) / (hi - lo)) * (H - pt - pb);
  const gid = "g" + Math.random().toString(36).slice(2, 8);
  const c0 = series[0].color || "var(--accent)";
  const one = series.length === 1;
  let area = "", lines = "";
  const segsOf = (arr) => { const segs = []; let cur = [], gap = 0; for (const p of arr) { if (p.y == null) { gap++; if (gap > gapMax && cur.length) { segs.push(cur); cur = []; } continue; } gap = 0; cur.push([X(p.x), Y(p.y)]); } if (cur.length) segs.push(cur); return segs; };
  series.forEach((s) => {
    const color = s.color || "var(--accent)";
    for (const seg of segsOf(s.pts)) {
      if (seg.length === 1) { lines += `<circle cx="${seg[0][0]}" cy="${seg[0][1]}" r="2.5" fill="${color}"/>`; continue; }
      const d = smooth(seg);
      if (one) area += `<path class="ar" d="${d}L${seg[seg.length - 1][0].toFixed(1)},${H}L${seg[0][0].toFixed(1)},${H}Z" fill="url(#${gid})"/>`;
      lines += `<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${color}" stroke-width="${one ? 2.2 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  });
  const main = series[0].pts.filter((p) => p.y != null);
  const last = main[main.length - 1];
  let pk = main[0]; for (const p of main) if (p.y > pk.y) pk = p;
  const when = (p) => (p.day ? dfmt.format(new Date(p.x)) : x1 - x0 > 1.5 * DAY ? dhfmt.format(new Date(p.x)) : hfmt.format(new Date(p.x)));
  let marks = "";
  if (peak && one && pk !== last) marks += `<circle class="pk" cx="${X(pk.x)}" cy="${Y(pk.y)}" r="3" fill="var(--fg)"/>`;
  if (live && one) marks += `<g class="now"><circle class="pulse" cx="${X(last.x)}" cy="${Y(last.y)}" r="6" fill="${c0}"/><circle class="breathe" cx="${X(last.x)}" cy="${Y(last.y)}" r="4" fill="${c0}" stroke="var(--bg)" stroke-width="1.5"/></g>`;
  const body = area + lines;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico" class="${anim ? "draw" : ""}"><defs><pattern id="d${gid}" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--faint)"/></pattern><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}" stop-opacity=".2"/><stop offset="1" stop-color="${c0}" stop-opacity="0"/></linearGradient><clipPath id="c${gid}"><rect class="clip" x="0" y="0" width="${W}" height="${H}"/></clipPath></defs><rect width="${W}" height="${H}" fill="url(#d${gid})"/><g class="ghost">${body}</g><g clip-path="url(#c${gid})">${body}</g>${marks}<line class="hl" y1="${pt - 6}" y2="${H}" stroke="var(--muted)" stroke-dasharray="3 3"/><g class="hds">${series.map((s) => `<circle r="4.5" fill="${s.color || "var(--accent)"}" stroke="var(--bg)" stroke-width="2"/>`).join("")}</g></svg><div class="tip"></div>`;
  const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), hl = svg.querySelector(".hl"), dots = [...svg.querySelectorAll(".hds circle")], clip = svg.querySelector(".clip");
  const place = (p, label) => {
    const f = X(p.x) / W;
    tip.style.left = f * 100 + "%";
    tip.style.transform = f > 0.82 ? "translateX(-100%)" : f < 0.18 ? "translateX(0)" : "translateX(-50%)";
    tip.innerHTML = label;
  };
  const rest = () => {
    svg.classList.remove("hover"); clip.setAttribute("width", W);
    if (one) place(pk, `${esc(fmt(pk.y))}<span>${when(pk)}</span>`); else tip.innerHTML = "";
    onHover?.(null);
  };
  const tol = (x1 - x0) / 40 + 11 * MIN;
  const move = (clientX) => {
    const r = svg.getBoundingClientRect(), x = x0 + ((((clientX - r.left) / r.width) * W - 2) / (W - pr - 2)) * (x1 - x0);
    let best = null;
    for (const p of main) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    if (!best) return;
    const bx = X(best.x);
    svg.classList.add("hover");
    hl.setAttribute("x1", bx); hl.setAttribute("x2", bx);
    clip.setAttribute("width", Math.max(0, bx));
    const vals = series.map((s) => { let b = null; for (const p of s.pts) if (p.y != null && (!b || Math.abs(p.x - best.x) < Math.abs(b.x - best.x))) b = p; return b && Math.abs(b.x - best.x) < tol ? b : null; });
    dots.forEach((c, i) => { const p = vals[i]; c.style.opacity = p ? 1 : 0; if (p) { c.setAttribute("cx", X(p.x)); c.setAttribute("cy", Y(p.y)); } });
    if (one && onHover) { tip.innerHTML = ""; onHover({ ...best, label: when(best), isLast: best === last }); }
    else place(best, one ? `${esc(fmt(best.y))}<span>${when(best)}</span>` : `${when(best)} ${series.map((s, i) => (vals[i] ? `<span style="color:${s.color}">● ${esc(fmt(vals[i].y))}</span>` : "")).join("")}`);
  };
  svg.addEventListener("pointermove", (e) => move(e.clientX));
  svg.addEventListener("pointerdown", (e) => move(e.clientX));
  svg.addEventListener("pointerleave", rest);
  svg.addEventListener("pointercancel", rest);
  rest();
}
function dropdown(host, options, cur, onPick) {
  host.innerHTML = `<button class="dd-btn" type="button" aria-haspopup="true">${esc(options.find((o) => o[0] === cur)?.[1] ?? "")}</button><div class="pop" hidden>${options.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === cur ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`;
  const btn = host.querySelector(".dd-btn"), pop = host.querySelector(".pop");
  btn.addEventListener("click", (e) => { e.stopPropagation(); document.querySelectorAll(".dd .pop").forEach((p) => p !== pop && (p.hidden = true)); pop.hidden = !pop.hidden; });
  pop.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { pop.hidden = true; onPick(b.dataset.k); }));
}
document.addEventListener("click", (e) => { if (!e.target.closest(".dd")) document.querySelectorAll(".dd .pop").forEach((p) => (p.hidden = true)); if (!e.target.closest(".theme-wrap")) document.getElementById("theme-pop").hidden = true; });

/* =========================================================== agregações */
function aggregate(list, keyFn) {
  const m = new Map();
  for (const g of list) {
    const k = keyFn(g);
    const e = m.get(k) ?? { key: k, games: [], playing: 0, prev: 0, prevOk: 0, visits: 0, verified: false, type: g.creatorType };
    e.games.push(g); e.playing += g.playing; e.visits += g.visits; e.verified ||= g.verified;
    if (g.d1 != null) { e.prev += g.playing / (1 + g.d1); e.prevOk += g.playing; }
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, d1: e.prevOk > e.playing * 0.6 && e.prev > 0 ? e.prevOk / e.prev - 1 : null, newest: Math.min(...e.games.map((g) => ageDays(g.created))) })).sort((a, b) => b.playing - a.playing);
}
const STOP = new Set(["the", "and", "for", "you", "with", "your", "new", "game", "roblox", "event", "beta", "alpha", "free", "upd", "update", "updated", "das", "dos", "com", "para", "uma", "del", "los", "las", "mode", "edition", "version", "test", "testing", "release", "part", "chapter", "season"]);
function buildWords() {
  const m = new Map();
  for (const g of S.data.games) {
    const ws = new Set((g.name.toLowerCase().match(/[\p{L}\p{N}+]{3,}|\+1/gu) || []).filter((w) => !STOP.has(w) && !/^\d+$/.test(w)));
    for (const w of ws) {
      const e = m.get(w) ?? { w, games: [], playing: 0, newCount: 0, prev: 0, prevOk: 0 };
      e.games.push(g); e.playing += g.playing; if (ageDays(g.created) <= 30) e.newCount++;
      if (g.d1 != null) { e.prev += g.playing / (1 + g.d1); e.prevOk += g.playing; }
      m.set(w, e);
    }
  }
  return [...m.values()].filter((e) => e.games.length >= 3).map((e) => ({ ...e, label: e.w === "+1" ? "+1" : e.w[0].toUpperCase() + e.w.slice(1), d1: e.prevOk > e.playing * 0.6 && e.prev ? e.prevOk / e.prev - 1 : null, newest: Math.min(...e.games.map((g) => ageDays(g.created))) }));
}
const breakingOut = () => S.data.games.filter((g) => g.d1 != null && g.playing >= 1000 && g.playing / (1 + g.d1) >= 150).sort((a, b) => b.d1 - a.d1);
const breakingOutFallback = () => S.data.games.filter((g) => g.d1h != null && g.playing >= 1000).sort((a, b) => b.d1h - a.d1h);
const todayBR = () => new Date(Date.now() - 3 * HOUR).toISOString().slice(0, 10);
const newHighs = () => { const t = todayBR(); return S.data.games.filter((g) => g.peakDate === t && g.playing >= g.peak * 0.97 && ageDays(g.created) > 2 && g.playing >= 500); };
const listGames = (s) => S.data.games.filter((g) => g.lists?.[s]).sort((a, b) => a.lists[s] - b.lists[s]);
function rankDelta(g, s) {
  const now = g.lists?.[s], was = g.listsPrev?.[s];
  if (!now) return "";
  if (!was) return S.data.games.some((x) => x.listsPrev?.[s]) ? '<span class="chip new">Novo</span>' : "";
  const d = was - now;
  return d === 0 ? "" : `<span class="chip ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"}${Math.abs(d)}</span>`;
}

/* =========================================================== linhas */
const rowGame = (g, sub, right) => `<a class="r" href="${gl(g)}">${icon(g)}<span class="t"><span class="nm">${esc(g.name)}</span><span class="sb">${sub}</span></span><span class="v">${right}</span></a>`;
const rowRank = (n, g, sub, right, { href = gl(g), name = g.name, style = "" } = {}) => `<a class="r rk" href="${href}"${style ? ` style="${style}"` : ""}>${rankBadge(n)}${icon(g)}<span class="t"><span class="nm">${esc(name)}</span><span class="sb">${sub}</span></span><span class="v">${right}</span></a>`;
const rowStack = (n, href, games, name, sub, right) => `<a class="r stk" href="${href}">${rankBadge(n)}${stack(games)}<span class="t"><span class="nm">${esc(name)}</span><span class="sb">${sub}</span></span><span class="v">${right}</span></a>`;
const plusMore = (games) => `${esc(games[0]?.name ?? "")}${games.length > 1 ? ` + ${nfInt.format(games.length - 1)} mais` : ""}`;

/* =========================================================== moldura */
const TABS = [["", "Visão geral"], ["watchlist", "Watchlist"], ["screener", "Screener"], ["jogos", "Jogos"], ["estudios", "Estúdios"], ["tendencias", "Tendências"], ["rankings", "Rankings"]];
const tabsBar = (on) => `<nav class="tabs" aria-label="Terminal">${TABS.map(([k, l]) => `<a href="#/${k}" class="${k === on ? "on" : ""}">${TAB_ICONS[k]}${l}</a>`).join("")}</nav>`;
function railHTML(extra = "") {
  const w = S.data.games.filter((g) => S.watch.has(g.id)).slice(0, 5);
  const upd = S.data.games.slice(0, 600).sort((a, b) => new Date(b.updated) - new Date(a.updated)).slice(0, 5);
  return `<aside class="rail">${extra}
    ${card("Sua watchlist", "", "#/watchlist", w.length ? `<div class="rows">${w.map((g) => rowGame(g, esc(genre(g.genre)), `${K(g.playing)}${chg(g.d1 ?? g.d1h)}`)).join("")}</div>` : `<p class="empty" style="padding:4px 0 6px">Abra um jogo e toque em <b>Acompanhar</b> para ele aparecer aqui.</p>`)}
    ${card("Atualizados agora", "", "#/jogos/atualizados", `<div class="rows">${upd.map((g) => rowGame(g, `${K(g.playing)} jogando`, `<small>${ago(g.updated)}</small>`)).join("")}</div>`)}
  </aside>`;
}
function frame(tab, colHTML, { rail = true, wide = false } = {}) {
  $view.innerHTML = `<div class="page fade${wide ? " wide" : ""}">${tab != null ? tabsBar(tab) : ""}<div class="col">${colHTML}</div>${rail ? railHTML() : ""}</div>`;
}
// depois de cada página: números rolam, indicadores deslizam, linhas entram em sequência
function afterRender() {
  const t = $view.querySelector(".tabs"); if (t) slide(t, "a.on", "tabs");
  $view.querySelectorAll(".subtabs").forEach((x) => slide(x, ".subtab.on", "subtabs:" + location.hash.split("/")[1]));
  startFlows();
}

/* =========================================================== Visão geral */
const METRICS = [["total", "Jogadores"], ["wpeak", "Pico semanal"], ["growth", "Crescimento"], ["top10", "Participação do top 10"], ["newg", "Participação de jogos novos"], ["over1k", "Jogos acima de 1K"]];
const HOME_RANGES = [["live", "Ao vivo"], ["1d", "1D"], ["1w", "1S"], ["1m", "1M"], ["1y", "1A"], ["all", "Tudo"]];
function totalSeries(metric, range) {
  const T = S.total, f = T.f || {}, step = f.step || 10 * MIN, now = S.data.slot || Date.now();
  const fine = (k) => pts(f[k], step);
  const ratio = (a, b) => { const B = new Map(fine(b).map((p) => [p.x, p.y])); return fine(a).map((p) => ({ x: p.x, y: p.y != null && B.get(p.x) ? (p.y / B.get(p.x)) * 100 : null })); };
  let arr, note = "";
  const span = { live: 3 * HOUR, "1d": DAY, "1w": 7 * DAY, "1m": 30 * DAY, "1y": 365 * DAY, all: Infinity }[range];
  if (metric === "total") {
    if (range === "live" || range === "1d") { arr = sinceT(fine("total"), now - span); if (arr.filter((p) => p.y != null).length < 6) { arr = sinceT(pts(T.h?.total, HOUR), now - Math.max(span, DAY)); note = "Ainda juntando pontos de 10 em 10 minutos; por enquanto o gráfico usa as coletas de hora em hora."; } }
    else if (range === "1w") arr = thin(sinceT(fine("total"), now - span), 360);
    else if (range === "1m") arr = sinceT(pts(T.h?.total, HOUR), now - span);
    else arr = daily(T.d).filter((p) => p.x >= now - span);
    if (range === "1w" && arr.filter((p) => p.y != null).length < 30) arr = sinceT(pts(T.h?.total, HOUR), now - span);
  } else if (metric === "wpeak") {
    const d = daily(T.d);
    arr = d.map((p, i) => ({ ...p, y: Math.max(...d.slice(Math.max(0, i - 6), i + 1).map((q) => q.y ?? 0)) })).filter((p) => p.x >= now - Math.max(span, 14 * DAY));
    note = "Maior pico diário dos 7 dias anteriores a cada ponto.";
  } else if (metric === "growth") {
    const all = fine("total"), M = new Map(all.map((p) => [p.x, p.y]));
    arr = sinceT(all.map((p) => { const o = M.get(p.x - DAY); return { x: p.x, y: p.y != null && o ? (p.y / o - 1) * 100 : null }; }), now - Math.min(span, 7 * DAY));
    note = "Variação em relação ao mesmo horário do dia anterior.";
  } else if (metric === "top10") { arr = sinceT(ratio("top10", "total"), now - Math.min(span, 7 * DAY)); note = "Fatia dos jogadores que está nos 10 maiores jogos."; }
  else if (metric === "newg") { arr = sinceT(ratio("newg", "total"), now - Math.min(span, 7 * DAY)); note = "Fatia dos jogadores em jogos criados há menos de 30 dias."; }
  else if (metric === "over1k") { arr = sinceT(fine("over1k"), now - Math.min(span, 7 * DAY)); note = "Quantos jogos do top têm mais de 1.000 jogando."; }
  if (metric !== "total" && metric !== "wpeak" && span > 7 * DAY) note += " Esta métrica tem histórico de até 7 dias.";
  const fmt = metric === "growth" ? (v) => (v >= 0 ? "+" : "") + nf(v, 1) + "%" : metric === "top10" || metric === "newg" ? (v) => nf(v, 1) + "%" : metric === "over1k" ? (v) => nfInt.format(Math.round(v)) : K;
  return { arr, note, fmt };
}
function homeDelta() {
  const T = S.total, a = pts(T.f?.total, T.f?.step || 10 * MIN);
  const nearest = (arr, t, tol) => { let b = null; for (const p of arr) if (p.y != null && Math.abs(p.x - t) <= tol && (!b || Math.abs(p.x - t) < Math.abs(b.x - t))) b = p; return b; };
  const d = nearest(a, S.data.slot - DAY, 40 * MIN) || nearest(pts(T.h?.total, HOUR), S.data.slot - DAY, 2 * HOUR);
  if (d) return { v: d.y, l: "nas últimas 24h" };
  const h = nearest(a, S.data.slot - HOUR, 10 * MIN);
  return h ? { v: h.y, l: "na última hora" } : null;
}
// variação comparando os mesmos jogos (quem entrou no top agora não infla o número)
function likeForLike(key) {
  let now = 0, before = 0;
  for (const g of S.data.games) if (g[key] != null) { now += g.playing; before += g.playing / (1 + g[key]); }
  return before > 0 ? { v: before, now } : null;
}
function pageHome() {
  const G = S.data.games;
  const lf = likeForLike("d1"), lh = likeForLike("d1h");
  const ref = lf && lf.now > S.data.total * 0.7 ? { v: lf.v, now: lf.now, l: "nas últimas 24h" } : lh ? { v: lh.v, now: lh.now, l: "na última hora" } : null;
  const delta = ref ? ref.now - ref.v : null;
  const restSub = `${delta != null ? `${deltaChip(delta, ref.v)}<span class="muted">${ref.l} ·</span>` : ""}<span class="muted">jogando nos ${nfInt.format(G.length)} maiores jogos</span>`;
  let bo = breakingOut(), boLabel = "";
  if (bo.length < 5) { bo = breakingOutFallback(); boLabel = "última hora"; }
  const highs = newHighs().sort((a, b) => b.playing - a.playing);
  const earning = listGames("top-earning");
  const fresh = G.filter((g) => ageDays(g.created) <= 30);
  const trends = S.words.slice().sort((a, b) => b.newCount - a.newCount || b.playing - a.playing).slice(0, 5);
  frame("", `
    <section class="hero" id="hero">
      <div class="hero-top"><span class="live-dot" title="Ao vivo"></span>${flowHTML("home", S.data.total)}</div>
      <div class="hero-sub" id="hs">${restSub}</div>
      <div class="chart" id="hc"></div>
      <div class="chart-bar"><div class="seg" id="hr"></div><div class="dd" id="hm"></div></div>
      <p class="note" id="hn" hidden></p>
    </section>
    <div class="grid2">
      ${card("Disparando", boLabel, "#/jogos/subindo", `<div class="rows">${bo.slice(0, 5).map((g) => rowGame(g, `${age(g.created)} · ${esc(genre(g.genre))}`, `${chg(boLabel ? g.d1h : g.d1)}<small>${K(g.playing)} agora</small>`)).join("") || empty("Ninguém disparou nas últimas 24h.")}</div>`)}
      ${card("Novos recordes", "", "#/jogos/recordes", `<div class="rows">${highs.slice(0, 5).map((g) => rowGame(g, esc(genre(g.genre)), `${K(g.playing)}${chg(g.d1 ?? g.d1h)}`)).join("") || empty("Nenhum jogo bateu recorde hoje (ainda).")}</div>`)}
      ${card("Top jogos", "", "#/jogos", `<div class="rows">${G.slice(0, 5).map((g, i) => rowRank(i + 1, g, esc(g.creator), `${K(g.playing)}${chg(g.d1 ?? g.d1h)}`)).join("")}</div>`)}
      ${card("Top faturamento", "", "#/rankings/top-earning", `<div class="rows">${earning.slice(0, 5).map((g) => rowRank(g.lists["top-earning"], g, `${esc(g.creator)} · ${esc(genre(g.genre))}`, `${K(g.playing)}<small>Pico #${g.listPeak?.["top-earning"] ?? g.lists["top-earning"]}</small>`)).join("") || empty("O ranking de faturamento do Roblox chega na próxima coleta completa.")}</div>`)}
      ${card("Jogos novos", "", "#/jogos/novos", `<div class="rows">${fresh.slice(0, 5).map((g) => rowGame(g, `${age(g.created)} · ${esc(g.creator)}`, `${K(g.playing)}${chg(g.d1 ?? g.d1h)}`)).join("") || empty("Nenhum jogo novo no top.")}</div>`)}
      ${card("Gêneros", "", "#/jogos/generos", `<div class="rows">${S.genres.slice(0, 5).map((x, i) => rowStack(i + 1, genl(x.key), x.games, genre(x.key), `${Math.round((x.playing / S.data.total) * 100)}% dos jogadores`, `${K(x.playing)}${chg(x.d1)}`)).join("")}</div>`)}
      ${card("Tendências", "", "#/tendencias", `<div class="rows">${trends.map((x, i) => rowStack(i + 1, `#/tendencias/${encodeURIComponent(x.w)}`, x.games, x.label, plusMore(x.games), `${nfInt.format(x.newCount)}${chg(x.d1)}`)).join("") || empty("Sem tendências ainda.")}</div>`)}
      ${card("Top estúdios", "", "#/estudios", `<div class="rows">${S.studios.slice(0, 5).map((s, i) => rowRank(i + 1, s.games[0], plusMore(s.games), `${K(s.playing)}${chg(s.d1)}`, { href: sl(s.key), name: s.key })).join("")}</div>`)}
    </div>`);
  let range = store.get("sd-home-range", "1d"), metric = "total";
  const draw = () => {
    const { arr, note, fmt } = totalSeries(metric, range);
    lineChart(document.getElementById("hc"), [{ pts: arr }], { fmt, gapMax: 8, onHover: metric === "total" ? heroHover(document.querySelector("#hero number-flow"), document.getElementById("hs"), S.data.total, restSub) : null });
    const n = document.getElementById("hn"); n.hidden = !note; n.textContent = note;
    document.getElementById("hr").innerHTML = HOME_RANGES.map(([k, l]) => `<button type="button" data-r="${k}" class="${k === range ? "on" : ""}">${k === "live" ? '<span class="live"></span>' : ""}${l}</button>`).join("");
    slide(document.getElementById("hr"));
    document.querySelectorAll("#hr button").forEach((b) => b.addEventListener("click", () => { range = b.dataset.r; store.set("sd-home-range", range); draw(); }));
    dropdown(document.getElementById("hm"), METRICS, metric, (k) => { metric = k; draw(); });
  };
  draw();
}

// seta + diferença + porcentagem (a mesma peça do número grande)
const deltaChip = (d, base) => `<span class="chg ${d >= 0 ? "up" : "down"}"><span class="tri">${d >= 0 ? "▲" : "▼"}</span>${words(Math.abs(d))}${base ? ` (${pctTxt(d / base)})` : ""}</span>`;
// ao passar o mouse no gráfico: o número grande mostra o valor do ponto e a linha de baixo a diferença para agora
function heroHover(num, sub, current, restHTML) {
  return (p) => {
    if (!num || !sub) return;
    if (!p) { delete num.dataset.hover; setFlow(num, current); sub.innerHTML = restHTML; sub.classList.remove("hov"); return; }
    num.dataset.hover = "1"; setFlow(num, p.y);
    const d = p.y - current;
    sub.classList.add("hov");
    sub.innerHTML = p.isLast ? `<span class="muted">agora · ${esc(p.label)}</span>` : `${deltaChip(d, current)}<span class="muted">${esc(p.label)}</span>`;
  };
}

/* =========================================================== Jogos */
const GAME_TABS = [["", "Mais jogados"], ["subindo", "Subindo"], ["caindo", "Caindo"], ["novos", "Novos"], ["recordes", "Novos recordes"], ["atualizados", "Atualizados"], ["generos", "Gêneros"]];
function gamesTable(list, { limit = 100, extra = null } = {}) {
  const head = `<tr><th class="l">#</th><th class="l">Jogo</th>${extra ? `<th>${extra.t}</th>` : ""}<th>↓ Jogadores</th><th>1h</th><th>24h</th><th>7d</th><th>Hoje</th></tr>`;
  const rows = list.slice(0, limit).map((g) => `<tr data-href="${gl(g)}"><td class="rk">${rankBadge(S.rank.get(g.id))}</td><td class="l"><a class="gname" href="${gl(g)}">${icon(g)}<span><b>${esc(g.name)}</b><small>${esc(g.creator)} · ${esc(genre(g.genre))}</small></span></a></td>${extra ? `<td>${extra.f(g)}</td>` : ""}<td class="pl">${nfInt.format(g.playing)}</td><td>${chg(g.d1h)}</td><td>${chg(g.d1)}</td><td>${chg(g.d7)}</td><td class="sp">${sparkline(g.spark || [])}</td></tr>`).join("");
  return `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${rows || `<tr><td colspan="8" class="l muted" style="padding:20px">Nada por aqui ainda.</td></tr>`}</tbody></table></div>`;
}
function wireRows(root) { root.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a,button")) location.hash = tr.dataset.href; })); }
function tableWithMore(host, list, opts = {}) {
  let limit = 100;
  const draw = () => { host.innerHTML = gamesTable(list, { ...opts, limit }) + (list.length > limit ? `<button class="more-btn" type="button">Mostrar mais (${nfInt.format(list.length - limit)})</button>` : `<p class="note">${nfInt.format(list.length)} ${list.length === 1 ? "jogo" : "jogos"}</p>`); wireRows(host); host.querySelector(".more-btn")?.addEventListener("click", () => { limit += 200; draw(); }); };
  draw();
}
const gameSubtabs = (on, search = true) => `<div class="subtabs">${GAME_TABS.map(([k, l]) => `<a class="subtab ${k === on ? "on" : ""}" href="#/jogos${k ? "/" + k : ""}">${l}</a>`).join("")}${search ? `<span class="sep"></span><label class="searchbox">${I.search}<input id="gq" type="search" placeholder="Filtrar" aria-label="Filtrar jogos"></label>` : ""}</div>`;
function pageGames(tab = "") {
  if (tab === "generos") return pageGenres();
  const G = S.data.games;
  let list, extra = null, note = "";
  if (tab === "subindo" || tab === "caindo") {
    const has = G.filter((g) => g.d1 != null).length > G.length * 0.3, k = has ? "d1" : "d1h";
    list = G.filter((g) => g[k] != null && g.playing >= 500).sort((a, b) => (tab === "subindo" ? b[k] - a[k] : a[k] - b[k]));
    note = `Comparando com ${has ? "24 horas" : "1 hora"} atrás, jogos com pelo menos 500 jogando.`;
  } else if (tab === "novos") { list = G.filter((g) => ageDays(g.created) <= 60); extra = { t: "Idade", f: (g) => age(g.created) }; }
  else if (tab === "recordes") { list = newHighs().sort((a, b) => b.playing - a.playing); extra = { t: "Recorde", f: (g) => K(g.peak) }; note = "Jogos no maior número de jogadores desde que o Saint Data começou a acompanhar."; }
  else if (tab === "atualizados") { list = G.slice().sort((a, b) => new Date(b.updated) - new Date(a.updated)); extra = { t: "Atualizado", f: (g) => ago(g.updated) }; }
  else list = G;
  frame("jogos", `${gameSubtabs(tab)}${note ? `<p class="note" style="margin:-4px 2px 8px">${note}</p>` : ""}<div id="gt"></div>`, { rail: false, wide: true });
  const host = document.getElementById("gt");
  tableWithMore(host, list, { extra });
  document.getElementById("gq").addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); tableWithMore(host, q ? list.filter((g) => g.name.toLowerCase().includes(q) || g.creator.toLowerCase().includes(q)) : list, { extra }); });
}
function pageGenres() {
  frame("jogos", `${gameSubtabs("generos", false)}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Gênero</th><th>Jogos</th><th>↓ Jogadores</th><th>Participação</th><th>24h</th></tr></thead><tbody>
    ${S.genres.map((x, i) => `<tr data-href="${genl(x.key)}"><td class="rk">${rankBadge(i + 1)}</td><td class="l"><a class="gname" href="${genl(x.key)}">${stack(x.games)}<span><b>${esc(genre(x.key))}</b><small>${plusMore(x.games)}</small></span></a></td><td>${nfInt.format(x.games.length)}</td><td class="pl">${K(x.playing)}</td><td>${Math.round((x.playing / S.data.total) * 100)}%</td><td>${chg(x.d1)}</td></tr>`).join("")}
    </tbody></table></div>`, { rail: false, wide: true });
  wireRows($view);
}
function pageGenre(name) {
  const x = S.genres.find((g) => g.key === name);
  if (!x) return notFound("Gênero não encontrado");
  frame("jogos", `<div class="page-h"><a class="pill-btn icon" href="#/jogos/generos" aria-label="Voltar">${I.back}</a><div><h1>${esc(genre(name))}</h1><p>${nfInt.format(x.games.length)} jogos · ${K(x.playing)} jogando · ${Math.round((x.playing / S.data.total) * 100)}% dos jogadores</p></div></div><div id="gt"></div>`, { rail: false, wide: true });
  tableWithMore(document.getElementById("gt"), x.games);
}

/* =========================================================== Estúdios */
const studioSpark = (s) => Array.from({ length: 48 }, (_, k) => { let t = 0, any = false; for (const g of s.games) { const v = g.spark?.[k]; if (v != null) { t += v; any = true; } } return any ? t : null; });
function pageStudios(tab = "") {
  let list = S.studios.slice();
  if (tab === "subindo") list = list.filter((s) => s.d1 != null && s.playing > 1000).sort((a, b) => b.d1 - a.d1);
  if (tab === "novos") list = list.filter((s) => s.newest <= 60);
  frame("estudios", `<div class="subtabs">${[["", "Mais jogados"], ["subindo", "Subindo"], ["novos", "Novos"]].map(([k, l]) => `<a class="subtab ${k === tab ? "on" : ""}" href="#/estudios${k ? "/" + k : ""}">${l}</a>`).join("")}<span class="sep"></span><label class="searchbox">${I.search}<input id="sq" type="search" placeholder="Filtrar" aria-label="Filtrar estúdios"></label></div>
    ${tab === "subindo" && !list.length ? '<p class="note">Aparece quando houver 24 horas de coleta.</p>' : ""}<div id="st"></div>`, { rail: false, wide: true });
  const draw = (arr) => {
    document.getElementById("st").innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Estúdio</th><th>↓ Jogadores</th><th>24h</th><th>Jogos</th><th>Hoje</th></tr></thead><tbody>
      ${arr.slice(0, 300).map((s) => `<tr data-href="${sl(s.key)}"><td class="rk">${rankBadge(S.studios.indexOf(s) + 1)}</td><td class="l"><a class="gname" href="${sl(s.key)}">${icon(s.games[0])}<span><b>${esc(s.key)}${s.verified ? ' <span class="verified">✓</span>' : ""}</b><small>${plusMore(s.games)}</small></span></a></td><td class="pl">${K(s.playing)}</td><td>${chg(s.d1)}</td><td>${nfInt.format(s.games.length)}</td><td class="sp">${sparkline(studioSpark(s))}</td></tr>`).join("")}
      </tbody></table></div>`;
    wireRows(document.getElementById("st"));
  };
  draw(list);
  document.getElementById("sq").addEventListener("input", (e) => { const q = e.target.value.trim().toLowerCase(); draw(q ? list.filter((s) => s.key.toLowerCase().includes(q)) : list); });
}
function pageStudio(name) {
  const s = S.studios.find((x) => x.key === name);
  if (!s) return notFound("Estúdio não encontrado");
  const sp = studioSpark(s).map((y, k) => ({ x: S.data.slot - (47 - k) * 30 * MIN, y }));
  frame("estudios", `<div class="page-h"><a class="pill-btn icon" href="#/estudios" aria-label="Voltar">${I.back}</a>${icon(s.games[0], "ic lg")}<div><h1>${esc(s.key)}${s.verified ? ' <span class="verified">✓</span>' : ""}</h1><p>#${S.studios.indexOf(s) + 1} estúdio · ${s.type === "Group" ? "Grupo" : "Usuário"} · ${nfInt.format(s.games.length)} ${s.games.length === 1 ? "jogo" : "jogos"} no top</p></div></div>
    <section class="hero"><div class="hero-top"><span class="live-dot"></span>${flowHTML("s" + s.key, s.playing)}</div><div class="hero-sub">${chg(s.d1)}<span class="muted">nas últimas 24h · ${K(s.visits)} visitas somadas</span></div><div class="chart" id="sc"></div><p class="note">Soma dos jogos do estúdio nas últimas 24 horas.</p></section>
    <div id="st" style="margin-top:8px"></div>`, { rail: false, wide: true });
  lineChart(document.getElementById("sc"), [{ pts: sp }], { h: 200 });
  tableWithMore(document.getElementById("st"), s.games);
}

/* =========================================================== Tendências */
function pageTrends(tab = "") {
  if (tab && !["crescendo", "novas", "mais-jogadas"].includes(tab)) return pageWord(tab);
  let list = S.words.slice();
  if (tab === "crescendo") list = list.filter((w) => w.d1 != null && w.playing > 2000).sort((a, b) => b.d1 - a.d1);
  else if (tab === "novas") list = list.filter((w) => w.newCount >= 2).sort((a, b) => a.newest - b.newest);
  else if (tab === "mais-jogadas") list.sort((a, b) => b.playing - a.playing);
  else list.sort((a, b) => b.newCount - a.newCount || b.playing - a.playing);
  frame("tendencias", `<div class="subtabs">${[["", "Mais jogos novos"], ["crescendo", "Crescendo"], ["novas", "Novas"], ["mais-jogadas", "Mais jogadas"]].map(([k, l]) => `<a class="subtab ${k === tab ? "on" : ""}" href="#/tendencias${k ? "/" + k : ""}">${l}</a>`).join("")}</div>
    <p class="note" style="margin:-4px 2px 8px">Palavras que aparecem nos nomes dos jogos do top. “Novos” conta os jogos criados nos últimos 30 dias.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Nome</th><th>↓ Novos</th><th>24h</th><th>Jogadores</th></tr></thead><tbody>
    ${list.slice(0, 200).map((w, i) => `<tr data-href="#/tendencias/${encodeURIComponent(w.w)}"><td class="rk">${rankBadge(i + 1)}</td><td class="l"><a class="gname" href="#/tendencias/${encodeURIComponent(w.w)}">${stack(w.games)}<span><b>${esc(w.label)}</b><small>${plusMore(w.games)}</small></span></a></td><td>${nfInt.format(w.newCount)}</td><td>${chg(w.d1)}</td><td class="pl">${K(w.playing)}</td></tr>`).join("") || '<tr><td colspan="5" class="l muted" style="padding:20px">Aparece quando houver 24 horas de coleta.</td></tr>'}
    </tbody></table></div>`, { rail: false, wide: true });
  wireRows($view);
}
function pageWord(w) {
  const x = S.words.find((e) => e.w === w);
  if (!x) return notFound("Tendência não encontrada");
  frame("tendencias", `<div class="page-h"><a class="pill-btn icon" href="#/tendencias" aria-label="Voltar">${I.back}</a>${stack(x.games)}<div><h1>“${esc(x.label)}”</h1><p>${nfInt.format(x.games.length)} jogos no top · ${nfInt.format(x.newCount)} novos em 30 dias · ${K(x.playing)} jogando</p></div></div><div id="gt"></div>`, { rail: false, wide: true });
  tableWithMore(document.getElementById("gt"), x.games, { extra: { t: "Idade", f: (g) => age(g.created) } });
}

/* =========================================================== Rankings (listas oficiais do Roblox) */
function pageRankings(sortId = "") {
  if (sortId) {
    const list = listGames(sortId);
    frame("rankings", `<div class="page-h"><a class="pill-btn icon" href="#/rankings" aria-label="Voltar">${I.back}</a><div><h1>${esc(listName(sortId))}</h1><p>Lista oficial do Roblox (computador, todos os países) · ${nfInt.format(list.length)} jogos</p></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">#</th><th class="l">Jogo</th><th>Mudança</th><th>Melhor posição</th><th>Jogadores</th><th>24h</th></tr></thead><tbody>
      ${list.map((g) => `<tr data-href="${gl(g)}"><td class="rk">${rankBadge(g.lists[sortId])}</td><td class="l"><a class="gname" href="${gl(g)}">${icon(g)}<span><b>${esc(g.name)}</b><small>${esc(g.creator)} · ${esc(genre(g.genre))}</small></span></a></td><td>${rankDelta(g, sortId) || '<span class="muted">—</span>'}</td><td>#${g.listPeak?.[sortId] ?? g.lists[sortId]}</td><td class="pl">${K(g.playing)}</td><td>${chg(g.d1 ?? g.d1h)}</td></tr>`).join("") || '<tr><td colspan="6" class="l muted" style="padding:20px">Esta lista chega na próxima coleta completa.</td></tr>'}
      </tbody></table></div>`, { rail: false, wide: true });
    return wireRows($view);
  }
  const avail = LISTS.filter(([s]) => S.data.games.some((g) => g.lists?.[s]));
  frame("rankings", `<div class="grid2">${avail.map(([s, label]) => card(label, "", `#/rankings/${s}`, `<div class="rows">${listGames(s).slice(0, 5).map((g) => rowRank(g.lists[s], g, `${rankDelta(g, s)} ${esc(g.creator)}`, `${K(g.playing)}<small>Pico #${g.listPeak?.[s] ?? g.lists[s]}</small>`)).join("")}</div>`)).join("") || empty("As listas do Roblox chegam na próxima coleta completa.")}</div>`);
}

/* =========================================================== Watchlist, Screener */
function pageWatch() {
  const list = S.data.games.filter((g) => S.watch.has(g.id));
  frame("watchlist", list.length ? `<div id="wt"></div>` : `<div class="card"><div class="card-h"><h3>Sua watchlist está vazia</h3></div><p class="desc">Abra qualquer jogo e toque em <b>Acompanhar</b> (a estrela). Os jogos marcados aparecem aqui e no trilho à direita. A lista fica salva neste navegador.</p></div>`, { rail: false, wide: true });
  if (list.length) tableWithMore(document.getElementById("wt"), list);
}
const SCREEN_DEFAULT = { genre: "", min: 1000, max: "", age: "", growth: "", likes: "", updated: "" };
function pageScreener() {
  let f = { ...SCREEN_DEFAULT, ...store.get("sd-screen", {}) };
  const saved = store.get("sd-screens", []);
  frame("screener", `
    <div class="page-h"><div><h1>Screener</h1><p>Monte filtros e veja na hora quais jogos se encaixam. Os filtros ficam salvos neste navegador.</p></div></div>
    <form class="filters" id="sf">
      <label>Gênero<select name="genre"><option value="">Todos</option>${S.genres.map((g) => `<option value="${esc(g.key)}">${esc(genre(g.key))}</option>`).join("")}</select></label>
      <label>Jogando (mín.)<input name="min" type="number" min="0" step="100"></label>
      <label>Jogando (máx.)<input name="max" type="number" min="0" step="100"></label>
      <label>Idade máx. (dias)<input name="age" type="number" min="0"></label>
      <label>Variação 24h mín. (%)<input name="growth" type="number" step="1"></label>
      <label>Aprovação mín. (%)<input name="likes" type="number" min="0" max="100"></label>
      <label>Atualizado há até (dias)<input name="updated" type="number" min="0"></label>
      <label>&nbsp;<button class="pill-btn" type="button" id="ssave">Salvar filtro</button></label>
    </form>
    <div class="subtabs" id="ssv">${saved.map((s, i) => `<button class="subtab" type="button" data-i="${i}">${esc(s.name)}</button>`).join("")}</div>
    <div id="sr"></div>`, { rail: false, wide: true });
  const form = document.getElementById("sf");
  const fill = () => { for (const [k, v] of Object.entries(f)) if (form.elements[k]) form.elements[k].value = v; };
  const run = () => {
    const n = (k) => (f[k] === "" || f[k] == null ? null : Number(f[k]));
    const list = S.data.games.filter((g) => (!f.genre || g.genre === f.genre) && (n("min") == null || g.playing >= n("min")) && (n("max") == null || g.playing <= n("max")) && (n("age") == null || ageDays(g.created) <= n("age")) && (n("growth") == null || (g.d1 ?? g.d1h ?? -Infinity) * 100 >= n("growth")) && (n("likes") == null || (likes(g) ?? 0) * 100 >= n("likes")) && (n("updated") == null || ageDays(g.updated) <= n("updated")));
    tableWithMore(document.getElementById("sr"), list, { extra: { t: "Aprovação", f: (g) => (likes(g) == null ? "—" : Math.round(likes(g) * 100) + "%") } });
  };
  fill(); run();
  form.addEventListener("input", () => { for (const k of Object.keys(SCREEN_DEFAULT)) f[k] = form.elements[k].value; store.set("sd-screen", f); run(); });
  form.addEventListener("submit", (e) => e.preventDefault());
  document.getElementById("ssave").addEventListener("click", () => { const name = (f.genre ? genre(f.genre) : "Todos") + (f.min ? ` ≥${K(Number(f.min))}` : "") + (f.age ? ` · ${f.age}d` : "") + (f.growth ? ` · ${f.growth}%` : ""); saved.push({ name, f: { ...f } }); store.set("sd-screens", saved); toast("Filtro salvo"); pageScreener(); });
  document.querySelectorAll("#ssv [data-i]").forEach((b) => b.addEventListener("click", () => { f = { ...saved[b.dataset.i].f }; store.set("sd-screen", f); fill(); run(); }));
}

/* =========================================================== Jogo */
async function loadShard(id) {
  const k = id % 32;
  if (!S.shards.has(k)) S.shards.set(k, fetch(BASE + "l/" + k + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return (await S.shards.get(k))?.games?.[id] ?? null;
}
async function loadG(id) {
  if (!S.gfiles.has(id)) S.gfiles.set(id, fetch(BASE + "g/" + id + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return S.gfiles.get(id);
}
const GAME_RANGES = [["live", "Ao vivo"], ["1d", "1D"], ["1w", "1S"], ["all", "Tudo"]];
function gameSeries(fine, gf, range, metric) {
  const now = S.data.slot;
  if (metric === "peak") return daily(gf?.d, "peak");
  if (metric === "hours") return daily(gf?.d, "avg").map((p) => ({ ...p, y: p.y == null ? null : p.y * 24 }));
  if (range === "live") return sinceT(pts(fine, 10 * MIN), now - 3 * HOUR);
  if (range === "1d") { const f = sinceT(pts(fine, 10 * MIN), now - DAY); return f.filter((p) => p.y != null).length >= 6 ? f : sinceT(pts(gf?.h, HOUR), now - DAY); }
  if (range === "1w") return sinceT(pts(gf?.h, HOUR), now - 7 * DAY);
  return daily(gf?.d, "peak");
}
function pageGame(id) {
  const g = S.byId.get(Number(id));
  if (!g) return notFound("Jogo não encontrado", `Este jogo saiu do top ${nfInt.format(S.data.games.length)} ou o link está errado.`);
  const rank = S.rank.get(g.id), lk = likes(g), studio = S.studios.find((s) => s.key === g.creator);
  const on = () => S.watch.has(g.id);
  const comp = S.data.games.filter((x) => x.genre === g.genre);
  const ci = comp.indexOf(g), compShow = ci < 4 ? comp.slice(0, 4) : [...comp.slice(0, 3), g];
  const more = (studio?.games || []).filter((x) => x.id !== g.id).slice(0, 5);
  const bo = breakingOut().slice(0, 5);
  const listsHere = LISTS.filter(([s]) => g.lists?.[s]);
  const watchBtn = () => `${I.star(on())}<span>${on() ? "Acompanhando" : "Acompanhar"}</span>`;
  const restSub = () => `${g.d1 != null ? `${chg(g.d1)}<span class="muted">nas últimas 24h ·</span>` : g.d1h != null ? `${chg(g.d1h)}<span class="muted">na última hora ·</span>` : ""}<span class="muted">coletado ${ago(S.data.t)}</span>`;
  $view.innerHTML = `<div class="page fade">
    <div class="g-sticky" id="gs"><a class="pill-btn icon" href="#/jogos" aria-label="Voltar">${I.back}</a>${icon(g)}<div style="min-width:0;flex:1"><b>${esc(g.name)}</b><small>${words(g.playing)} jogando</small></div><button class="pill-btn dark" type="button" data-watch>${watchBtn()}</button></div>
    <div class="col">
      <div class="g-head"><div>${icon(g, "ic lg")}<h1>${esc(g.name)}</h1><div class="by">Por <a href="${sl(g.creator)}">${esc(g.creator)}</a>${g.verified ? ' <span class="verified">✓</span>' : ""}${studio ? `<span class="chip">#${S.studios.indexOf(studio) + 1} estúdio</span>` : ""}</div>${g.blurb ? `<p class="blurb">${esc(g.blurb)}</p>` : ""}<a class="chip" href="${genl(g.genre)}">${esc(genre(g.genre))}</a></div>
        <div class="g-acts"><button class="pill-btn" type="button" id="gshare">${I.share}Compartilhar</button><button class="pill-btn dark" type="button" data-watch>${watchBtn()}</button><a class="pill-btn icon" href="https://www.roblox.com/games/${g.place}" target="_blank" rel="noopener" aria-label="Jogar no Roblox" title="Jogar no Roblox">${I.play}</a></div></div>
      <section class="hero" id="gh" style="margin-top:14px">
        <div class="hero-top"><span class="live-dot" title="Ao vivo"></span>${flowHTML("g" + g.id, g.playing)}</div>
        <div class="hero-sub" id="gsub">${restSub()}</div>
        <div class="chart" id="gc"><div class="chart-empty loading" style="height:210px"><span>Carregando histórico…</span></div></div>
        <div class="chart-bar"><div class="seg" id="gr"></div><div class="dd" id="gm"></div></div>
      </section>
      <div class="strip">
        <div><small>Rank</small><b class="laurel">${LAUREL()}<span>#${rank}</span>${LAUREL("rt")}</b></div>
        <div><small>Aprovação</small><b>${lk == null ? "—" : Math.round(lk * 100) + "%"}</b></div>
        <div class="hot"><small>Visitas</small><b>${K(g.visits)}</b></div>
        <div class="hot"><small>Visitas por dia</small><b>${K(g.dailyVisits)}</b></div>
        <div><small>Pico</small><b>${words(g.peak)}</b></div>
      </div>
      <div class="ptabs"><button type="button" class="on" data-pt="ov">Visão geral</button><button type="button" data-pt="ab">Sobre</button></div>
      <div id="gp"></div>
    </div>
    <aside class="rail">
      ${more.length ? card(`Mais de ${esc(g.creator)}`, "", sl(g.creator), `<div class="rows">${more.map((x) => rowGame(x, `${age(x.created)} · ${esc(genre(x.genre))}`, `${K(x.playing)}${chg(x.d1 ?? x.d1h)}`)).join("")}</div>`) : ""}
      ${card("Disparando", "", "#/jogos/subindo", `<div class="rows">${bo.map((x) => rowGame(x, `${age(x.created)} · ${esc(genre(x.genre))}`, `${chg(x.d1)}<small>${K(x.playing)} agora</small>`)).join("") || empty("Aparece com 24 horas de coleta.")}</div>`)}
      ${card("Mesmo gênero", "", genl(g.genre), `<div class="rows">${comp.filter((x) => x.id !== g.id).slice(0, 5).map((x) => rowGame(x, esc(x.creator), `${K(x.playing)}${chg(x.d1 ?? x.d1h)}`)).join("")}</div>`)}
    </aside></div>`;
  document.title = `${g.name}: ${nfInt.format(g.playing)} jogando · Saint Data`;
  const sticky = document.getElementById("gs");
  window.__sdScroll = () => sticky.classList.toggle("show", window.scrollY > 260);
  window.addEventListener("scroll", window.__sdScroll, { passive: true });
  const syncWatch = () => $view.querySelectorAll("[data-watch]").forEach((b) => { b.classList.toggle("on", on()); b.innerHTML = watchBtn(); });
  $view.querySelectorAll("[data-watch]").forEach((b) => b.addEventListener("click", () => { on() ? S.watch.delete(g.id) : S.watch.add(g.id); store.set("sd-watch", [...S.watch]); syncWatch(); if (on()) $view.querySelectorAll("[data-watch] svg").forEach((x) => x.classList.add("pop")); toast(on() ? "Adicionado à watchlist" : "Removido da watchlist"); }));
  document.getElementById("gshare").addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copiado"); } catch { toast(location.href); } });

  let fine = null, gf = null, range = store.get("sd-game-range", "1d"), metric = "ccu";
  const draw = () => {
    const arr = gameSeries(fine, gf, range, metric);
    lineChart(document.getElementById("gc"), [{ pts: arr, color: "#e2621b" }], { h: 230, fmt: metric === "hours" ? (v) => words(v) + " h" : K, gapMax: 4, onHover: metric === "ccu" ? heroHover(document.querySelector("#gh number-flow"), document.getElementById("gsub"), g.playing, restSub()) : null });
    document.getElementById("gr").innerHTML = metric === "ccu" ? GAME_RANGES.map(([k, l]) => `<button type="button" data-r="${k}" class="${k === range ? "on" : ""}">${k === "live" ? '<span class="live"></span>' : ""}${l}</button>`).join("") : '<button type="button" class="on">Por dia</button>';
    slide(document.getElementById("gr"));
    document.querySelectorAll("#gr [data-r]").forEach((b) => b.addEventListener("click", () => { range = b.dataset.r; store.set("sd-game-range", range); draw(); }));
    dropdown(document.getElementById("gm"), [["ccu", "Jogadores"], ["peak", "Pico diário"], ["hours", "Horas jogadas por dia"]], metric, (k) => { metric = k; draw(); });
  };
  const tabs = {
    ov: () => {
      const d = gf?.d || { dates: [], avg: [], peak: [] };
      const hp = d.dates.map((x, i) => ({ x, v: (d.avg[i] ?? 0) * 24 })).slice(-14);
      const todayH = (g.avg24 || g.playing) * 24, yH = hp.length > 1 ? hp[hp.length - 2].v : null;
      const hmax = Math.max(...hp.map((x) => x.v), 1);
      const hourly = pts(gf?.h, HOUR).filter((p) => p.y != null);
      const byHour = Array.from({ length: 24 }, () => []);
      hourly.forEach((p) => byHour[(new Date(p.x).getUTCHours() + 21) % 24].push(p.y));
      const avgH = byHour.map((a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null));
      const nowH = (new Date().getUTCHours() + 21) % 24, amax = Math.max(...avgH.filter((x) => x != null), 1);
      const passes = (gf?.passes || []).slice().sort((a, b) => a.price - b.price);
      const thumbs = gf?.thumbs || g.thumbs || [];
      return `
        <div class="sec"><div class="sec-h"><h2>Números-chave</h2><button class="see" type="button" data-hist>Histórico</button></div>
          <div class="kv"><span>${I.clock}Tempo médio de visita</span><b>${g.avgVisitMin ? `${nfInt.format(g.avgVisitMin)} min` : "—"}</b></div>
          <div class="kv"><span>${I.starO}Favoritos</span><b>${K(g.fav)}</b></div>
          <div class="kv"><span>${I.refresh}Atualizado</span><b>${ago(g.updated)}</b></div>
          <div class="kv"><span>${I.cal}Criado</span><b>${ago(g.created)}</b></div>
          <div class="kv"><span>${I.users}Jogadores por servidor</span><b>${g.maxPlayers ?? "—"}</b></div>
        </div>
        <div class="sec"><div class="sec-h"><h2>Engajamento</h2></div><div class="duo">
          <div class="mini"><div class="mh"><span>Horas jogadas por dia</span><span>Saint Data</span></div><div class="mv">${words(todayH)}</div>${yH ? `<div class="hero-sub" style="font-size:12px">${chg(todayH / yH - 1)}<span class="muted">vs ontem (${words(yH)})</span></div>` : '<div class="note" style="margin:2px 0 0">média das últimas 24h × 24</div>'}
            <div class="bars">${hp.map((x, i) => `<i class="${i === hp.length - 1 ? "now" : ""}" style="height:${Math.max(4, (x.v / hmax) * 100)}%" title="${dfmt.format(new Date(x.x + "T15:00:00Z"))}: ${words(x.v)} h"></i>`).join("") || '<i class="dim" style="height:4%"></i>'}</div><div class="bar-x"><span>${hp[0] ? dfmt.format(new Date(hp[0].x + "T15:00:00Z")) : ""}</span><span>hoje</span></div></div>
          <div class="mini"><div class="mh"><span>Visitas por dia</span><span>Saint Data</span></div><div class="mv">${K(g.dailyVisits)}</div><div class="note" style="margin:2px 0 0">${g.dailyVisits ? `${nf((g.dailyVisits / Math.max(1, g.visits)) * 100, 3)}% de todas as visitas do jogo` : "Aparece quando houver 24 horas de coleta."}</div>
            <div class="kv" style="margin-top:10px"><span>Visitas totais</span><b>${K(g.visits)}</b></div><div class="kv"><span>Votos</span><b>${K(g.up + g.down)}</b></div></div>
        </div></div>
        ${listsHere.length ? `<div class="sec"><div class="sec-h"><h2>Rankings do Roblox</h2><a class="see" href="#/rankings">Ver todos</a></div><div class="rcards">${listsHere.map(([s, l, c, e]) => `<a class="rcard" href="#/rankings/${s}"><span class="ri" style="background:${c}">${e}</span><b>#${g.lists[s]}</b><small>${esc(l)}${g.listPeak?.[s] && g.listPeak[s] < g.lists[s] ? ` · melhor #${g.listPeak[s]}` : ""}</small></a>`).join("")}</div></div>` : ""}
        ${passes.length ? `<div class="sec"><div class="sec-h"><h2>Loja</h2><span class="see">${passes.length} ${passes.length === 1 ? "passe" : "passes"}</span></div><div class="rows">${passes.slice(0, 8).map((p) => `<div class="r">${p.icon ? `<img class="ic" src="${esc(p.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="border-radius:50%">` : '<span class="ic"></span>'}<span class="t"><span class="nm" style="color:inherit">${esc(p.name)}</span></span><span class="v">${I.robux}${nfInt.format(p.price)}</span></div>`).join("")}</div></div>` : ""}
        <div class="sec"><div class="sec-h"><h2>Competição</h2><a class="see" href="${genl(g.genre)}">Ver todos</a></div><div class="rows">${compShow.map((x) => rowRank(comp.indexOf(x) + 1, x, esc(genre(x.genre)), `${K(x.playing)}${chg(x.d1 ?? x.d1h)}`, { style: x.id === g.id ? "background:var(--soft);border-radius:12px;padding-inline:6px" : "" })).join("")}</div></div>
        ${gf?.badges?.length ? `<div class="sec"><div class="sec-h"><h2>Progressão</h2><div class="seg" id="bseg"><button type="button" class="on" data-b="day">Último dia</button><button type="button" data-b="all">Todos os tempos</button></div></div><div class="rows" id="brows"></div></div>` : ""}
        <div class="sec"><div class="sec-h"><h2>Quando jogam</h2><span class="see">horário de Brasília</span></div>
          ${hourly.length >= 6 ? `<div class="hours" style="margin-top:22px">${avgH.map((v, h) => `<div class="${h === nowH ? "now" : ""}" data-l="${h === nowH ? `${String(h).padStart(2, "0")}h · ${words(v)}` : ""}"><i style="height:${v == null ? 2 : Math.max(3, (v / amax) * 100)}%" title="${String(h).padStart(2, "0")}h: ${v == null ? "sem dados" : words(v)}"></i></div>`).join("")}</div><div class="hours-x"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div><div class="regions"><span>Ásia</span><span>Europa</span><span>Américas</span></div><p class="note">Média de jogadores em cada hora do dia, a partir das coletas dos últimos ${Math.max(1, Math.min(14, Math.round(hourly.length / 24)))} dias.</p>` : empty("Aparece depois de algumas horas de coleta.")}
        </div>
        ${thumbs.length ? `<div class="sec"><div class="sec-h"><h2>Imagens</h2></div><div class="pics">${thumbs.slice(0, 3).map((u) => `<a href="https://www.roblox.com/games/${g.place}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div></div>` : ""}`;
    },
    ab: () => `<div class="sec"><div class="sec-h"><h2>Descrição</h2></div><p class="desc">${esc(gf?.desc || g.blurb) || "Sem descrição."}</p></div>
      <div class="sec"><div class="sec-h"><h2>Ficha</h2></div>
        <div class="kv"><span>Criado em</span><b>${g.created ? dyfmt.format(new Date(g.created)) : "—"}</b></div><div class="kv"><span>Última atualização</span><b>${g.updated ? dyfmt.format(new Date(g.updated)) : "—"}</b></div>
        <div class="kv"><span>Gênero</span><b>${esc(genre(g.genre))}${g.genre2 ? " · " + esc(g.genre2) : ""}</b></div><div class="kv"><span>Classificação</span><b>${esc(g.maturity || "—")}</b></div>
        <div class="kv"><span>Curtidas / descurtidas</span><b>${K(g.up)} / ${K(g.down)}</b></div><div class="kv"><span>Pico registrado</span><b>${nfInt.format(g.peak)}${g.peakDate ? ` em ${dfmt.format(new Date(g.peakDate + "T15:00:00Z"))}` : ""}</b></div>
        <div class="kv"><span>ID do universo</span><b>${g.id}</b></div><div class="kv"><span>ID do lugar</span><b>${g.place}</b></div>
      </div>`,
  };
  let cur = "ov";
  const show = (k) => {
    cur = k; document.getElementById("gp").innerHTML = tabs[k]();
    $view.querySelectorAll("[data-pt]").forEach((b) => b.classList.toggle("on", b.dataset.pt === k));
    slide($view.querySelector(".ptabs"), "button.on", "ptabs");
    $view.querySelector("[data-hist]")?.addEventListener("click", () => { range = "all"; metric = "ccu"; draw(); document.getElementById("gh").scrollIntoView({ behavior: "smooth" }); });
    const brows = document.getElementById("brows");
    if (brows) {
      const bs = gf.badges;
      const drawB = (mode) => { brows.innerHTML = bs.slice(0, 10).map((b, i) => `<div class="r">${b.icon ? `<img class="ic" src="${esc(b.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="border-radius:50%">` : '<span class="ic"></span>'}<span class="t"><span class="nm" style="color:inherit">${esc(b.name)}</span><span class="sb">${i > 0 && bs[i - 1].awarded ? `${Math.round((b.awarded / bs[i - 1].awarded) * 100)}% de conversão` : b.winRate != null ? `${nf(b.winRate, 1)}% de quem joga ganha` : ""}</span></span><span class="v">${words(mode === "day" ? b.pastDay : b.awarded)}<small>concedidas</small></span></div>`).join(""); document.querySelectorAll("#bseg button").forEach((x) => x.classList.toggle("on", x.dataset.b === mode)); slide(document.getElementById("bseg")); };
      drawB("day");
      document.querySelectorAll("#bseg button").forEach((x) => x.addEventListener("click", () => drawB(x.dataset.b)));
    }
  };
  $view.querySelectorAll("[data-pt]").forEach((b) => b.addEventListener("click", () => show(b.dataset.pt)));
  show("ov");
  Promise.all([loadShard(g.id), loadG(g.id)]).then(([f, gg]) => { if (location.hash !== "#/jogo/" + g.id) return; fine = f; gf = gg; draw(); show(cur); });
}

/* =========================================================== Atividade */
function pageActivity() {
  const G = S.data.games, ev = [];
  const t = new Date(S.data.t).getTime();
  for (const g of newHighs()) ev.push({ g, w: t, k: 3, tag: '<span class="chip up">Recorde</span> ', tx: `<b>${esc(g.name)}</b> bateu o próprio recorde: ${nfInt.format(g.playing)} jogando` });
  for (const g of G.filter((x) => x.d1h != null && x.d1h >= 0.5 && x.playing >= 2000)) ev.push({ g, w: t, k: 2, tag: '<span class="chip up">Disparando</span> ', tx: `<b>${esc(g.name)}</b> subiu ${pctTxt(g.d1h)} na última hora e tem ${K(g.playing)} jogando` });
  for (const g of G.filter((x) => x.d1h != null && x.d1h <= -0.35 && x.playing >= 3000)) ev.push({ g, w: t, k: 1, tag: '<span class="chip down">Caindo</span> ', tx: `<b>${esc(g.name)}</b> perdeu ${pctTxt(-g.d1h)} dos jogadores na última hora` });
  const MS = [1e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2e6];
  for (const g of G) { if (g.d1h == null) continue; const before = g.playing / (1 + g.d1h); const m = MS.filter((x) => g.playing >= x && before < x).pop(); if (m) ev.push({ g, w: t, k: 2, tag: '<span class="chip new">Marco</span> ', tx: `<b>${esc(g.name)}</b> passou de ${words(m)} jogando` }); }
  for (const g of G.slice(0, 800)) if (ageDays(g.updated) <= 0.25) ev.push({ g, w: new Date(g.updated).getTime(), k: 0, tag: '<span class="chip">Atualização</span> ', tx: `<b>${esc(g.name)}</b> foi atualizado (${K(g.playing)} jogando)` });
  for (const g of G.filter((x) => ageDays(x.created) <= 3 && x.playing >= 1000)) ev.push({ g, w: new Date(g.created).getTime(), k: 1, tag: '<span class="chip new">Estreia</span> ', tx: `<b>${esc(g.name)}</b> estreou ${ago(g.created)} e já tem ${K(g.playing)} jogando` });
  for (const g of G) for (const s of ["top-trending", "top-playing-now", "top-earning"]) if (g.lists?.[s] && g.lists[s] <= 20 && S.data.games.some((x) => x.listsPrev?.[s]) && !g.listsPrev?.[s]) ev.push({ g, w: t, k: 1, tag: '<span class="chip new">Ranking</span> ', tx: `<b>${esc(g.name)}</b> entrou em ${esc(listName(s))} na posição #${g.lists[s]}` });
  ev.sort((a, b) => b.w - a.w || b.k - a.k || b.g.playing - a.g.playing);
  frame(null, `<div class="page-h"><div><h1>Atividade</h1><p>O que mudou nos jogos do top, a partir das últimas coletas. Atualiza a cada 10 minutos.</p></div></div>
    <div class="card"><div class="feed">${ev.slice(0, 150).map((e) => `<a class="ev" href="${gl(e.g)}">${icon(e.g)}<span class="tx">${e.tag}${e.tx}</span><span class="when">${ago(e.w)}</span></a>`).join("") || empty("Nada de diferente nas últimas coletas.")}</div></div>`);
}

/* =========================================================== Comparar */
const CMP_COLORS = ["#007aff", "#e2621b", "#2fbf71", "#a855f7"];
function pageCompare(idsStr = "") {
  let ids = idsStr.split(",").map(Number).filter((id) => S.byId.has(id)).slice(0, 4);
  if (!ids.length) ids = S.data.games.slice(0, 2).map((g) => g.id);
  let range = "1d";
  $view.innerHTML = `<div class="page wide fade"><div class="col">
    <div class="page-h"><div><h1>Comparar jogos</h1><p>Coloque até 4 jogos no mesmo gráfico.</p></div></div>
    <div class="cmp-pick" id="cp"></div>
    <label class="searchbox" style="width:min(360px,100%)">${I.search}<input id="cq" type="search" placeholder="Adicionar jogo" aria-label="Adicionar jogo" style="width:100%"></label>
    <div class="rows card" id="cr" hidden style="max-width:420px"></div>
    <section class="hero"><div class="chart" id="cc"></div><div class="chart-bar"><div class="seg" id="cg"></div></div></section>
    <div id="ct"></div></div></div>`;
  const draw = async () => {
    history.replaceState(null, "", "#/comparar/" + ids.join(","));
    document.getElementById("cp").innerHTML = ids.map((id, i) => `<span class="chip"><i style="background:${CMP_COLORS[i]}"></i>${esc(S.byId.get(id).name)}<button type="button" data-x="${id}" aria-label="Remover">✕</button></span>`).join("");
    document.querySelectorAll("#cp [data-x]").forEach((b) => b.addEventListener("click", () => { ids = ids.filter((x) => x !== Number(b.dataset.x)); draw(); }));
    document.getElementById("cg").innerHTML = [["1d", "24h"], ["1w", "7 dias"], ["all", "Tudo"]].map(([k, l]) => `<button type="button" data-r="${k}" class="${k === range ? "on" : ""}">${l}</button>`).join("");
    slide(document.getElementById("cg"));
    document.querySelectorAll("#cg button").forEach((b) => b.addEventListener("click", () => { range = b.dataset.r; draw(); }));
    const data = await Promise.all(ids.map(async (id) => [await loadShard(id), await loadG(id)]));
    lineChart(document.getElementById("cc"), ids.map((id, i) => ({ pts: gameSeries(data[i][0], data[i][1], range, "ccu"), color: CMP_COLORS[i] })), { h: 280, empty: "Escolha pelo menos um jogo." });
    const host = document.getElementById("ct"); host.innerHTML = gamesTable(ids.map((id) => S.byId.get(id))); wireRows(host);
  };
  const q = document.getElementById("cq"), res = document.getElementById("cr");
  q.addEventListener("input", () => {
    const s = q.value.trim().toLowerCase();
    const found = s ? S.data.games.filter((g) => g.name.toLowerCase().includes(s) && !ids.includes(g.id)).slice(0, 6) : [];
    res.hidden = !found.length;
    res.innerHTML = found.map((g) => `<button class="r" type="button" data-add="${g.id}" style="text-align:left;width:100%">${icon(g)}<span class="t"><span class="nm">${esc(g.name)}</span><span class="sb">${esc(g.creator)}</span></span><span class="v">${K(g.playing)}</span></button>`).join("");
    res.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => { if (ids.length >= 4) return toast("No máximo 4 jogos"); ids.push(Number(b.dataset.add)); q.value = ""; res.hidden = true; draw(); }));
  });
  draw();
}

/* =========================================================== outras */
function pageAbout() {
  const T = S.total, n = T.d?.dates?.length ?? 0;
  $view.innerHTML = `<div class="page wide fade"><div class="col soon">
    <h1>Sobre os dados</h1>
    <p>O Saint Data coleta dados públicos do Roblox <b>a cada 10 minutos</b>: jogadores, visitas e favoritos dos ${nfInt.format(S.data.games.length)} jogos com mais gente jogando. A cada hora, faz uma coleta completa que procura jogos novos (nas listas oficiais de vários países e dispositivos e na busca do Roblox) e atualiza rankings, votos, ícones e imagens. Uma vez por dia, busca os passes e badges dos 300 maiores.</p>
    <p>Última coleta: <b>${dhfmt.format(new Date(S.data.t))}</b> (${ago(S.data.t)}). Histórico: ${n} ${n === 1 ? "dia" : "dias"}${T.d?.dates?.[0] ? ` desde ${dyfmt.format(new Date(T.d.dates[0] + "T15:00:00Z"))}` : ""}.</p>
    <p>O número grande da Visão geral soma só os jogos acompanhados, não o Roblox inteiro. As variações de 1h, 24h e 7d comparam com a coleta mais próxima daquele horário. Visitas por dia, horas jogadas e tempo médio de visita são estimativas feitas a partir das coletas.</p>
    <p>Recordes valem a partir de 18 de outubro de 2026, quando o Saint Data começou a acompanhar.</p></div></div>`;
}
function notFound(t, msg = "") { $view.innerHTML = `<div class="page wide fade"><div class="col soon"><h1>${t}</h1><p>${msg}</p><p><a class="pill-btn" href="#/">Voltar ao início</a></p></div></div>`; }

/* =========================================================== busca, tema, menu */
const $layer = document.getElementById("search-layer"), $q = document.getElementById("search-q"), $res = document.getElementById("search-res");
function openSearch() { $layer.hidden = false; $q.value = ""; searchRender(); setTimeout(() => $q.focus(), 0); }
function closeSearch() { $layer.hidden = true; }
function searchRender() {
  if (!S.data) return;
  const q = $q.value.trim().toLowerCase();
  const games = (q ? S.data.games.filter((g) => g.name.toLowerCase().includes(q)) : S.data.games).slice(0, 8);
  const studios = q ? S.studios.filter((s) => s.key.toLowerCase().includes(q)).slice(0, 4) : [];
  const gens = q ? S.genres.filter((x) => genre(x.key).toLowerCase().includes(q)).slice(0, 3) : [];
  $res.innerHTML = (games.length ? `<h4>Jogos</h4>${games.map((g) => rowGame(g, `${esc(g.creator)} · ${esc(genre(g.genre))}`, `${K(g.playing)}${chg(g.d1 ?? g.d1h)}`)).join("")}` : "")
    + (studios.length ? `<h4>Estúdios</h4>${studios.map((s) => `<a class="r" href="${sl(s.key)}">${icon(s.games[0])}<span class="t"><span class="nm">${esc(s.key)}</span><span class="sb">${s.games.length} jogos</span></span><span class="v">${K(s.playing)}</span></a>`).join("")}` : "")
    + (gens.length ? `<h4>Gêneros</h4>${gens.map((x) => `<a class="r" href="${genl(x.key)}">${stack(x.games)}<span class="t"><span class="nm">${esc(genre(x.key))}</span><span class="sb">${x.games.length} jogos</span></span><span class="v">${K(x.playing)}</span></a>`).join("")}` : "")
    || '<p class="empty" style="padding:12px">Nada encontrado.</p>';
}
document.getElementById("search-btn").addEventListener("click", openSearch);
$q.addEventListener("input", searchRender);
$q.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = $res.querySelector("a"); if (a) { location.hash = a.getAttribute("href"); closeSearch(); } } });
$layer.addEventListener("click", (e) => { if (e.target === $layer || e.target.closest("a")) closeSearch(); });
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSearch();
  if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});
const $pop = document.getElementById("theme-pop"), $tb = document.getElementById("theme-btn");
function applyTheme(t) { const r = document.documentElement; if (t === "system") delete r.dataset.theme; else r.dataset.theme = t; store.set("sd-theme", t); $pop.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.themePick === t)); }
$tb.addEventListener("click", (e) => { e.stopPropagation(); $pop.hidden = !$pop.hidden; });
$pop.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { applyTheme(b.dataset.themePick); $pop.hidden = true; }));
applyTheme(store.get("sd-theme", "system"));
document.getElementById("collapse").addEventListener("click", () => { const c = document.documentElement.classList.toggle("side-collapsed"); store.set("sd-collapsed", c); });

/* =========================================================== rotas */
function route() {
  if (!S.data) return;
  if (window.__sdScroll) { window.removeEventListener("scroll", window.__sdScroll); window.__sdScroll = null; }
  const [a = "", b = "", ...rest] = location.hash.replace(/^#\/?/, "").split("/").map((x) => decodeURIComponent(x));
  const tail = [b, ...rest].filter(Boolean).join("/");
  const nav = { atividade: "atividade", watchlist: "watchlist", comparar: "comparar" }[a] ?? "terminal";
  document.querySelectorAll("[data-nav]").forEach((l) => l.classList.toggle("on", l.dataset.nav === nav));
  const pages = { "": pageHome, jogos: () => pageGames(b), estudios: () => pageStudios(b), estudio: () => pageStudio(tail), genero: () => pageGenre(tail), tendencias: () => pageTrends(tail), rankings: () => pageRankings(b), watchlist: pageWatch, screener: pageScreener, jogo: () => pageGame(b), atividade: pageActivity, comparar: () => pageCompare(b), sobre: pageAbout };
  (pages[a] || pageHome)();
  afterRender();
  if (a !== "jogo") document.title = "Saint Data · Jogadores ao vivo de todos os jogos do Roblox";
}

/* =========================================================== carga */
async function load(first = true) {
  try {
    const [data, total] = await Promise.all(["games.json", "total.json"].map((u) => fetch(BASE + u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} em ${u}`); return r.json(); })));
    if (!total.f) throw new Error("os dados ainda estão no formato antigo; a próxima coleta resolve");
    const changed = !S.data || S.data.t !== data.t;
    S.data = data; S.total = total;
    S.byId = new Map(data.games.map((g) => [g.id, g]));
    S.rank = new Map(data.games.map((g, i) => [g.id, i + 1]));
    S.studios = aggregate(data.games, (g) => g.creator || "Desconhecido");
    S.genres = aggregate(data.games, (g) => g.genre || "");
    S.words = buildWords();
    S.watch = new Set(store.get("sd-watch", []));
    if (changed) { S.shards.clear(); S.gfiles.clear(); }
    document.getElementById("side-stamp").textContent = `Atualizado ${ago(data.t)}`;
    const quiet = /^#\/(jogo|screener|comparar)/.test(location.hash) || document.activeElement?.matches?.("input,select");
    if (first) { route(); window.scrollTo(0, 0); }
    else if (changed && !quiet) { const y = window.scrollY; route(); $view.querySelector(".page")?.classList.remove("fade"); $view.querySelectorAll("svg.draw").forEach((x) => x.classList.remove("draw")); window.scrollTo(0, y); }
    else if (changed && location.hash.startsWith("#/jogo/")) { const g = S.byId.get(Number(location.hash.split("/")[2])), el = $view.querySelector("#gh number-flow"); if (g && el && !el.dataset.hover) setFlow(el, g.playing); }
  } catch (e) {
    if (first) $view.innerHTML = `<div class="page wide"><div class="col soon"><h1>Não foi possível carregar os dados</h1><p>Recarregue a página em alguns instantes. (${esc(e.message)})</p></div></div>`;
  }
}
addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
load();
setInterval(() => { load(false); if (S.data) document.getElementById("side-stamp").textContent = `Atualizado ${ago(S.data.t)}`; }, 2 * 60e3);
