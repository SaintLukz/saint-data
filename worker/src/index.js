// Saint Data — agendador. A cada 10 minutos pede ao GitHub para rodar o workflow de coleta.
async function dispatch(env) {
  if (!env.GH_TOKEN) {
    console.log("GH_TOKEN não configurado: cadastre o segredo em Settings → Variables and Secrets.");
    return { ok: false, status: 0, text: "sem GH_TOKEN" };
  }
  const res = await fetch(`https://api.github.com/repos/${env.REPO}/actions/workflows/${env.WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "saint-data-agendador",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  const text = res.ok ? "" : await res.text();
  console.log(res.ok ? "coleta disparada" : `GitHub recusou (${res.status}): ${text.slice(0, 200)}`);
  return { ok: res.ok, status: res.status, text };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },
  // A página do Worker só mostra se o token está configurado; ela não dispara nada.
  async fetch(request, env) {
    return new Response(`Saint Data · agendador\nToken configurado: ${env.GH_TOKEN ? "sim" : "não"}\nRepositório: ${env.REPO}\n`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
