# Saint Data

Painel dos jogos do Roblox (3000 jogos, coleta a cada 10 minutos) com um Minerador que compara cada jogo com os mapas do Fortnite que têm o mesmo nome.

## Como funciona

- `scripts/collect.mjs` busca dados públicos do Roblox (listas da página Charts em vários países e dispositivos, detalhes, votos, ícones e capas) e mantém os 3000 jogos com mais jogadores.
- `.github/workflows/coleta.yml` roda a coleta **toda hora, aos 7 minutos**, e grava o resultado no ramo `dados`, substituindo a versão anterior (o repo não incha). Dá para rodar na hora em **Actions → Coleta de hora em hora → Run workflow**.
- O site (`index.html` + `assets/`) fica no ramo `main`, é publicado pela Cloudflare Pages e lê os dados direto do ramo `dados` pelo `raw.githubusercontent.com`. O Cloudflare Access limita o acesso ao seu e-mail.

## Arquivos no ramo `dados`

- `games.json`: o top atual, com variações de 1h, 24h e 7 dias e mini-gráfico de 24h.
- `total.json`: soma dos jogadores, por hora (30 dias) e pico/média por dia (2 anos).
- `g/<id>.json`: histórico de cada jogo, por hora (14 dias) e pico por dia (1 ano).
- `tracked.json`: jogos acompanhados entre execuções.

## Fortnite (Minerador)

- `scripts/fortnite.mjs` usa a API pública da Epic (`https://api.fortnite.com/ecosystem/v1`, sem login): catálogo completo de mapas, rankings por gênero e métricas por mapa.
- `.github/workflows/fortnite.yml` roda de hora em hora (disparado pelo Worker nos primeiros 10 minutos de cada hora) e grava no ramo `dados-fn`: `top.json`, `match.json` (jogo do Roblox → mapas com o mesmo nome), `tokens.json`, `new.json`, `copies.json`, `total.json` e `catalog.txt`.
