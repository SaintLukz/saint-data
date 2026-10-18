// Saint Data — coletor diário de jogos do Roblox.
// Roda no GitHub Actions (Node 20+, sem dependências).
// Usa só endpoints públicos do Roblox e grava JSON em /data.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DATA = new URL("../data/", import.meta.url);
const MAX_GAMES = 1000;      // jogos publicados no site
const TRACK_LIMIT = 2000;    // jogos acompanhados entre execuções
const TRACK_DAYS = 21;       // some da lista quem não aparece há N dias
const SERIES_DAYS = 180;     // histórico diário guardado

const COUNTRIES = ["all", "us", "br", "gb", "ca", "au", "de", "fr", "es", "it", "mx", "ph", "id", "jp", "kr", "tr", "pl", "nl", "ru", "th", "vn", "sa", "ar", "cl", "co", "in"];
const DEVICES = ["computer", "phone", "tablet", "console"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 5) {
  let wait = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "SaintData/1.0 (+github actions)" } });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) {
        console.warn(`HTTP ${res.status} ${url}`);
        return null;
      }
    } catch (e) {
      console.warn(`erro de rede ${url}: ${e.message}`);
    }
    await sleep(wait);
    wait *= 2;
  }
  console.warn(`desisti: ${url}`);
  return null;
}

async function readJSON(name, fallback) {
  try {
    return JSON.parse(await readFile(new URL(name, DATA), "utf8"));
  } catch {
    return fallback;
  }
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// 1. Descobrir jogos nas listas públicas da página Charts, por país e dispositivo.
async function discover() {
  const found = new Map(); // id -> { sorts:Set, genre }
  for (const device of DEVICES) {
    for (const country of COUNTRIES) {
      const sid = randomUUID();
      const j = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sorts?sessionId=${sid}&device=${device}&country=${country}`);
      for (const s of j?.sorts ?? []) {
        if (s.contentType !== "Games") continue;
        let games = s.games ?? [];
        let token = s.nextPageToken;
        let pages = 0;
        while (token && pages < 10) {
          const more = await getJSON(`https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sid}&sortId=${encodeURIComponent(s.sortId)}&pageToken=${encodeURIComponent(token)}&device=${device}&country=${country}`);
          if (!more?.games?.length) break;
          games = games.concat(more.games);
          token = more.nextPageToken;
          pages++;
        }
        for (const g of games) {
          if (!g.universeId) continue;
          const cur = found.get(g.universeId) ?? { sorts: new Set(), genre: g.genreL1 || "", maturity: g.contentMaturity || "" };
          cur.sorts.add(s.sortId);
          found.set(g.universeId, cur);
        }
      }
      await sleep(250);
    }
    console.log(`descoberta ${device}: ${found.size} jogos únicos`);
  }
  return found;
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const prev = await readJSON("games.json", { games: [] });
  const tracked = await readJSON("tracked.json", {}); // id -> lastSeen (YYYY-MM-DD)
  const series = await readJSON("series.json", { dates: [], total: [], games: {} });

  const found = await discover();
  for (const id of found.keys()) tracked[id] = today;

  const cutoff = new Date(now.getTime() - TRACK_DAYS * 864e5).toISOString().slice(0, 10);
  const ids = Object.keys(tracked).filter((id) => tracked[id] >= cutoff).map(Number);
  console.log(`acompanhando ${ids.length} jogos`);

  // 2. Detalhes (jogadores, visitas, estúdio, datas, gênero).
  const details = new Map();
  for (const b of chunks(ids, 50)) {
    const j = await getJSON(`https://games.roblox.com/v1/games?universeIds=${b.join(",")}`);
    for (const g of j?.data ?? []) details.set(g.id, g);
    await sleep(150);
  }
  if (details.size < 50) throw new Error(`poucos dados recebidos (${details.size}); mantendo arquivos anteriores`);

  // 3. Ranking: top N por jogadores agora.
  const ranked = [...details.values()].sort((a, b) => (b.playing ?? 0) - (a.playing ?? 0));
  const keep = ranked.slice(0, MAX_GAMES);
  const keepIds = keep.map((g) => g.id);

  // limpa a lista acompanhada para não crescer sem limite
  const trackKeep = new Set(ranked.slice(0, TRACK_LIMIT).map((g) => String(g.id)));
  for (const id of Object.keys(tracked)) if (!trackKeep.has(id) && !found.has(Number(id))) delete tracked[id];

  // 4. Votos, favoritos e ícones dos jogos publicados.
  const votes = new Map();
  for (const b of chunks(keepIds, 100)) {
    const j = await getJSON(`https://games.roblox.com/v1/games/votes?universeIds=${b.join(",")}`);
    for (const v of j?.data ?? []) votes.set(v.id, v);
    await sleep(150);
  }
  const icons = new Map();
  for (const b of chunks(keepIds, 100)) {
    const j = await getJSON(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${b.join(",")}&returnPolicy=PlaceHolder&size=150x150&format=Webp&isCircular=false`);
    for (const t of j?.data ?? []) if (t.imageUrl) icons.set(t.targetId, t.imageUrl);
    await sleep(150);
  }

  // 5. Histórico diário (um ponto por dia; se rodar de novo no mesmo dia, substitui).
  let di = series.dates.indexOf(today);
  if (di === -1) {
    series.dates.push(today);
    series.total.push(0);
    di = series.dates.length - 1;
    for (const id of Object.keys(series.games)) series.games[id].push(null);
  }
  const prevIdx = di - 1;
  const weekIdx = series.dates.findIndex((d) => d >= new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10));

  const pct = (cur, old) => (old && old > 0 ? cur / old - 1 : null);
  const games = keep.map((g) => {
    const s = (series.games[g.id] ??= new Array(series.dates.length).fill(null));
    s[di] = g.playing ?? 0;
    const v = votes.get(g.id);
    const meta = found.get(g.id);
    return {
      id: g.id,
      place: g.rootPlaceId,
      name: g.name,
      creator: g.creator?.name ?? "",
      creatorId: g.creator?.id ?? null,
      creatorType: g.creator?.type ?? "",
      verified: !!g.creator?.hasVerifiedBadge,
      playing: g.playing ?? 0,
      visits: g.visits ?? 0,
      fav: g.favoritedCount ?? 0,
      up: v?.upVotes ?? 0,
      down: v?.downVotes ?? 0,
      genre: g.genre_l1 || meta?.genre || g.genre || "",
      genre2: g.genre_l2 || "",
      maxPlayers: g.maxPlayers ?? null,
      created: g.created,
      updated: g.updated,
      maturity: meta?.maturity ?? "",
      desc: (g.description ?? "").slice(0, 400),
      icon: icons.get(g.id) ?? null,
      lists: meta ? [...meta.sorts] : [],
      d1: prevIdx >= 0 ? pct(g.playing, s[prevIdx]) : null,
      d7: weekIdx >= 0 && weekIdx < di ? pct(g.playing, s[weekIdx]) : null,
    };
  });

  const total = games.reduce((a, g) => a + g.playing, 0);
  series.total[di] = total;

  // corta histórico antigo e jogos sem nenhum ponto recente
  while (series.dates.length > SERIES_DAYS) {
    series.dates.shift();
    series.total.shift();
    for (const id of Object.keys(series.games)) series.games[id].shift();
  }
  const keepSet = new Set(keepIds.map(String));
  for (const id of Object.keys(series.games)) {
    if (!keepSet.has(id) && series.games[id].every((x) => x === null)) delete series.games[id];
  }

  await mkdir(DATA, { recursive: true });
  await writeFile(new URL("games.json", DATA), JSON.stringify({ t: now.toISOString(), count: games.length, total, games }));
  await writeFile(new URL("series.json", DATA), JSON.stringify(series));
  await writeFile(new URL("tracked.json", DATA), JSON.stringify(tracked));
  console.log(`ok: ${games.length} jogos, ${total.toLocaleString("pt-BR")} jogando, ${series.dates.length} dias de histórico`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
