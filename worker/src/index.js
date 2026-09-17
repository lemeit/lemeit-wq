/**
 * API de coordenadas para agua-saladillo, sobre Cloudflare D1.
 *
 * Reemplaza el localStorage por navegador que usaba el panel "⚙ Ubicaciones":
 * ahora las coordenadas son un dato compartido, y solo se pueden escribir
 * con una clave de administrador (secret ADMIN_KEY, configurado con
 * `wrangler secret put ADMIN_KEY` — nunca en este archivo ni en wrangler.toml).
 *
 * Endpoints:
 *   GET  /api/coords   -> público. { "<fuente>": {lat, lon, tipo, dir}, ... }
 *   POST /api/coords   -> protegido. Header "X-Admin-Key" debe matchear el
 *                         secret ADMIN_KEY. Body JSON: { fuente, lat, lon, tipo, dir }.
 *                         Hace upsert (INSERT ... ON CONFLICT UPDATE) por "fuente".
 *                         Para "borrar" coordenadas se manda lat/lon en null.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ── Proxy de tiles del mapa (CARTO Basemaps) ────────────────────────────────
// CARTO ahora exige una API key para servir tiles. En vez de poner esa key
// en el HTML público (cualquiera podría copiarla de "ver código fuente" y
// gastar la cuota gratuita de 5M tiles/mes), el frontend le pide los tiles a
// este Worker y es el Worker quien agrega la key en el secret CARTO_API_KEY
// (`wrangler secret put CARTO_API_KEY`, nunca en este archivo ni en
// wrangler.toml) al pedirle el tile a CARTO. Así la key nunca queda expuesta
// del lado del cliente.
const TILE_STYLES = new Set(["light_all", "dark_all"]);
const TILE_SUBDOMAINS = "abcd";

async function proxyCartoTile(env, style, z, x, y, retina) {
  if (!TILE_STYLES.has(style)) return json({ error: "Estilo de tile inválido" }, 400);
  if (!env.CARTO_API_KEY) return json({ error: "Falta configurar el secret CARTO_API_KEY" }, 500);
  const sub = TILE_SUBDOMAINS[Math.floor(Math.random() * TILE_SUBDOMAINS.length)];
  const cartoUrl = `https://${sub}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}${retina}.png?key=${env.CARTO_API_KEY}`;
  const resp = await fetch(cartoUrl, { cf: { cacheTtl: 604800, cacheEverything: true } });
  if (!resp.ok) return new Response("Error obteniendo el tile de CARTO", { status: resp.status });
  const headers = new Headers();
  headers.set("Content-Type", resp.headers.get("Content-Type") || "image/png");
  headers.set("Cache-Control", "public, max-age=604800");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(resp.body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // api.lemeit.ar/wq/* (Route de Cloudflare, ver worker/wrangler.toml)
    // llega con el prefijo /wq incluido — se lo sacamos acá, una sola vez,
    // para que el resto del código no sepa ni le importe si vino por ahí o
    // por el *.workers.dev directo (sin /wq), que sigue andando igual sin
    // tocar nada.
    let path = url.pathname;
    if (path.startsWith("/wq/")) path = path.slice(3);

    const tileMatch = path.match(/^\/tiles\/(light_all|dark_all)\/(\d+)\/(-?\d+)\/(-?\d+)(@2x)?\.png$/);
    if (tileMatch) {
      const [, style, z, x, y, retina] = tileMatch;
      return proxyCartoTile(env, style, z, x, y, retina || "");
    }

    if (path !== "/api/coords") {
      return json({ error: "Not found" }, 404);
    }

    try {
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT fuente, lat, lon, tipo, dir FROM coords"
        ).all();
        const out = {};
        for (const r of results) {
          out[r.fuente] = { lat: r.lat, lon: r.lon, tipo: r.tipo, dir: r.dir };
        }
        return json(out);
      }

      if (request.method === "POST") {
        const key = request.headers.get("X-Admin-Key");
        if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
          return json({ error: "No autorizado" }, 401);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body inválido, se esperaba JSON" }, 400);
        }
        const { fuente, lat, lon, tipo, dir } = body || {};
        if (!fuente || typeof fuente !== "string") {
          return json({ error: "Falta 'fuente'" }, 400);
        }
        if (lat !== null && typeof lat !== "number") {
          return json({ error: "'lat' debe ser number o null" }, 400);
        }
        if (lon !== null && typeof lon !== "number") {
          return json({ error: "'lon' debe ser number o null" }, 400);
        }

        await env.DB.prepare(
          `INSERT INTO coords (fuente, lat, lon, tipo, dir, actualizado_en)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(fuente) DO UPDATE SET
             lat = excluded.lat,
             lon = excluded.lon,
             tipo = excluded.tipo,
             dir = excluded.dir,
             actualizado_en = excluded.actualizado_en`
        )
          .bind(fuente, lat ?? null, lon ?? null, tipo ?? null, dir ?? null)
          .run();

        return json({ ok: true });
      }

      return json({ error: "Método no permitido" }, 405);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};