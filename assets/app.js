// Saint Data — app de página única, sem dependências.
const $view = document.getElementById("view");
const $stamp = document.getElementById("stamp");

const state = { data: null, series: null, byId: new Map(), table: { q: "", genre: "", sort: "playing", dir: -1 } };

/* ---------- formatação ---------- */
const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
function compact(n) {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return nf2.format(n / 1e9) + " bi";
  if (a >= 1e6) return nf2.format(n / 1e6) + " mi";
  if (a >= 1e4) return nf1.format(n / 1e3) + " mil";
  return nf.format(n);
}
function pct(x, digits = 1) {
  if (x == null || !isFinite(x)) return '<span class="muted">—</span>';
  const v = x * 100;
  const cls = v > 0.05 ? "up" : v < -0.05 ? "down" : "muted";
  const sign = v > 0.05 ? "▲ " : v < -0.05 ? "▼ " : "";
  return `<span class="${cls}">${sign}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(Math.abs(v))}%</span>`;
}
const dfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const dshort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const tfmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const date = (s) => (s ? dfmt.format(new Date(s)) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const daysAgo = (s) => (s ? (Date.now() - new Date(s).getTime()) / 864e5 : Infinity);
const likes = (g) => (g.up + g.down > 0 ? g.up / (g.up + g.down) : null);

const GENRES_PT = {
  "Simulation": "Simulação", "Survival": "Sobrevivência", "Action": "Ação", "Roleplay & Avatar Sim": "Roleplay e Avatar",
  "Sports & Racing": "Esportes e Corrida", "Shooter": "Tiro", "RPG": "RPG", "Strategy": "Estratégia", "Shopping": "Compras",
  "Party & Casual": "Festa e Casual", "Adventure": "Aventura", "Obby & Platformer": "Obby e Plataforma", "Puzzle": "Quebra-cabeça",
  "Social": "Social", "Entertainment": "Entretenimento", "Education": "Educação", "Utility & Other": "Utilidade e Outros", "": "Sem gênero",
};
const genreName = (g) => GENRES_PT[g] ?? g;
const LISTS = { "top-trending": "Em alta", "up-and-coming": "Promissores", "top-playing-now": "Mais jogados", "fun-with-friends": "Com amigos", "top-revisited": "Mais revisitados" };

function icon(g, cls = "ic") {
  const letter = esc((g.name || "?").replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?");
  return g.icon
    ? `<img class="${cls}" src="${esc(g.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="${cls}" aria-hidden="true">${letter}</span>`;
}
const gameLink = (g) => `#/jogo/${g.id}`;
const studioLink = (name) => `#/estudio/${encodeURIComponent(name)}`;

/* ---------- gráficos ---------- */
function lineChart(points, { height = 220, label = (v) => compact(v) } = {}) {
  // points: [{x: Date-string, y: number|null}]
  const pts = points.filter((p) => p.y != null);
  if (pts.length < 2) return null;
  const W = 800, H = height, pl = 8, pr = 64, pt = 14, pb = 26;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo *= 0.9; hi *= 1.1; }
  const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
  const n = points.length;
  const X = (i) => pl + (i / (n - 1)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let d = "", started = false, first = null, last = null;
  points.forEach((p, i) => {
    if (p.y == null) { started = false; return; }
    d += `${started ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`;
    started = true; first ??= i; last = i;
  });
  const area = `${d}L${X(last).toFixed(1)},${H - pb}L${X(first).toFixed(1)},${H - pb}Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  const grid = ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${W - pr + 8}" y="${(Y(t) + 4).toFixed(1)}" fill="var(--muted)" font-size="12" font-family="var(--mono)">${label(t)}</text>`).join("");
  const xl = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" fill="var(--muted)" font-size="12" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${dshort.format(new Date(points[i].x + "T12:00:00"))}</text>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico diário">${grid}<path d="${area}" fill="var(--chart-fill)"/><path d="${d}" fill="none" stroke="var(--chart)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(last).toFixed(1)}" cy="${Y(points[last].y).toFixed(1)}" r="4.5" fill="var(--chart)" stroke="var(--panel)" stroke-width="2"/><line class="hover-line" x1="0" x2="0" y1="${pt}" y2="${H - pb}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>${xl}</svg>`;
  return { svg, W, n, X, points, label };
}
function mountChart(box, chart, fmt) {
  box.innerHTML = chart.svg + '<div class="tip" hidden></div>';
  const svg = box.querySelector("svg"), tip = box.querySelector(".tip"), hl = svg.querySelector(".hover-line");
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * chart.W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < chart.n; i++) { const dd = Math.abs(chart.X(i) - x); if (dd < bd && chart.points[i].y != null) { bd = dd; best = i; } }
    const p = chart.points[best];
    hl.setAttribute("x1", chart.X(best)); hl.setAttribute("x2", chart.X(best)); hl.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.style.left = (chart.X(best) / chart.W) * r.width + "px";
    tip.style.top = "20px";
    tip.textContent = `${dshort.format(new Date(p.x + "T12:00:00"))} · ${fmt(p.y)}`;
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; hl.setAttribute("visibility", "hidden"); });
}
function noHistory(what) {
  const first = state.series?.dates?.[0];
  return `<div class="chart-note">O histórico ${what} começa em ${first ? dfmt.format(new Date(first + "T12:00:00")) : "breve"}. O gráfico aparece a partir do segundo dia de coleta.</div>`;
}

/* ---------- blocos ---------- */
function rows(list, { value = (g) => compact(g.playing), sub = (g) => pct(g.d1), meta = (g) => esc(g.creator || genreName(g.genre)), start = 1 } = {}) {
  if (!list.length) return '<p class="empty">Nada por aqui ainda.</p>';
  return `<ol class="list">${list.map((g, i) => `<li><a class="row" href="${gameLink(g)}"><span class="rk">${start + i}</span>${icon(g)}<span class="who"><span class="nm">${esc(g.name)}</span><span class="meta">${meta(g)}</span></span><span class="val">${value(g)}<small>${sub(g)}</small></span></a></li>`).join("")}</ol>`;
}
function genreStats(games) {
  const m = new Map();
  for (const g of games) {
    const k = g.genre || "";
    const e = m.get(k) ?? { genre: k, playing: 0, n: 0, prev: 0, hasPrev: true };
    e.playing += g.playing; e.n++;
    if (g.d1 != null) e.prev += g.playing / (1 + g.d1); else e.hasPrev = false;
    m.set(k, e);
  }
  const total = games.reduce((a, g) => a + g.playing, 0) || 1;
  return [...m.values()].map((e) => ({ ...e, share: e.playing / total, d1: e.hasPrev && e.prev > 0 ? e.playing / e.prev - 1 : null })).sort((a, b) => b.playing - a.playing);
}
function studioStats(games) {
  const m = new Map();
  for (const g of games) {
    const k = g.creator || "Desconhecido";
    const e = m.get(k) ?? { name: k, verified: g.verified, type: g.creatorType, playing: 0, visits: 0, games: [] };
    e.playing += g.playing; e.visits += g.visits; e.games.push(g);
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.playing - a.playing);
}
function bars(items, { label, value, href }) {
  const max = Math.max(...items.map((i) => i.share), 0.0001);
  return `<div class="bars">${items.map((i) => {
    const tag = href ? "a" : "div";
    return `<${tag} class="bar"${href ? ` href="${href(i)}"` : ""}><span class="lbl">${label(i)}</span><span class="trk"><span class="fill" style="width:${((i.share / max) * 100).toFixed(1)}%"></span></span><span class="pc">${value(i)}</span></${tag}>`;
  }).join("")}</div>`;
}

/* ---------- páginas ---------- */
function pageHome() {
  const { games, total } = state.data;
  const s = state.series;
  const prevTotal = s.total.length > 1 ? s.total[s.total.length - 2] : null;
  const top = games.slice(0, 10);
  const hasD1 = games.some((g) => g.d1 != null);
  const rising = hasD1
    ? games.filter((g) => g.d1 != null && g.playing >= 1500).sort((a, b) => b.d1 - a.d1).slice(0, 6)
    : games.filter((g) => g.lists?.includes("top-trending")).slice(0, 6);
  const fresh = games.filter((g) => daysAgo(g.created) <= 45).slice(0, 6);
  const gen = genreStats(games).slice(0, 7);
  const studios = studioStats(games).slice(0, 7);

  $view.innerHTML = `
  <div class="home view-in">
    <div>
      <section class="hero">
        <div class="eyebrow">Jogando agora nos ${nf.format(games.length)} maiores jogos</div>
        <div class="big">${nf.format(total)}</div>
        <div class="sub">${prevTotal ? `${pct(total / prevTotal - 1)} <span>vs. coleta anterior</span>` : "<span>Primeira coleta</span>"}<span>· ${tfmt.format(new Date(state.data.t))}</span></div>
        <div class="chart-box" id="total-chart"></div>
      </section>
      <div class="cards">
        <section class="card"><div class="card-head"><h2>${hasD1 ? "Subindo" : "Em alta"} <span class="hint">${hasD1 ? "vs. dia anterior" : "lista do Roblox"}</span></h2><a class="more" href="#/jogos">Ver todos</a></div>
          ${rows(rising, { sub: (g) => (hasD1 ? pct(g.d1, 0) : '<span class="muted">jogando</span>') })}</section>
        <section class="card"><div class="card-head"><h2>Novos <span class="hint">criados nos últimos 45 dias</span></h2><a class="more" href="#/novos">Ver todos</a></div>
          ${rows(fresh, { meta: (g) => `${esc(genreName(g.genre))} · ${date(g.created)}` })}</section>
        <section class="card"><div class="card-head"><h2>Gêneros <span class="hint">participação nos jogadores</span></h2><a class="more" href="#/generos">Detalhes</a></div>
          ${bars(gen, { label: (i) => esc(genreName(i.genre)), value: (i) => nf1.format(i.share * 100) + "%", href: (i) => `#/generos/${encodeURIComponent(i.genre)}` })}</section>
        <section class="card"><div class="card-head"><h2>Estúdios <span class="hint">por jogadores agora</span></h2><a class="more" href="#/estudios">Ver todos</a></div>
          ${studioRows(studios)}</section>
      </div>
    </div>
    <aside class="rail">
      <section class="card"><div class="card-head"><h2>Mais jogados</h2><a class="more" href="#/jogos">Top ${nf.format(games.length)}</a></div>
        ${rows(top, { meta: (g) => esc(genreName(g.genre)) })}</section>
    </aside>
  </div>`;
  const chart = lineChart(s.dates.map((x, i) => ({ x, y: s.total[i] })));
  const box = document.getElementById("total-chart");
  if (chart) mountChart(box, chart, (v) => nf.format(Math.round(v)) + " jogando"); else box.innerHTML = noHistory("diário");
}
function studioRows(list, start = 1) {
  return `<ol class="list">${list.map((s, i) => `<li><a class="row" href="${studioLink(s.name)}"><span class="rk">${start + i}</span>${icon(s.games[0])}<span class="who"><span class="nm">${esc(s.name)}${s.verified ? ' <span class="chip">verificado</span>' : ""}</span><span class="meta">${s.games.length} ${s.games.length === 1 ? "jogo" : "jogos"} · ${esc(s.games[0].name)}</span></span><span class="val">${compact(s.playing)}<small class="muted">jogando</small></span></a></li>`).join("")}</ol>`;
}

const COLS = [
  { k: "playing", t: "Jogando", f: (g) => nf.format(g.playing) },
  { k: "d1", t: "24h", f: (g) => pct(g.d1) },
  { k: "d7", t: "7 dias", f: (g) => pct(g.d7) },
  { k: "visits", t: "Visitas", f: (g) => compact(g.visits) },
  { k: "fav", t: "Favoritos", f: (g) => compact(g.fav) },
  { k: "likes", t: "Aprovação", f: (g) => (likes(g) == null ? "—" : nf1.format(likes(g) * 100) + "%"), v: likes },
  { k: "created", t: "Criado", f: (g) => date(g.created), v: (g) => new Date(g.created || 0).getTime() },
  { k: "updated", t: "Atualizado", f: (g) => date(g.updated), v: (g) => new Date(g.updated || 0).getTime() },
];
function pageGames({ title = "Jogos", intro, filter = () => true, defaultSort } = {}) {
  const t = state.table;
  if (defaultSort && t._page !== title) { t.sort = defaultSort; t.dir = -1; }
  t._page = title;
  const genres = [...new Set(state.data.games.map((g) => g.genre))].sort((a, b) => genreName(a).localeCompare(genreName(b), "pt-BR"));
  $view.innerHTML = `
  <div class="view-in">
    <div class="page-head"><div><h1>${esc(title)}</h1><p>${intro ?? `Os ${nf.format(state.data.games.length)} jogos com mais jogadores no momento da coleta. Clique no título de uma coluna para ordenar.`}</p></div></div>
    <div class="tools">
      <input id="q" type="search" placeholder="Buscar jogo ou estúdio" value="${esc(t.q)}" aria-label="Buscar jogo ou estúdio">
      <select id="genre" aria-label="Filtrar por gênero"><option value="">Todos os gêneros</option>${genres.map((g) => `<option value="${esc(g)}"${g === t.genre ? " selected" : ""}>${esc(genreName(g))}</option>`).join("")}</select>
    </div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Jogo</th><th class="l">Gênero</th>${COLS.map((c) => `<th><button type="button" data-k="${c.k}" class="${t.sort === c.k ? "on" : ""}">${c.t}${t.sort === c.k ? (t.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead><tbody id="tb"></tbody></table></div>
    <p class="count" id="count"></p>
  </div>`;
  const draw = () => {
    const q = t.q.trim().toLowerCase();
    const col = COLS.find((c) => c.k === t.sort);
    const val = col?.v ?? ((g) => g[t.sort]);
    let list = state.data.games.filter(filter).filter((g) => (!t.genre || g.genre === t.genre) && (!q || g.name.toLowerCase().includes(q) || (g.creator || "").toLowerCase().includes(q)));
    list = list.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * t.dir;
    });
    const rank = new Map(state.data.games.map((g, i) => [g.id, i + 1]));
    document.getElementById("tb").innerHTML = list.map((g) => `<tr><td class="muted">${rank.get(g.id)}</td><td class="l"><a class="gcell" href="${gameLink(g)}">${icon(g)}<div><div class="nm">${esc(g.name)}</div><div class="meta">${esc(g.creator)}</div></div></a></td><td class="l"><span class="chip">${esc(genreName(g.genre))}</span></td>${COLS.map((c) => `<td>${c.f(g)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${COLS.length + 3}" class="l muted">Nenhum jogo encontrado.</td></tr>`;
    document.getElementById("count").textContent = `${nf.format(list.length)} ${list.length === 1 ? "jogo" : "jogos"}`;
  };
  draw();
  document.getElementById("q").addEventListener("input", (e) => { t.q = e.target.value; draw(); });
  document.getElementById("genre").addEventListener("change", (e) => { t.genre = e.target.value; draw(); });
  $view.querySelectorAll("th button").forEach((b) => b.addEventListener("click", () => {
    if (t.sort === b.dataset.k) t.dir *= -1; else { t.sort = b.dataset.k; t.dir = -1; }
    pageGames({ title, intro, filter, defaultSort });
  }));
}

function pageGame(id) {
  const g = state.byId.get(Number(id));
  if (!g) { $view.innerHTML = `<div class="view-in"><a class="back" href="#/jogos">← Jogos</a><h1>Jogo não encontrado</h1><p class="muted">Este jogo saiu do top ${nf.format(state.data.games.length)} ou o link está errado.</p></div>`; return; }
  const rank = state.data.games.indexOf(g) + 1;
  const lk = likes(g);
  const listNames = (g.lists || []).map((l) => LISTS[l]).filter(Boolean);
  $view.innerHTML = `
  <div class="view-in">
    <a class="back" href="#/jogos">← Jogos</a>
    <div class="game-head">${icon(g, "ic lg")}<div><div class="eyebrow">#${rank} · ${esc(genreName(g.genre))}${g.genre2 ? " · " + esc(g.genre2) : ""}</div><h1>${esc(g.name)}</h1><div class="by">por <a href="${studioLink(g.creator)}">${esc(g.creator)}</a>${g.verified ? ' <span class="chip">verificado</span>' : ""}</div></div>
      <a class="play" href="https://www.roblox.com/games/${g.place}" target="_blank" rel="noopener">Abrir no Roblox ↗</a></div>
    <div class="stats">
      <div class="stat"><div class="k">Jogando</div><div class="v">${nf.format(g.playing)}</div></div>
      <div class="stat"><div class="k">24h</div><div class="v">${pct(g.d1)}</div></div>
      <div class="stat"><div class="k">7 dias</div><div class="v">${pct(g.d7)}</div></div>
      <div class="stat"><div class="k">Visitas</div><div class="v">${compact(g.visits)}</div></div>
      <div class="stat"><div class="k">Favoritos</div><div class="v">${compact(g.fav)}</div></div>
      <div class="stat"><div class="k">Aprovação</div><div class="v">${lk == null ? "—" : nf1.format(lk * 100) + "%"} <small class="muted">${compact(g.up + g.down)} votos</small></div></div>
    </div>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Jogadores por dia <span class="hint">um ponto por coleta diária</span></h2></div><div class="chart-box" id="g-chart"></div></section>
    <div class="two">
      <section class="card"><div class="card-head"><h2>Descrição</h2></div><p class="desc">${esc(g.desc) || "Sem descrição."}</p></section>
      <section class="card"><div class="card-head"><h2>Ficha</h2></div><dl class="facts">
        <dt>Criado</dt><dd>${date(g.created)}</dd><dt>Última atualização</dt><dd>${date(g.updated)}</dd>
        <dt>Jogadores por servidor</dt><dd>${g.maxPlayers ?? "—"}</dd><dt>Classificação</dt><dd>${esc(g.maturity || "—")}</dd>
        <dt>Listas do Roblox</dt><dd>${listNames.length ? esc(listNames.join(", ")) : "—"}</dd><dt>ID do universo</dt><dd>${g.id}</dd>
      </dl></section>
    </div>
  </div>`;
  const s = state.series, arr = s.games[g.id] || [];
  const chart = lineChart(s.dates.map((x, i) => ({ x, y: arr[i] ?? null })));
  const box = document.getElementById("g-chart");
  if (chart) mountChart(box, chart, (v) => nf.format(Math.round(v)) + " jogando"); else box.innerHTML = noHistory("deste jogo");
}

function pageStudios() {
  const list = studioStats(state.data.games);
  $view.innerHTML = `<div class="view-in"><div class="page-head"><div><h1>Estúdios</h1><p>Grupos e criadores somando os jogadores de todos os seus jogos no top ${nf.format(state.data.games.length)}.</p></div></div>
  <div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Estúdio</th><th>Jogos</th><th>Jogando</th><th>Visitas</th><th class="l">Maior jogo</th></tr></thead><tbody>
  ${list.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="l"><a class="gcell" href="${studioLink(s.name)}">${icon(s.games[0])}<div><div class="nm">${esc(s.name)}</div><div class="meta">${s.type === "Group" ? "Grupo" : "Usuário"}${s.verified ? " · verificado" : ""}</div></div></a></td><td>${s.games.length}</td><td>${nf.format(s.playing)}</td><td>${compact(s.visits)}</td><td class="l"><a href="${gameLink(s.games[0])}">${esc(s.games[0].name)}</a></td></tr>`).join("")}
  </tbody></table></div></div>`;
}
function pageStudio(name) {
  const s = studioStats(state.data.games).find((x) => x.name === name);
  if (!s) { $view.innerHTML = `<div class="view-in"><a class="back" href="#/estudios">← Estúdios</a><h1>Estúdio não encontrado</h1></div>`; return; }
  $view.innerHTML = `<div class="view-in"><a class="back" href="#/estudios">← Estúdios</a><div class="page-head"><div><div class="eyebrow">${s.type === "Group" ? "Grupo" : "Usuário"}${s.verified ? " · verificado" : ""}</div><h1>${esc(s.name)}</h1></div></div>
  <div class="stats"><div class="stat"><div class="k">Jogando</div><div class="v">${nf.format(s.playing)}</div></div><div class="stat"><div class="k">Jogos no top</div><div class="v">${s.games.length}</div></div><div class="stat"><div class="k">Visitas somadas</div><div class="v">${compact(s.visits)}</div></div></div>
  <section class="card">${rows(s.games, { meta: (g) => esc(genreName(g.genre)), start: 1 })}</section></div>`;
}
function pageGenres(sel) {
  const gs = genreStats(state.data.games);
  const cur = sel != null ? gs.find((g) => g.genre === sel) : null;
  const games = cur ? state.data.games.filter((g) => g.genre === cur.genre).slice(0, 25) : [];
  $view.innerHTML = `<div class="view-in"><div class="page-head"><div><h1>${cur ? esc(genreName(cur.genre)) : "Gêneros"}</h1><p>${cur ? `${nf.format(cur.n)} jogos · ${nf.format(cur.playing)} jogando · ${nf1.format(cur.share * 100)}% dos jogadores do top` : "Como os jogadores se dividem entre os gêneros. Clique num gênero para ver os jogos."}</p></div>${cur ? '<a class="back" href="#/generos">← Todos os gêneros</a>' : ""}</div>
  <div class="two"><section class="card"><div class="card-head"><h2>Participação</h2></div>${bars(gs, { label: (i) => esc(genreName(i.genre)), value: (i) => nf1.format(i.share * 100) + "%", href: (i) => `#/generos/${encodeURIComponent(i.genre)}` })}</section>
  <section class="card"><div class="card-head"><h2>${cur ? "Mais jogados do gênero" : "Variação no dia"}</h2></div>${cur ? rows(games) : `<ol class="list">${gs.map((g) => `<li><a class="row" href="#/generos/${encodeURIComponent(g.genre)}" style="grid-template-columns:minmax(0,1fr) auto"><span class="who"><span class="nm">${esc(genreName(g.genre))}</span><span class="meta">${g.n} jogos · ${compact(g.playing)} jogando</span></span><span class="val">${pct(g.d1)}</span></a></li>`).join("")}</ol>`}</section></div></div>`;
}

/* ---------- roteamento ---------- */
function route() {
  if (!state.data) return;
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [a, ...rest] = h.split("/");
  const b = rest.join("/");
  const key = a || "home";
  document.querySelectorAll(".nav a").forEach((l) => l.classList.toggle("on", l.dataset.route === (key === "jogo" ? "jogos" : key === "estudio" ? "estudios" : key)));
  const titles = { home: "", jogos: "Jogos", jogo: "", estudios: "Estúdios", estudio: b, generos: "Gêneros", novos: "Novos" };
  if (key === "jogos") pageGames();
  else if (key === "jogo") pageGame(b);
  else if (key === "estudios") pageStudios();
  else if (key === "estudio") pageStudio(b);
  else if (key === "generos") pageGenres(rest.length ? b : null);
  else if (key === "novos") pageGames({ title: "Novos", intro: "Jogos criados nos últimos 90 dias que já estão entre os mais jogados.", filter: (g) => daysAgo(g.created) <= 90, defaultSort: "playing" });
  else pageHome();
  const g = key === "jogo" ? state.byId.get(Number(b)) : null;
  document.title = g ? `${g.name} · Saint Data` : titles[key] ? `${titles[key]} · Saint Data` : "Saint Data";
  window.scrollTo(0, 0);
}

/* ---------- tema ---------- */
document.getElementById("theme-btn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("sd-theme", root.dataset.theme); } catch {}
});

/* ---------- carga ---------- */
async function load() {
  try {
    const [data, series] = await Promise.all([fetch("data/games.json", { cache: "no-cache" }).then((r) => r.json()), fetch("data/series.json", { cache: "no-cache" }).then((r) => r.json())]);
    state.data = data; state.series = series;
    state.byId = new Map(data.games.map((g) => [g.id, g]));
    $stamp.innerHTML = `Dados públicos do Roblox<br>Atualizado ${tfmt.format(new Date(data.t))}<br>${nf.format(series.dates.length)} ${series.dates.length === 1 ? "dia" : "dias"} de histórico`;
    route();
  } catch (e) {
    $view.innerHTML = `<h1>Não foi possível carregar os dados</h1><p class="muted">Os arquivos em /data não responderam. Tente recarregar a página. (${esc(e.message)})</p>`;
  }
}
addEventListener("hashchange", route);
load();
