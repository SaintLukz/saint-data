# Saint Data

Painel dos jogos do Roblox: jogadores, tendências, estúdios e gêneros, com até 1000 jogos e histórico diário.

## Como funciona

- `scripts/collect.mjs` busca dados públicos do Roblox (listas da página Charts em vários países e dispositivos, detalhes, votos e ícones) e grava em `data/`.
- `.github/workflows/coleta.yml` roda a coleta todo dia às 17:07 (Brasília) e faz commit dos dados. Dá para rodar na hora em **Actions → Coleta diária → Run workflow**.
- O site é estático (`index.html` + `assets/`). A Cloudflare Pages publica a cada push, e o Cloudflare Access limita o acesso ao seu e-mail.

## Arquivos de dados

- `data/games.json`: o top atual (até 1000 jogos).
- `data/series.json`: jogadores por dia de cada jogo e o total (até 180 dias).
- `data/tracked.json`: jogos acompanhados entre execuções, para a lista crescer até 1000.

## Rodar localmente

```bash
node scripts/collect.mjs     # opcional: atualiza data/
npx serve .                  # abre o site em http://localhost:3000
```
