// Saint Data — coletor do Fortnite (API pública da Epic: https://api.fortnite.com/ecosystem/v1, sem login).
// Roda de hora em hora no GitHub Actions. Lê o estado anterior de PREV (ramo "dados-fn"), os jogos do Roblox
// do ramo "dados" e grava tudo em OUT.
//
// O que faz a cada execução:
//   1. baixa o catálogo inteiro de mapas públicos (~280 mil: código, nome, criador, tags) e anota quando cada um apareceu
//   2. procura, para cada jogo do top do Roblox, os mapas do Fortnite com o mesmo nome (ou quase)
//   3. busca jogadores/partidas/minutos das últimas 24h dos mapas que importam (top de cada gênero, cópias de jogos do Roblox, novos)
//   4. uma vez por dia: retenção e números diários dos maiores mapas
//
// Arquivos:
//   top.json      mapas com jogadores agora, com métricas de 24h e mini-gráfico
//   match.json    para cada jogo do Roblox: quantos mapas do Fortnite têm o mesmo nome e os melhores
//   tokens.json   para cada palavra dos nomes do Roblox: quantos mapas do Fortnite usam a palavra e quantos jogam neles
//   new.json      mapas que apareceram nos últimos 7 dias
//   copies.json   cópias novas de jogos do Roblox (mapa novo no Fortnite com o nome de um jogo do top do Roblox)
//   total.json    jogadores no Fortnite inteiro (por hora e por dia)
//   catalog.txt   catálogo completo (código, nome, criador) para a busca do site
//   state.json, seen.json   controle interno

import { readFile, writeFile, mkdir } from "node:fs/promises";

const API = "https://api.fortnite.com/ecosystem/v1";
const PREV = process.env.PREV || "prev";
const OUT = process.env.OUT || "out";
const RBX = process.env.RBX || "https://raw.githubusercontent.com/SaintLukz/saint-data/dados/games.json";
const GAP = Number(process.env.GAP || 300); // ms entre chamadas (a Epic limita rajadas)
const METRICS_MS = Number(process.env.METRICS_MS || 11 * 60e3); // tempo máximo buscando métricas por execução
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const TOP_PER_GENRE = 150, MATCH_KEEP = 6, TOP_OUT = 2500;
const NOW = Date.now(), HNOW = Math.floor(NOW / HOUR);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { calls: 0, r429: 0, fails: 0, metrics: 0, dead: 0 };
let nextAt = 0;
async function slot() { const now = Date.now(), t = Math.max(now, nextAt); nextAt = t + GAP; if (t > now) await sleep(t - now); }
async function api(path, tries = 6) {
  let wait = 4000;
  for (let i = 0; i < tries; i++) {
    await slot(); stats.calls++;
    try {
      const r = await fetch(API + path, { headers: { accept: "application/json", "user-agent": "SaintData/1.0 (+github actions)" } });
      if (r.ok) return await r.json();
      if (r.status === 404) return { notFound: true };
      if (r.status === 429) { stats.r429++; nextAt = Date.now() + wait; }
      else if (r.status < 500) { stats.fails++; return null; }
    } catch {}
    await sleep(wait); wait = Math.min(wait * 2, 60e3);
  }
  stats.fails++; return null;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
async function readJSON(p, d) { try { return JSON.parse(await readFile(p, "utf8")); } catch { return d; } }
const save = (name, obj) => writeFile(`${OUT}/${name}`, JSON.stringify(obj));
const iso = (ms) => new Date(ms).toISOString();

// ---------- nomes: normalização e semelhança ----------
const STOP = new Set("a an the of in on at to for and or with my your is it de da do das dos o e el la los las le du des un una".split(" "));
const NOISE = new Set("update upd updated updates new beta alpha release released event events halloween hlwn christmas xmas winter summer free admin op roblox fortnite map maps uefn v1 v2 v3 v4 official season part chapter edition testing test now x2 x3 x5 x10 2x 3x 5x 10x 100x reborn remastered remake".split(" "));
const words = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|【[^】]*】/g, " ").replace(/['’`]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
function core(s) {
  let t = words(s).filter((w) => !STOP.has(w) && !NOISE.has(w)).map(stem);
  if (!t.length) t = words(String(s || "").replace(/[\[\](){}]/g, " ")).filter((w) => !STOP.has(w)).map(stem); // nome todo entre colchetes
  return [...new Set(t)];
}
// mesma regra das "Tendências" do site (palavras de 3+ letras, sem números puros)
const SITE_STOP = new Set(["the", "and", "for", "you", "with", "your", "new", "game", "roblox", "event", "beta", "alpha", "free", "upd", "update", "updated", "das", "dos", "com", "para", "uma", "del", "los", "las", "mode", "edition", "version", "test", "testing", "release", "part", "chapter", "season"]);
const siteWords = (name) => new Set((String(name).toLowerCase().match(/[\p{L}\p{N}+]{3,}|\+1/gu) || []).filter((w) => !SITE_STOP.has(w) && !/^\d+$/.test(w)));

// ---------- catálogo ----------
async function fetchCatalog() {
  const out = []; let after = null;
  for (let p = 0; p < 800; p++) {
    const j = await api(`/islands?size=1000${after ? "&after=" + encodeURIComponent(after) : ""}`);
    if (!j || !j.data) return null;
    for (const d of j.data) out.push({ code: d.code, title: d.title || "", creator: d.creatorCode || "", tags: d.tags || [], createdIn: d.createdIn || "" });
    after = j.meta?.page?.nextCursor;
    if (!after || !j.data.length) return out;
  }
  return out;
}
async function prevCatalog() {
  try {
    const txt = await readFile(`${PREV}/catalog.txt`, "utf8");
    return txt.split("\n").filter(Boolean).map((l) => { const [code, title, creator] = l.split("\t"); return { code, title, creator, tags: [], createdIn: "" }; });
  } catch { return null; }
}

// ---------- métricas de um mapa (últimas ~25h, por hora) ----------
const vals = (a) => (a || []).map((x) => x?.value ?? null);
const sum = (a) => a.reduce((s, x) => s + (x ?? 0), 0);
function summarize(j) {
  const ccu = vals(j.peakCCU);
  const lastIdx = (() => { for (let i = ccu.length - 1; i >= Math.max(0, ccu.length - 3); i--) if (ccu[i] != null) return i; return -1; })();
  const now = lastIdx >= 0 ? ccu[lastIdx] : 0;
  const last24 = (a) => vals(a).slice(-24);
  const peak24 = Math.max(0, ...ccu.filter((x) => x != null));
  const first = ccu.find((x) => x != null);
  const ago = ccu.length >= 25 ? ccu[0] : null;
  const min24 = sum(last24(j.minutesPlayed)), uniq24 = sum(last24(j.uniquePlayers));
  return {
    now, peak24, d1: ago != null && ago > 0 ? now / ago - 1 : null,
    plays24: sum(last24(j.plays)), min24, uniq24, fav24: sum(last24(j.favorites)), rec24: sum(last24(j.recommendations)),
    avgMin: uniq24 > 0 ? Math.round((min24 / uniq24) * 10) / 10 : null,
    spark: ccu.slice(-25), sparkT: j.peakCCU?.length ? j.peakCCU[Math.max(0, j.peakCCU.length - 25)].timestamp : null,
    alive: peak24 > 0 || first != null,
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const state = await readJSON(`${PREV}/state.json`, {});
  const seen = await readJSON(`${PREV}/seen.json`, {});
  const known = state.known || {}; // code -> { now, peak24, at, alive }
  const info = state.info || {}; // code -> métricas completas da última busca
  const firstRun = !state.baseline;
  if (firstRun) state.baseline = NOW;

  // 1) catálogo
  let cat = await fetchCatalog(), catOk = !!cat;
  if (!cat) cat = (await prevCatalog()) || [];
  console.log(`catálogo: ${cat.length} mapas${catOk ? "" : " (anterior: a busca falhou)"} · ${stats.calls} chamadas`);
  const byCode = new Map(cat.map((x) => [x.code, x]));
  const tagsPrev = state.tags || {};
  for (const x of cat) {
    if (!(x.code in seen)) seen[x.code] = firstRun ? 0 : HNOW;
    if (!x.tags.length && tagsPrev[x.code]) x.tags = tagsPrev[x.code];
  }
  if (catOk) for (const c of Object.keys(seen)) if (!byCode.has(c)) delete seen[c];

  // 2) jogos do Roblox e semelhança de nomes
  let rbx = [];
  try { const r = await fetch(RBX, { headers: { "cache-control": "no-cache" } }); if (r.ok) rbx = (await r.json()).games || []; } catch {}
  console.log(`roblox: ${rbx.length} jogos`);
  const cores = cat.map((x) => core(x.title));
  const df = new Map();
  for (const c of cores) for (const w of c) df.set(w, (df.get(w) || 0) + 1);
  const N = cores.length;
  const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 0.5;
  const post = new Map();
  cores.forEach((c, i) => { for (const w of c) { let p = post.get(w); if (!p) post.set(w, (p = [])); p.push(i); } });
  const matches = {}; // rid -> { n, list: [[idx, score]] }
  const matchCore = (c) => {
    const byRare = c.slice().sort((a, b) => idf(b) - idf(a));
    const p0 = post.get(byRare[0]) || [];
    if (p0.length > 25000) return null; // nome genérico demais ("1v1", "tycoon")
    const cand = new Set(p0);
    if (byRare[1] && c.length >= 3) for (const i of post.get(byRare[1]) || []) if (cand.size < 40000) cand.add(i);
    const wA = c.reduce((s, w) => s + idf(w), 0);
    const out = new Map();
    for (const i of cand) {
      const f = cores[i];
      let inter = 0, extra = 0;
      for (const w of c) if (f.includes(w)) inter += idf(w);
      for (const w of f) if (!c.includes(w)) extra += idf(w);
      if (inter / wA < (c.length >= 3 ? 0.7 : 0.99)) continue;
      out.set(i, Math.round((inter / (wA + extra * 0.5)) * 100) / 100);
    }
    return out;
  };
  for (const g of rbx) {
    // o nome todo e, se houver, só a parte antes de "|", " - " ou ":" ("+1 Speed Keyboard Escape | Candy & Chocolate")
    const variants = [core(g.name)];
    const main = String(g.name).split(/\s*:\s|\s[|\-–—]\s|[|]/)[0];
    if (main !== g.name) { const c2 = core(main); if (c2.length && c2.join() !== variants[0].join()) variants.push(c2); }
    let generic = true; const merged = new Map();
    for (const c of variants) {
      if (!c.length) continue;
      const m = matchCore(c);
      if (!m) continue;
      generic = false;
      for (const [i, sc] of m) if (!(merged.get(i) >= sc)) merged.set(i, sc);
    }
    if (!variants[0].length && variants.length === 1) continue;
    if (generic) { matches[g.id] = { n: null, generic: true, list: [] }; continue; }
    const list = [...merged];
    matches[g.id] = { n: list.length, list };
  }

  // 3) quem buscar métricas agora
  const gr = await api("/genres");
  const genres = Array.isArray(gr) ? gr : Array.isArray(gr?.data) ? gr.data : null;
  if (genres?.length) state.genres = genres;
  const ranked = new Map(); // code -> [{ g, rank }]
  for (const gen of state.genres || []) {
    const j = await api(`/genres/${gen.slug}/rankings?size=${TOP_PER_GENRE}`);
    for (const d of j?.data || []) { const a = ranked.get(d.islandCode) || []; a.push({ g: gen.slug, r: d.rank }); ranked.set(d.islandCode, a); }
  }
  console.log(`rankings: ${ranked.size} mapas no topo dos gêneros · ${stats.calls} chamadas`);
  const age = (code) => (known[code] ? HNOW - Math.floor(known[code].at / HOUR) : Infinity);
  const queue = [], inQ = new Set();
  const add = (code) => { if (code && !inQ.has(code) && byCode.has(code)) { inQ.add(code); queue.push(code); } };
  // a) quem tinha bastante gente
  Object.entries(known).filter(([, k]) => k.now >= 100).sort((a, b) => b[1].now - a[1].now).forEach(([c]) => add(c));
  // b) topo dos gêneros que ainda não conhecemos
  for (const c of ranked.keys()) if (!known[c] || known[c].now >= 20 || age(c) >= 3) add(c);
  // c) cópias dos jogos do Roblox (dos jogos maiores e que mais sobem primeiro)
  const rOrder = rbx.slice().sort((a, b) => b.playing * (1 + Math.max(0, Math.min(3, b.d1 ?? 0))) - a.playing * (1 + Math.max(0, Math.min(3, a.d1 ?? 0))));
  for (const g of rOrder) {
    const m = matches[g.id]; if (!m?.list.length) continue;
    m.list.sort((a, b) => b[1] - a[1] || (known[cat[b[0]].code]?.peak24 ?? -1) - (known[cat[a[0]].code]?.peak24 ?? -1));
    for (const [i] of m.list.slice(0, 12)) { const code = cat[i].code, k = known[code]; if (!k || (k.now >= 10 && age(code) >= 1) || (k.alive && age(code) >= 6) || age(code) >= 48) add(code); }
  }
  // d) mapas novos (últimas 48h)
  if (!firstRun) for (const x of cat) if (seen[x.code] && HNOW - seen[x.code] <= 48 && age(x.code) >= 2) add(x.code);
  // e) quem tinha pouca gente e está velho
  Object.entries(known).filter(([, k]) => k.now < 100 && k.alive).sort((a, b) => b[1].now - a[1].now).forEach(([c]) => { if (age(c) >= 6) add(c); });

  const t0 = Date.now();
  await pool(queue, 3, async (code) => {
    if (Date.now() - t0 > METRICS_MS) return;
    const j = await api(`/islands/${code}/metrics/hour`);
    if (!j) return;
    stats.metrics++;
    if (j.notFound) { known[code] = { now: 0, peak24: 0, at: NOW, alive: false }; delete info[code]; stats.dead++; return; }
    const s = summarize(j);
    known[code] = { now: s.now, peak24: s.peak24, at: NOW, alive: s.alive };
    if (s.now >= 1 || s.peak24 >= 5) info[code] = { ...(info[code] || {}), ...s, at: NOW }; else { delete info[code]; stats.dead++; }
  });
  console.log(`métricas: ${stats.metrics} de ${queue.length} na fila · ${stats.dead} sem jogadores · 429: ${stats.r429} · ${Math.round((Date.now() - t0) / 1000)}s`);

  // 4) diário: retenção e números por dia dos maiores
  const topCodes = Object.entries(info).filter(([c]) => byCode.has(c)).sort((a, b) => b[1].now - a[1].now).map(([c]) => c);
  if (!state.lastDaily || NOW - state.lastDaily > 23 * HOUR) {
    const from = iso(NOW - 7 * DAY + MIN), to = iso(NOW);
    let ok = 0;
    await pool(topCodes.slice(0, 400), 3, async (code) => {
      const j = await api(`/islands/${code}/metrics/day?from=${from}&to=${to}`);
      if (!j || j.notFound) return;
      const ret = (j.retention || []).filter((x) => x && x.d1 != null);
      const r = ret[ret.length - 1];
      info[code].day = { ret1: r?.d1 ?? null, ret7: r?.d7 ?? null, peak7: Math.max(0, ...vals(j.peakCCU).filter((x) => x != null)), plays7: sum(vals(j.plays)), dates: (j.peakCCU || []).map((x) => x.timestamp.slice(0, 10)), peaks: vals(j.peakCCU) };
      ok++;
    });
    state.lastDaily = NOW;
    console.log(`diário: ${ok} mapas`);
  }

  // 5) total do Fortnite
  const tot = await api(`/metrics/hour?from=${iso(NOW - 7 * DAY + MIN)}&to=${iso(NOW)}`);
  const T = state.total || { h: {}, d: {} };
  for (const x of tot?.inMatchPeakCCU || []) if (x.value != null) T.h[x.timestamp] = [x.value, T.h[x.timestamp]?.[1] ?? null];
  for (const x of tot?.inClientPeakCCU || []) if (x.value != null) T.h[x.timestamp] = [T.h[x.timestamp]?.[0] ?? null, x.value];
  for (const k of Object.keys(T.h)) if (NOW - new Date(k).getTime() > 90 * DAY) delete T.h[k];
  for (const [k, v] of Object.entries(T.h)) { const d = k.slice(0, 10); T.d[d] = Math.max(T.d[d] || 0, v[0] || 0); }
  const dk = Object.keys(T.d).sort(); for (const k of dk.slice(0, Math.max(0, dk.length - 730))) delete T.d[k];
  state.total = T;

  // ---------- saídas ----------
  const firstSeenISO = (code) => (seen[code] ? iso(seen[code] * HOUR) : null);
  const rbxByMatch = new Map(); // code -> [rid]
  for (const [rid, m] of Object.entries(matches)) for (const [i, sc] of m.list) if (sc >= 0.6) { const c = cat[i].code; const a = rbxByMatch.get(c) || []; a.push(Number(rid)); rbxByMatch.set(c, a); }
  const isl = (code) => {
    const x = byCode.get(code), m = info[code], k = known[code];
    return {
      code, title: x?.title ?? "", creator: x?.creator ?? "", tags: x?.tags ?? [], createdIn: x?.createdIn ?? "", firstSeen: firstSeenISO(code),
      genres: ranked.get(code) || [], now: m?.now ?? (k ? k.now : null), peak24: m?.peak24 ?? k?.peak24 ?? null, d1: m?.d1 ?? null,
      plays24: m?.plays24 ?? null, min24: m?.min24 ?? null, uniq24: m?.uniq24 ?? null, fav24: m?.fav24 ?? null, rec24: m?.rec24 ?? null, avgMin: m?.avgMin ?? null,
      ret1: m?.day?.ret1 ?? null, ret7: m?.day?.ret7 ?? null, peak7: m?.day?.peak7 ?? null, plays7: m?.day?.plays7 ?? null,
      spark: m?.spark ?? null, sparkT: m?.sparkT ?? null, checked: k ? iso(k.at) : null, rbx: rbxByMatch.get(code) || [],
    };
  };
  const totalNow = (() => { const ks = Object.keys(T.h).sort(); const v = ks.length ? T.h[ks[ks.length - 1]] : null; const old = T.h[iso(new Date(ks[ks.length - 1] || 0).getTime() - DAY)]; return { t: ks[ks.length - 1] || null, inMatch: v?.[0] ?? null, inClient: v?.[1] ?? null, d1: old?.[0] && v?.[0] ? v[0] / old[0] - 1 : null }; })();
  const top = topCodes.filter((c) => (info[c]?.now ?? 0) >= 1).slice(0, TOP_OUT).map(isl);
  await save("top.json", { t: iso(NOW), baseline: iso(state.baseline), total: totalNow, count: top.length, islands: top });

  const mOut = {};
  for (const [rid, m] of Object.entries(matches)) {
    if (m.generic) { mOut[rid] = { n: null, generic: true, best: [] }; continue; }
    const list = m.list.slice().sort((a, b) => {
      const ka = known[cat[a[0]].code], kb = known[cat[b[0]].code];
      const sa = a[1] >= 0.85 ? 1 : 0, sb = b[1] >= 0.85 ? 1 : 0; // nome igual vem antes; dentro do grupo, quem tem mais gente
      return sb - sa || (kb?.now ?? -1) - (ka?.now ?? -1) || b[1] - a[1];
    }).slice(0, MATCH_KEEP);
    const alive = m.list.filter(([i]) => (known[cat[i].code]?.now ?? 0) >= 1).length;
    const firstNew = m.list.map(([i]) => seen[cat[i].code]).filter((h) => h > 0).sort((a, b) => a - b)[0];
    mOut[rid] = {
      n: m.n, same: m.list.filter(([, sc]) => sc >= 0.6).length, exact: m.list.filter(([, sc]) => sc >= 0.85).length, alive, unchecked: m.list.filter(([i]) => !known[cat[i].code]).length, firstNew: firstNew ? iso(firstNew * HOUR) : null,
      best: list.map(([i, sc]) => { const c = cat[i].code, k = known[c]; return [c, cat[i].title, cat[i].creator, sc, k ? k.now : null, k ? k.peak24 : null, firstSeenISO(c)]; }),
    };
  }
  await save("match.json", { t: iso(NOW), baseline: iso(state.baseline), games: mOut });

  // palavras: mesma regra das Tendências do site
  const want = new Set(); for (const g of rbx) for (const w of siteWords(g.name)) want.add(w);
  const tok = {};
  for (const w of want) tok[w] = [0, 0, 0, 0];
  cat.forEach((x) => {
    const ws = siteWords(x.title); if (!ws.size) return;
    const k = known[x.code], fresh = seen[x.code] && HNOW - seen[x.code] <= 168;
    for (const w of ws) { const e = tok[w]; if (!e) continue; e[0]++; if (k?.now >= 1) { e[1]++; e[2] += k.now; } if (fresh) e[3]++; }
  });
  await save("tokens.json", { t: iso(NOW), words: tok });

  const newest = firstRun ? [] : cat.filter((x) => seen[x.code] && HNOW - seen[x.code] <= 168).sort((a, b) => seen[b.code] - seen[a.code] || (known[b.code]?.now ?? -1) - (known[a.code]?.now ?? -1)).slice(0, 3000).map((x) => isl(x.code));
  await save("new.json", { t: iso(NOW), baseline: iso(state.baseline), count: newest.length, islands: newest });

  const copies = [];
  if (!firstRun) for (const [rid, m] of Object.entries(matches)) for (const [i, sc] of m.list) {
    const c = cat[i].code; if (sc < 0.6 || !seen[c] || HNOW - seen[c] > 14 * 24) continue;
    copies.push({ rid: Number(rid), code: c, title: cat[i].title, creator: cat[i].creator, score: sc, at: firstSeenISO(c), now: known[c]?.now ?? null });
  }
  copies.sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
  await save("copies.json", { t: iso(NOW), baseline: iso(state.baseline), copies: copies.slice(0, 2000) });

  const hk = Object.keys(T.h).sort();
  await save("total.json", { t: iso(NOW), h: { t0: hk[0] || null, step: HOUR, inMatch: hk.map((k) => T.h[k][0]), inClient: hk.map((k) => T.h[k][1]), ts: hk }, d: { dates: Object.keys(T.d).sort(), peak: Object.keys(T.d).sort().map((k) => T.d[k]) } });

  await writeFile(`${OUT}/catalog.txt`, cat.map((x) => `${x.code}\t${x.title.replace(/[\t\n\r]/g, " ")}\t${x.creator}`).join("\n"));
  // guarda tags só de quem aparece nas listas (o catálogo é rebaixado toda hora)
  const tags = {}; for (const c of new Set([...topCodes.slice(0, 3000), ...rbxByMatch.keys()])) { const t = byCode.get(c)?.tags; if (t?.length) tags[c] = t; }
  state.tags = tags;
  // limpa quem morreu há muito tempo
  for (const [c, k] of Object.entries(known)) if (!byCode.has(c) && catOk) delete known[c];
  state.known = known; state.info = Object.fromEntries(Object.entries(info).filter(([c]) => byCode.has(c) || !catOk));
  state.lastRun = { at: iso(NOW), catalog: cat.length, catOk, metrics: stats.metrics, queue: queue.length, calls: stats.calls, r429: stats.r429, fails: stats.fails };
  await save("state.json", state);
  await save("seen.json", seen);
  console.log("pronto:", JSON.stringify(state.lastRun));
}

main().catch((e) => { console.error(e); process.exit(1); });
