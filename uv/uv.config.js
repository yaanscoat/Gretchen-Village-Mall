// The folder the site lives in: "/" on Cloudflare, "/your-repo-name/" on GitHub Pages.
// Works from the main page, sw.js, and pages opened through Ultraviolet (/…/uv/service/…).
self.SITE_BASE = location.pathname.replace(/\/(uv|scramjet)\/.*$/, "/").replace(/[^/]*$/, "");

self.__uv$config = {
  prefix: SITE_BASE + "uv/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: SITE_BASE + "uv/uv.handler.js",
  client: SITE_BASE + "uv/uv.client.js",
  bundle: SITE_BASE + "uv/uv.bundle.js",
  config: SITE_BASE + "uv/uv.config.js",
  sw: SITE_BASE + "uv/uv.sw.js",
};
