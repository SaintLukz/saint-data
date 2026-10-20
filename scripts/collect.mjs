// Saint Data — coletor dos jogos do Roblox (roda a cada 10 minutos no GitHub Actions, sem dependências).
// Usa só endpoints públicos do Roblox. Lê o estado anterior de PREV (ramo "dados") e grava tudo em OUT.
//
// Execução RÁPIDA (toda vez): atualiza jogadores, visitas e favoritos dos jogos do top.
// Execução COMPLETA (a cada ~1h): descobre jogos novos, ranking do Roblox, votos, ícones, fotos.
// Execução DIÁRIA: game passes e badges dos 300 maiores.
//
// Arquivos:
//   games.json    top atual com variações, mini-gráfico de 24h e metadados
//   total.json    soma do top: de 10 em 10 min (7 dias), por hora (90 dias), por dia (2 anos) + métricas extras
//   l/<n>.json    32 fatias com a série de 10 em 10 min (25h) de cada jogo (n = id % 32)
//   g/<id>.json   histórico por hora (14 dias), visitas por hora, pico/média por dia (1 ano), descrição, fotos, passes, badges
//   state.json, tracked.json  controle interno do coletor

import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PREV = process.env.PREV || "prev";
const OUT = process.env.OUT || "out";
const FAST = !!process.env.FAST; // só para testes locais (sem pausas)
const MAX_GAMES = Number(process.env.MAX_GAMES || 3000);
const TRACK_LIMIT = MAX_GAMES * 2, TRACK_DAYS = 14, EXTRA_TOP = 300, SHARDS = 32;
const MIN = 60e3, STEP = 10 * MIN, HOUR = 60 * MIN, DAY = 24 * HOUR;
const FINE_SLOTS = 150, TOTAL_FINE = 7 * 144 + 6, GAME_HOURS = 24 * 14, TOTAL_HOURS = 24 * 90, VIS_HOURS = 50, GAME_DAYS = 365, TOTAL_DAYS = 730;
const COUNTRIES = ["all", "us", "br", "gb", "ca", "au", "de", "fr", "es", "it", "mx", "ph", "id", "jp", "kr", "tr", "pl", "nl", "ru", "th", "vn", "sa", "ar", "cl", "co", "in"];
const DEVICES = ["computer", "phone", "tablet", "console"];
const EXTRA_SORTS = ["top-earning", "top-rated", "top-paid-access"];
const SEED_WORDS = ["simulator", "tycoon", "obby", "tower defense", "anime", "rpg", "horror", "roleplay", "brainrot", "steal", "egg", "pets", "fish", "farm", "battle", "survive", "escape", "race", "parkour", "fighting", "sword", "gun", "zombie", "mining", "clicker", "idle", "story", "hide and seek", "dress", "cafe", "restaurant", "hotel", "school", "prison", "police", "army", "war", "pvp", "grow", "garden", "basketball", "soccer", "football", "car", "driving", "plane", "boat", "dragon", "ninja", "pirate", "magic", "tag", "murder", "mystery", "doors", "backrooms", "piggy", "rainbow", "lifting", "strongman", "speed", "jump", "rng", "aura", "gacha", "cards", "trading", "admin", "+1", "every second", "difficulty chart", "skibidi", "hunt", "forest", "nights", "evade", "blox", "life", "city", "island", "dance", "music", "ugc", "avatar", "brookhaven", "adopt", "bee", "cat", "dog", "slime", "ball", "golf", "boxing", "jujutsu", "one piece", "demon", "titan", "hero", "space", "rocket", "robot", "mech", "build", "base", "defense", "merge", "lucky block", "spin", "wheel", "rebirth", "keyboard", "candy", "chocolate", "makeup", "fashion", "runway", "bus", "train", "truck"];

const sleep = (ms) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const stats = { calls: 0, fails: 0, retries: 0 };
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
async function getJSON(url, tries = 4) {
  let wait = 2000;
  for (let i = 0; i < tries; i++) {
    stats.calls++;
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "SaintData/3.0 (+github actions)" } });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) { stats.fails++; return null; }
    } catch {}
    stats.retries++;
    await sleep(wait); wait *= 2;
  }
  stats.fails++;
  return null;
}
async function readJSON(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } }
const pct = (cur, old) => (old != null && old > 0 && cur != null ? cur / old - 1 : null);
const days = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / DAY : Infinity);

// ---------- séries { t0, v } com passo fixo ----------
function put(s, t, value, maxLen, step) {
  s = s && s.t0 != null ? { t0: s.t0, v: s.v.slice() } : { t0: t, v: [] };
  let i = Math.round((t - s.t0) / step);
  if (i < 0) { s.v = Array(-i).fill(null).concat(s.v); s.t0 = t; i = 0; }
  while (s.v.length <= i) s.v.push(null);
  s.v[i] = value;
  const extra = s.v.length - maxLen;
  if (extra > 0) { s.v = s.v.slice(extra); s.t0 += extra * step; }
  return s;
}
function near(s, t, tol, step) {
  if (!s || s.t0 == null) return null;
  const c = Math.round((t - s.t0) / step), k = Math.round(tol / step);
  for (let d = 0; d <= k; d++) for (const j of d ? [c - d, c + d] : [c]) if (j >= 0 && j < s.v.length && s.v[j] != null) return s.v[j];
  return null;
}
const since = (s, t, step) => (s && s.t0 != null ? s.v.filter((x, i) => x != null && s.t0 + i * step >= t) : []);
function putDay(d, date, value, maxLen, avg) {
  d = d ? { dates: d.dates.slice(), peak: d.peak.slice(), avg: (d.avg || []).slice(), cnt: (d.cnt || []).slice() } : { dates: [], peak: [], avg: [], cnt: [] };
  let i = d.dates.indexOf(date);
  if (i === -1) { d.dates.push(date); d.peak.push(value); d.avg.push(avg ?? value); d.cnt.push(1); }
  else {
    d.peak[i] = Math.max(d.peak[i] ?? 0, value);
    const c = (d.cnt[i] || 0) + 1; d.avg[i] = ((d.avg[i] ?? 0) * (c - 1) + (avg ?? value)) / c; d.cnt[i] = c;
  }
  while (d.dates.length > maxLen) for (const k of ["dates", "peak", "avg", "cnt"]) d[k].shift();
  return d;
}
// formato antigo { h0, h } -> { t0, v }
const oldH = (o) => (o && o.h0 != null ? { t0: o.h0, v: o.h } : null);

// ---------- descoberta ----------
async function discover(state) {
  const found = new Map(), ranks = {};
  const add = (g, sortId) => {
    if (!g.universeId) return;
    const cur = found.get(g.universeId) ?? { sorts: new Set(), genre: g.genreL1 || "", maturity: g.contentMaturity || "" };
    cur.sorts.add(sortId); found.set(g.universeId, cur);
  };
  const pairs = DEVICES.flatMap((d) => COUNTRIES.map((c) => [d, c])).filter(([d, c]) => !(d === "computer" && c === "all"));
  const per = Math.ceil(pairs.length / 4), start = ((state.cursor ?? 0) * per) % pairs.length;
  const batch = [["computer", "all"], ...pairs.slice(start, start + per)];
  state.cursor = ((state.cursor ?? 0) + 1) % 4;
  await pool(batch, 4, async ([device, country]) => {
    const sid = randomUUID();
    const j = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=${device}&country=${country}`);
    for (const s of j?.sorts ?? []) {
      if (s.contentType !== "Games") continue;
      (s.games ?? []).forEach((g) => add(g, s.sortId));
      if (device === "computer" && country === "all") ranks[s.sortId] = (s.games ?? []).map((g) => g.universeId);
    }
  });
  await pool(EXTRA_SORTS, 3, async (sortId) => {
    const j = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${randomUUID()}&sortId=${sortId}&device=computer&country=all`);
    (j?.games ?? []).forEach((g) => add(g, sortId));
    if (j?.games?.length) ranks[sortId] = j.games.map((g) => g.universeId);
  });
  // busca: um lote diferente de palavras a cada execução completa
  const words = [...new Set(SEED_WORDS)], n = 24, ws = ((state.wordCursor ?? 0) * n) % words.length;
  state.wordCursor = (state.wordCursor ?? 0) + 1;
  const searched = new Set();
  await pool(Array.from({ length: n }, (_, i) => words[(ws + i) % words.length]), 4, async (q) => {
    const sid = randomUUID(); let token = "", pages = 0;
    do {
      const j = await getJSON(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&sessionId=${sid}&pageType=all${token ? "&pageToken=" + encodeURIComponent(token) : ""}`, 2);
      if (!j) break;
      for (const grp of j.searchResults ?? []) for (const c of grp.contents ?? []) if (c.universeId && (c.playerCount ?? 1) > 0) searched.add(Number(c.universeId));
      token = j.nextPageToken || ""; pages++;
    } while (token && pages < 6);
  });
  console.log(`descoberta: ${found.size} nas listas (${batch.length} países/dispositivos), ${searched.size} pela busca`);
  return { found, ranks, searched };
}

async function main() {
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const T = now.getTime();
  const slot = Math.floor(T / STEP) * STEP, hour = Math.floor(T / HOUR) * HOUR;
  const today = new Date(T - 3 * HOUR).toISOString().slice(0, 10); // dia no horário de Brasília
  const dayStart = new Date(today + "T03:00:00Z").getTime();

  const prevGames = await readJSON(join(PREV, "games.json"), { games: [] });
  const prevMeta = new Map(prevGames.games.map((g) => [g.id, g]));
  const state = await readJSON(join(PREV, "state.json"), {});
  const tracked = await readJSON(join(PREV, "tracked.json"), {});
  let total = await readJSON(join(PREV, "total.json"), null);
  if (total && total.h0 != null) total = { h: { total: oldH(total) }, d: total.d, f: {} }; // formato antigo
  total ??= { f: {}, h: {}, d: null };
  const shards = new Map();
  for (let k = 0; k < SHARDS; k++) { const s = await readJSON(join(PREV, "l", `${k}.json`), null); for (const [id, v] of Object.entries(s?.games ?? {})) shards.set(Number(id), v); }

  const full = process.env.MODE === "full" || !state.lastFull || T - state.lastFull >= 55 * MIN || prevGames.games.length === 0;
  const daily = full && (!state.lastDaily || T - state.lastDaily >= 23 * HOUR);
  console.log(`execução ${full ? "COMPLETA" : "rápida"}${daily ? " + diária" : ""}`);

  // 1. quais jogos consultar
  let disc = null, ids;
  if (full) {
    disc = await discover(state);
    for (const id of disc.found.keys()) tracked[id] = today;
    for (const id of disc.searched) tracked[id] ??= today;
    const cutoff = new Date(T - TRACK_DAYS * DAY).toISOString().slice(0, 10);
    ids = Object.keys(tracked).filter((id) => tracked[id] >= cutoff).map(Number);
  } else ids = prevGames.games.map((g) => g.id);

  // 2. jogadores, visitas, favoritos, datas
  const details = new Map();
  await pool(chunks(ids, 50), 4, async (b) => { const j = await getJSON(`https://games.roblox.com/v1/games?universeIds=${b.join(",")}`); for (const g of j?.data ?? []) details.set(g.id, g); });
  if (details.size < Math.min(200, ids.length * 0.6)) throw new Error(`poucos dados (${details.size} de ${ids.length}); mantendo a versão anterior`);
  const ranked = [...details.values()].filter((g) => (g.playing ?? 0) > 0).sort((a, b) => b.playing - a.playing);
  const keep = ranked.slice(0, MAX_GAMES), keepIds = keep.map((g) => g.id);
  if (full) {
    const trackKeep = new Set(ranked.slice(0, TRACK_LIMIT).map((g) => String(g.id)));
    for (const id of Object.keys(tracked)) if (!trackKeep.has(id) && !disc.found.has(Number(id))) delete tracked[id];
  }

  // 3. metadados (só na completa; na rápida reaproveita)
  const votes = new Map(), icons = new Map(), thumbs = new Map();
  if (full) {
    await pool(chunks(keepIds, 100), 4, async (b) => {
      const j = await getJSON(`https://games.roblox.com/v1/games/votes?universeIds=${b.join(",")}`);
      for (const v of j?.data ?? []) votes.set(v.id, v);
    });
    const refreshIcons = !state.lastIcons || T - state.lastIcons > 6 * HOUR;
    const needIcon = keepIds.filter((id) => refreshIcons || !prevMeta.get(id)?.icon);
    await pool(chunks(needIcon, 100), 4, async (b) => {
      const t = await getJSON(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${b.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Webp&isCircular=false`);
      for (const x of t?.data ?? []) if (x.imageUrl) icons.set(x.targetId, x.imageUrl);
    });
    if (refreshIcons) state.lastIcons = T;
    const refreshThumbs = !state.lastThumbs || T - state.lastThumbs > 12 * HOUR;
    const needThumb = keepIds.filter((id) => refreshThumbs || !prevMeta.get(id)?.thumbs?.length);
    await pool(chunks(needThumb, 25), 4, async (b) => {
      const j = await getJSON(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${b.join(",")}&countPerUniverse=3&defaults=true&size=768x432&format=Webp&isCircular=false`);
      for (const t of j?.data ?? []) thumbs.set(t.universeId, (t.thumbnails ?? []).map((x) => x.imageUrl).filter(Boolean));
    });
    if (refreshThumbs) state.lastThumbs = T;
  }

  // 4. séries e métricas por jogo
  await mkdir(join(OUT, "g"), { recursive: true });
  await mkdir(join(OUT, "l"), { recursive: true });
  if (existsSync(join(PREV, "g"))) await cp(join(PREV, "g"), join(OUT, "g"), { recursive: true }); // jogos fora do top mantêm o histórico
  const outShards = Array.from({ length: SHARDS }, () => ({}));
  const rankOf = (sortId, id) => { const a = disc?.ranks?.[sortId]; if (!a) return null; const i = a.indexOf(id); return i < 0 ? null : i + 1; };
  const extrasFor = new Set(daily ? keepIds.slice(0, EXTRA_TOP) : keepIds.slice(0, EXTRA_TOP).filter((id) => !prevMeta.get(id)?.hasExtras));
  const games = [];
  for (const g of keep) {
    const id = g.id, playing = g.playing ?? 0, visits = g.visits ?? 0, pm = prevMeta.get(id);
    const fine = put(shards.get(id), slot, playing, FINE_SLOTS, STEP);
    outShards[id % SHARDS][id] = fine;
    let gf = await readJSON(join(PREV, "g", `${id}.json`), {});
    if (gf.h0 != null) gf = { h: oldH(gf), d: gf.d }; // formato antigo
    if (full) {
      const today24 = since(fine, Math.max(dayStart, T - HOUR - STEP), STEP);
      const hourAvg = today24.length ? today24.reduce((a, b) => a + b, 0) / today24.length : playing;
      gf.h = put(gf.h, hour, playing, GAME_HOURS, HOUR);
      gf.vh = put(gf.vh, hour, visits, VIS_HOURS, HOUR);
      gf.d = putDay(gf.d, today, Math.max(playing, ...today24), GAME_DAYS, hourAvg);
      gf.desc = Array.from(g.description ?? "").slice(0, 1000).join("");
      if (thumbs.has(id)) gf.thumbs = thumbs.get(id);
    }
    const last24 = since(fine, T - DAY, STEP);
    const avg24 = last24.length ? last24.reduce((a, b) => a + b, 0) / last24.length : playing;
    const vAgo = near(gf.vh, hour - DAY, 2 * HOUR, HOUR);
    const dailyVisits = vAgo != null && visits >= vAgo ? visits - vAgo : pm?.dailyVisits ?? null;
    const pk = Math.max(pm?.peak ?? 0, playing, ...(gf.d?.peak ?? []));
    const peakDate = pk === playing && playing > (pm?.peak ?? 0) ? today : pm?.peakDate ?? (gf.d ? gf.d.dates[gf.d.peak.indexOf(pk)] : today) ?? today;
    const sp = Array.from({ length: 48 }, (_, k) => near(fine, slot - (47 - k) * 3 * STEP, STEP, STEP));
    const v = votes.get(id), meta = disc?.found.get(id);
    const lists = full ? Object.fromEntries(Object.keys(disc.ranks).map((s) => [s, rankOf(s, id)]).filter(([, r]) => r)) : pm?.lists ?? {};
    games.push({
      id, place: g.rootPlaceId, name: g.name,
      creator: g.creator?.name ?? "", creatorId: g.creator?.id ?? null, creatorType: g.creator?.type ?? "", verified: !!g.creator?.hasVerifiedBadge,
      playing, visits, fav: g.favoritedCount ?? 0,
      up: v?.upVotes ?? pm?.up ?? 0, down: v?.downVotes ?? pm?.down ?? 0,
      genre: g.genre_l1 || meta?.genre || pm?.genre || g.genre || "", genre2: g.genre_l2 || "",
      maxPlayers: g.maxPlayers ?? null, created: g.created, updated: g.updated, maturity: meta?.maturity ?? pm?.maturity ?? "",
      blurb: Array.from((g.description ?? "").split("\n").find((l) => l.trim()) ?? "").slice(0, 120).join(""),
      icon: icons.get(id) ?? pm?.icon ?? null, thumbs: thumbs.get(id) ?? pm?.thumbs ?? [],
      lists, listsPrev: full ? pm?.lists ?? {} : pm?.listsPrev ?? {},
      listPeak: Object.fromEntries(Object.entries(lists).map(([s, r]) => [s, Math.min(r, pm?.listPeak?.[s] ?? r)])),
      d10: pct(playing, near(fine, slot - STEP, 0, STEP)),
      d1h: pct(playing, near(fine, slot - HOUR, STEP, STEP)),
      d1: pct(playing, near(fine, slot - DAY, 3 * STEP, STEP) ?? near(gf.h, hour - DAY, 2 * HOUR, HOUR)),
      d7: pct(playing, near(gf.h, hour - 7 * DAY, 3 * HOUR, HOUR)),
      high24: Math.max(playing, ...last24), avg24: Math.round(avg24), peak: pk, peakDate,
      dailyVisits, avgVisitMin: dailyVisits > 0 ? Math.round((avg24 * 1440) / dailyVisits) : pm?.avgVisitMin ?? null,
      hasExtras: pm?.hasExtras || false, spark: sp,
    });
    if (full) await writeFile(join(OUT, "g", `${id}.json`), JSON.stringify(gf));
  }

  // 5. diária: game passes e badges dos maiores
  if (extrasFor.size) {
    let n = 0;
    await pool([...extrasFor], 4, async (id) => {
      const [p, b] = await Promise.all([
        getJSON(`https://apis.roblox.com/game-passes/v1/universes/${id}/game-passes?passView=Full&pageSize=50`, 2),
        getJSON(`https://badges.roblox.com/v1/universes/${id}/badges?limit=25&sortOrder=Asc`, 2),
      ]);
      if (!p && !b) return;
      const passes = (p?.gamePasses ?? []).filter((x) => x.isForSale && x.price != null).map((x) => ({ id: x.id, name: x.displayName || x.name, price: x.price, icon: null }));
      const badges = (b?.data ?? []).filter((x) => x.enabled).map((x) => ({ id: x.id, name: x.displayName || x.name, desc: x.displayDescription || x.description || "", awarded: x.statistics?.awardedCount ?? 0, pastDay: x.statistics?.pastDayAwardedCount ?? 0, winRate: x.statistics?.winRatePercentage ?? null, icon: null }));
      const pIcons = passes.length ? await getJSON(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${passes.map((x) => x.id).join(",")}&size=150x150&format=Webp&isCircular=false`, 2) : null;
      const bIcons = badges.length ? await getJSON(`https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${badges.map((x) => x.id).join(",")}&size=150x150&format=Webp&isCircular=false`, 2) : null;
      const pi = new Map((pIcons?.data ?? []).map((x) => [x.targetId, x.imageUrl])), bi = new Map((bIcons?.data ?? []).map((x) => [x.targetId, x.imageUrl]));
      passes.forEach((x) => (x.icon = pi.get(x.id) ?? null)); badges.forEach((x) => (x.icon = bi.get(x.id) ?? null));
      const path = join(OUT, "g", `${id}.json`);
      const gf = await readJSON(path, {});
      gf.passes = passes; gf.badges = badges; gf.extrasAt = T;
      await writeFile(path, JSON.stringify(gf));
      const gm = games.find((x) => x.id === id); if (gm) gm.hasExtras = true;
      n++;
    });
    if (daily) state.lastDaily = T;
    console.log(`extras (passes/badges): ${n} jogos`);
  }

  // 6. totais e métricas do top
  const sum = games.reduce((a, g) => a + g.playing, 0);
  const top10 = games.slice(0, 10).reduce((a, g) => a + g.playing, 0);
  const newg = games.filter((g) => days(g.created) <= 30).reduce((a, g) => a + g.playing, 0);
  const over1k = games.filter((g) => g.playing >= 1000).length;
  total.f ??= {}; total.h ??= {};
  for (const [k, v] of Object.entries({ total: sum, top10, newg, over1k })) total.f[k] = put(total.f[k], slot, v, TOTAL_FINE, STEP);
  total.f.step = STEP;
  total.h.total = put(total.h.total, hour, Math.max(sum, near(total.h.total, hour, 0, HOUR) ?? 0), TOTAL_HOURS, HOUR);
  total.d = putDay(total.d, today, sum, TOTAL_DAYS, sum);

  for (let k = 0; k < SHARDS; k++) await writeFile(join(OUT, "l", `${k}.json`), JSON.stringify({ step: STEP, games: outShards[k] }));
  await writeFile(join(OUT, "total.json"), JSON.stringify(total));
  await writeFile(join(OUT, "games.json"), JSON.stringify({ t: now.toISOString(), slot, full: full ? T : state.lastFull, count: games.length, total: sum, games }));
  if (full) state.lastFull = T;
  await writeFile(join(OUT, "state.json"), JSON.stringify(state));
  await writeFile(join(OUT, "tracked.json"), JSON.stringify(tracked));
  console.log(`ok: ${games.length} jogos, ${sum.toLocaleString("pt-BR")} jogando · ${stats.calls} chamadas, ${stats.retries} novas tentativas, ${stats.fails} falhas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
