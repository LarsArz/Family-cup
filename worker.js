export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/nhl/")) {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const nhlPath = url.pathname.slice("/api/nhl".length);
      if (!/^\/(v1\/)?(club-schedule|score)\//.test(nhlPath)) return new Response("Not found", { status: 404 });
      try {
        const upstream = await fetch("https://api-web.nhle.com" + nhlPath, {
          headers: { "accept": "application/json", "user-agent": "ArtznerFamilyCup/1.0" }
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "public, max-age=60" }
        });
      } catch {
        return Response.json({ ok: false, error: "NHL upstream unavailable" }, { status: 502 });
      }
    }

    if (url.pathname === "/api/state") {
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT data, updated_at FROM state WHERE id = 1").first();
        const raw = row?.data || "{}";
        return Response.json({ ok: true, data: JSON.parse(raw), raw, updated_at: row?.updated_at || null }, {
          headers: { "cache-control": "no-store" }
        });
      }

      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
        }

        const base = typeof body.base === "string" ? body.base : null;
        const next = body.data;
        if (base === null || !next || typeof next !== "object") {
          return Response.json({ ok: false, error: "Missing base or data" }, { status: 400 });
        }

        const nextRaw = JSON.stringify(next);
        const result = await env.DB.prepare(
          "UPDATE state SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND data = ?"
        ).bind(nextRaw, base).run();

        if ((result.meta?.changes || 0) !== 1) {
          const row = await env.DB.prepare("SELECT data, updated_at FROM state WHERE id = 1").first();
          const raw = row?.data || "{}";
          return Response.json(
            { ok: false, conflict: true, data: JSON.parse(raw), raw, updated_at: row?.updated_at || null },
            { status: 409, headers: { "cache-control": "no-store" } }
          );
        }

        return Response.json({ ok: true, raw: nextRaw }, {
          headers: { "cache-control": "no-store" }
        });
      }

      return new Response("Method not allowed", { status: 405 });
    }

    return env.ASSETS.fetch(request);
  }
};
