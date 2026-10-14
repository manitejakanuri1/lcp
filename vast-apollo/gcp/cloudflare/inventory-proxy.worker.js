// inventory.lakshmisarees.in -> the shop on Cloud Run.
//
// Cloud Run answers only to its own *.run.app hostname, so the request has to carry that
// name when it is forwarded. Changing the URL's hostname is what does it: Cloudflare sets
// the Host header from the URL, so no header juggling is needed.
const ORIGIN = "pos-api-1015935854351.asia-south1.run.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const publicHost = url.hostname;

    url.hostname = ORIGIN;
    url.protocol = "https:";
    url.port = "";

    const headers = new Headers(request.headers);
    // So the app can tell which name the visitor actually typed.
    headers.set("X-Forwarded-Host", publicHost);
    headers.set("X-Forwarded-Proto", "https");

    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body,       // streamed: bill photos reach 25 MB
      redirect: "manual",       // let the browser follow redirects itself
    });

    // A redirect that names the run.app host would bounce the visitor off the shop's own
    // address and lose the login cookie, so it is rewritten back.
    const location = response.headers.get("Location");
    if (location && location.includes(ORIGIN)) {
      const fixed = new Response(response.body, response);
      fixed.headers.set("Location", location.replace(ORIGIN, publicHost));
      return fixed;
    }
    return response;
  },
};
