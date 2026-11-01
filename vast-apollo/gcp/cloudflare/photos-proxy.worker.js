// img.lakshmisarees.in -> the public photo bucket.
//
// The photographs are public already, at
// storage.googleapis.com/lakshmi-sarees-photos/..., and Google caches them at its own edges.
// Putting them on the shop's own name instead means Cloudflare caches them, on the plan the
// shop already pays nothing for, and the address stops naming a supplier the shop may one
// day leave.
//
// Only reads are forwarded. A write would have to be signed, and nothing signs here.
const BUCKET = "lakshmi-sarees-photos";
const ORIGIN = "storage.googleapis.com";

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    // The bucket name is added here rather than in every address the app renders, so moving
    // to another bucket is one line in this file.
    const target = `https://${ORIGIN}/${BUCKET}${url.pathname}`;

    const response = await fetch(target, {
      method: request.method,
      // The photographs carry "public, max-age=31536000, immutable" already, so Cloudflare
      // keeps them without a cache rule; this only repeats it for Cloudflare's own store.
      cf: { cacheEverything: true, cacheTtl: 31536000 },
    });

    // A miss must not be cached for a year: a photograph can be written a moment later.
    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }
    return response;
  },
};
