// Saint Data — coletor de hora em hora dos jogos do Roblox.
// Roda no GitHub Actions (Node 20+, sem dependências) e usa só endpoints públicos do Roblox.
//
// Lê o estado anterior de PREV (o ramo "dados" já baixado) e grava tudo em OUT:
//   games.json   top atual (até MAX_GAMES) com variações e mini-gráfico de 24h
//   total.json   soma dos jogadores: por hora (30 dias) e pico/média por dia (2 anos)
//   g/<id>.json  histórico de cada jogo: por hora (14 dias) e pico por dia (1 ano)
//   tracked.json jogos acompanhados entre execuções

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const PREV = process.env.PREV || "prev";
const OUT = process.env.OUT || "out";
const MAX_GAMES = Number(process.env.MAX_GAMES || 3000);
const TRACK_LIMIT = MAX_GAMES * 2;
const TRACK_DAYS = 14;
const GAME_HOURS = 24 * 14, TOTAL_HOURS = 24 * 30, GAME_DAYS = 365, TOTAL_DAYS = 730;
const COUNTRIES = ["all", "us", "br", "gb", "ca", "au", "de", "fr", "es", "it", "mx", "ph", "id", "jp", "kr", "tr", "pl", "nl", "ru", "th", "vn", "sa", "ar", "cl", "co", "in"];
const DEVICES = ["computer", "phone", "tablet", "console"];
const HOUR = 3600e3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const stats = { calls: 0, fails: 0 };

async function getJSON(url, tries = 5) {
  let wait = 1500;
  for (let i = 0; i < tries; i++) {
    stats.calls++;
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "SaintData/2.0 (+github actions)" } });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) { console.warn(`HTTP ${res.status} ${url.slice(0, 120)}`); stats.fails++; return null; }
    } catch (e) { console.warn(`rede: ${e.message} ${url.slice(0, 120)}`); }
    await sleep(process.env.FAST ? 0 : wait); wait *= 2;
  }
  stats.fails++;
  console.warn(`desisti: ${url.slice(0, 120)}`);
  return null;
}
async function readJSON(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; } }

// série por hora: { h0: ms da primeira hora, h: [valores] }
function putHour(s, hourMs, value, maxLen) {
  s = s && s.h0 != null ? { h0: s.h0, h: s.h.slice() } : { h0: hourMs, h: [] };
  let idx = Math.round((hourMs - s.h0) / HOUR);
  if (idx < 0) { s.h = Array(-idx).fill(null).concat(s.h); s.h0 = hourMs; idx = 0; }
  while (s.h.length <= idx) s.h.push(null);
  s.h[idx] = value;
  const extra = s.h.length - maxLen;
  if (extra > 0) { s.h = s.h.slice(extra); s.h0 += extra * HOUR; }
  return s;
}
const hourAgo = (s, hourMs, n) => { if (!s) return null; const i = Math.round((hourMs - n * HOUR - s.h0) / HOUR); return i >= 0 && i < s.h.length ? s.h[i] : null; };
const lastHours = (s, hourMs, n) => Array.from({ length: n }, (_, k) => hourAgo(s, hourMs, n - 1 - k));
// série por dia: { dates: [...], peak: [...] , avg?: [...], cnt?: [...] }
function putDay(d, date, value, maxLen, withAvg = false) {
  d = d ? { ...d, dates: d.dates.slice(), peak: d.peak.slice(), ...(withAvg ? { avg: (d.avg || []).slice(), cnt: (d.cnt || []).slice() } : {}) } : { dates: [], peak: [], ...(withAvg ? { avg: [], cnt: [] } : {}) };
  let i = d.dates.indexOf(date);
  if (i === -1) { d.dates.push(date); d.peak.push(value); if (withAvg) { d.avg.push(value); d.cnt.push(1); } i = -2; }
  else {
    d.peak[i] = Math.max(d.peak[i] ?? 0, value);
    if (withAvg) { const c = (d.cnt[i] || 0) + 1; d.avg[i] = ((d.avg[i] || 0) * (c - 1) + value) / c; d.cnt[i] = c; }
  }
  while (d.dates.length > maxLen) { d.dates.shift(); d.peak.shift(); if (withAvg) { d.avg.shift(); d.cnt.shift(); } }
  return d;
}

async function discover() {
  const found = new Map();
  for (const device of DEVICES) {
    for (const country of COUNTRIES) {
      const sid = randomUUID();
      const j = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=${device}&country=${country}`);
      for (const s of j?.sorts ?? []) {
        if (s.contentType !== "Games") continue;
        let games = s.games ?? [], token = s.nextPageToken, pages = 0;
        while (token && pages < 10) {
          const more = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sid}&sortId=${encodeURIComponent(s.sortId)}&pageToken=${encodeURIComponent(token)}&device=${device}&country=${country}`);
          if (!more?.games?.length) break;
          games = games.concat(more.games); token = more.nextPageToken; pages++;
        }
        for (const g of games) {
          if (!g.universeId) continue;
          const cur = found.get(g.universeId) ?? { sorts: new Set(), genre: g.genreL1 || "", maturity: g.contentMaturity || "" };
          cur.sorts.add(s.sortId);
          found.set(g.universeId, cur);
        }
      }
      await sleep(process.env.FAST ? 0 : 200);
    }
  }
  console.log(`descoberta: ${found.size} jogos únicos nas listas`);
  return found;
}

// Na primeira execução deste formato, aproveita o histórico diário antigo (data/ do ramo main).
async function migrateOld() {
  const old = await readJSON("data/series.json", null);
  const oldGames = await readJSON("data/games.json", null);
  if (!old || !oldGames) return null;
  const hourMs = Math.floor(new Date(oldGames.t).getTime() / HOUR) * HOUR;
  const games = {};
  for (const [id, arr] of Object.entries(old.games)) {
    let d = null;
    old.dates.forEach((date, i) => { if (arr[i] != null) d = putDay(d, date, arr[i], GAME_DAYS); });
    const last = arr[arr.length - 1];
    games[id] = { ...(last != null ? putHour(null, hourMs, last, GAME_HOURS) : { h0: hourMs, h: [] }), d };
  }
  let td = null;
  old.dates.forEach((date, i) => { if (old.total[i] != null) td = putDay(td, date, old.total[i], TOTAL_DAYS, true); });
  return { games, total: { ...putHour(null, hourMs, old.total[old.total.length - 1], TOTAL_HOURS), d: td }, tracked: await readJSON("data/tracked.json", {}) };
}

async function main() {
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date(); // NOW só para testes
  const hourMs = Math.floor(now.getTime() / HOUR) * HOUR;
  const today = new Date(now.getTime() - 3 * HOUR).toISOString().slice(0, 10); // dia no horário de Brasília
  const fresh = !existsSync(join(PREV, "games.json"));
  const mig = fresh ? await migrateOld() : null;
  if (mig) console.log("migrando histórico diário antigo");

  const tracked = mig?.tracked ?? (await readJSON(join(PREV, "tracked.json"), {}));
  const prevTotal = mig?.total ?? (await readJSON(join(PREV, "total.json"), null));
  const loadGame = async (id) => (mig ? mig.games[id] ?? null : await readJSON(join(PREV, "g", `${id}.json`), null));

  const found = await discover();
  for (const id of found.keys()) tracked[id] = today;
  const cutoff = new Date(now.getTime() - TRACK_DAYS * 864e5).toISOString().slice(0, 10);
  const ids = Object.keys(tracked).filter((id) => tracked[id] >= cutoff).map(Number);
  console.log(`acompanhando ${ids.length} jogos`);

  const details = new Map();
  for (const b of chunks(ids, 50)) {
    const j = await getJSON(`https://games.roblox.com/v1/games?universeIds=${b.join(",")}`);
    for (const g of j?.data ?? []) details.set(g.id, g);
    await sleep(process.env.FAST ? 0 : 120);
  }
  if (details.size < Math.min(200, ids.length * 0.5)) throw new Error(`poucos dados (${details.size} de ${ids.length}); mantendo a versão anterior`);

  const ranked = [...details.values()].sort((a, b) => (b.playing ?? 0) - (a.playing ?? 0));
  const keep = ranked.slice(0, MAX_GAMES);
  const keepIds = keep.map((g) => g.id);
  const trackKeep = new Set(ranked.slice(0, TRACK_LIMIT).map((g) => String(g.id)));
  for (const id of Object.keys(tracked)) if (!trackKeep.has(id) && !found.has(Number(id))) delete tracked[id];

  const votes = new Map(), icons = new Map(), thumbs = new Map();
  for (const b of chunks(keepIds, 100)) {
    const j = await getJSON(`https://games.roblox.com/v1/games/votes?universeIds=${b.join(",")}`);
    for (const v of j?.data ?? []) votes.set(v.id, v);
    const t = await getJSON(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${b.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Webp&isCircular=false`);
    for (const x of t?.data ?? []) if (x.imageUrl) icons.set(x.targetId, x.imageUrl);
    await sleep(process.env.FAST ? 0 : 120);
  }
  for (const b of chunks(keepIds, 50)) {
    const j = await getJSON(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${b.join(",")}&countPerUniverse=1&defaults=true&size=768x432&format=Webp&isCircular=false`);
    for (const t of j?.data ?? []) { const u = t.thumbnails?.[0]?.imageUrl; if (u) thumbs.set(t.universeId, u); }
    await sleep(process.env.FAST ? 0 : 120);
  }

  await mkdir(join(OUT, "g"), { recursive: true });
  const pct = (cur, old) => (old && old > 0 ? cur / old - 1 : null);
  const games = [];
  for (const g of keep) {
    const playing = g.playing ?? 0;
    const prev = await loadGame(g.id);
    const hs = putHour(prev, hourMs, playing, GAME_HOURS);
    const ds = putDay(prev?.d, today, playing, GAME_DAYS);
    await writeFile(join(OUT, "g", `${g.id}.json`), JSON.stringify({ h0: hs.h0, h: hs.h, d: ds }));
    let pk = -1, pd = null; ds.dates.forEach((d, i) => { if (ds.peak[i] > pk) { pk = ds.peak[i]; pd = d; } });
    const v = votes.get(g.id), meta = found.get(g.id);
    games.push({
      id: g.id, place: g.rootPlaceId, name: g.name,
      creator: g.creator?.name ?? "", creatorType: g.creator?.type ?? "", verified: !!g.creator?.hasVerifiedBadge,
      playing, visits: g.visits ?? 0, fav: g.favoritedCount ?? 0, up: v?.upVotes ?? 0, down: v?.downVotes ?? 0,
      genre: g.genre_l1 || meta?.genre || g.genre || "", genre2: g.genre_l2 || "", maxPlayers: g.maxPlayers ?? null,
      created: g.created, updated: g.updated, maturity: meta?.maturity ?? "",
      desc: Array.from(g.description ?? "").slice(0, 300).join(""),
      icon: icons.get(g.id) ?? null, thumb: thumbs.get(g.id) ?? null, lists: meta ? [...meta.sorts] : [],
      d1h: pct(playing, hourAgo(prev, hourMs, 1)),
      d1: pct(playing, hourAgo(prev, hourMs, 24)) ?? pct(playing, ds.dates.length > 1 ? ds.peak[ds.dates.length - 2] : null),
      d7: pct(playing, hourAgo(prev, hourMs, 168)) ?? pct(playing, ds.dates.length > 7 ? ds.peak[ds.dates.length - 8] : null),
      high24: Math.max(playing, ...lastHours(hs, hourMs, 24).filter((x) => x != null)),
      peak: pk, peakDate: pd, days: ds.dates.length,
      spark: lastHours(hs, hourMs, 24),
    });
  }

  // jogos que saíram do top: mantém os arquivos antigos (se voltarem, o histórico continua)
  if (!fresh && existsSync(join(PREV, "g"))) {
    const keepSet = new Set(keepIds.map(String));
    for (const f of await readdir(join(PREV, "g"))) {
      const id = f.replace(".json", "");
      if (!keepSet.has(id) && tracked[id]) await writeFile(join(OUT, "g", f), await readFile(join(PREV, "g", f)));
    }
  }

  const total = games.reduce((a, g) => a + g.playing, 0);
  const th = putHour(prevTotal, hourMs, total, TOTAL_HOURS);
  const td = putDay(prevTotal?.d, today, total, TOTAL_DAYS, true);
  await writeFile(join(OUT, "total.json"), JSON.stringify({ h0: th.h0, h: th.h, d: td }));
  await writeFile(join(OUT, "games.json"), JSON.stringify({ t: now.toISOString(), hour: hourMs, count: games.length, total, games }));
  await writeFile(join(OUT, "tracked.json"), JSON.stringify(tracked));
  console.log(`ok: ${games.length} jogos, ${total.toLocaleString("pt-BR")} jogando, ${stats.calls} chamadas, ${stats.fails} falhas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
