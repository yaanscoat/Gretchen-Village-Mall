// Gretchen Village Mall - Cloudflare Worker
// Files in /public are served automatically. This Worker handles:
//   /bare/            a tiny "Bare v3" server that Ultraviolet and Scramjet use to fetch websites
//   /ckv..., /covers/ games from github.com/gmshelf/ckv (loaded through jsDelivr)

const GAMES_CDN = "https://cdn.jsdelivr.net/gh/gmshelf/ckv@main";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ckv") || url.pathname.startsWith("/covers/")) {
      return serveGameFile(url.pathname);
    }

    if (url.pathname === "/bare/") {
      return Response.json({ versions: ["v3"], language: "JS", project: { name: "gretchen-village-mall" } });
    }

    if (url.pathname === "/bare/v3/") {
      if (request.headers.get("upgrade") === "websocket") return handleSocket();
      return handleRequest(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

// jsDelivr sends .html files as plain text, so fix the type so games actually run
async function serveGameFile(path) {
  const res = await fetch(GAMES_CDN + path);
  const headers = new Headers(res.headers);
  if (path.endsWith(".html")) headers.set("content-type", "text/html; charset=utf-8");
  return new Response(res.body, { status: res.status, headers });
}

// Normal page requests (HTML, images, scripts...)
async function handleRequest(request) {
  try {
    const target = request.headers.get("x-bare-url");
    const headers = readBareHeaders(request.headers);
    delete headers.host;
    delete headers.Host;

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      redirect: "manual",
    });

    // Send the site's real headers back inside one JSON header
    const skip = ["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection"];
    const siteHeaders = {};
    res.headers.forEach((value, key) => {
      if (!skip.includes(key)) siteHeaders[key] = value;
    });
    const cookies = res.headers.getSetCookie();
    if (cookies.length) siteHeaders["set-cookie"] = cookies;

    return new Response(res.body, {
      headers: {
        "x-bare-status": String(res.status),
        "x-bare-status-text": res.statusText,
        "x-bare-headers": JSON.stringify(siteHeaders),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ code: "UNKNOWN", id: "request", message: String(err) }, { status: 500 });
  }
}

// The x-bare-headers JSON can be split into x-bare-headers-0, -1, ... when it is long
function readBareHeaders(h) {
  let json = h.get("x-bare-headers");
  if (json === null) {
    json = "";
    for (let i = 0; h.has("x-bare-headers-" + i); i++) json += h.get("x-bare-headers-" + i).slice(1);
  }
  return JSON.parse(json || "{}");
}

// WebSockets (chat apps, games...)
function handleSocket() {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  let remote = null;

  server.addEventListener("message", async (event) => {
    if (remote) return remote.send(event.data);

    // The first message tells us where to connect
    const msg = JSON.parse(event.data);
    const target = new URL(msg.remote);
    target.protocol = target.protocol === "wss:" ? "https:" : "http:";

    const headers = new Headers({ Upgrade: "websocket" });
    for (const [key, value] of Object.entries(msg.headers)) {
      const k = key.toLowerCase();
      if (k !== "host" && k !== "connection" && k !== "upgrade" && !k.startsWith("sec-websocket")) headers.set(key, value);
    }
    if (msg.protocols.length) headers.set("Sec-WebSocket-Protocol", msg.protocols.join(", "));

    try {
      const res = await fetch(target, { headers });
      if (!res.webSocket) throw new Error("Site refused the WebSocket");
      remote = res.webSocket;
      remote.accept();
      remote.addEventListener("message", (e) => server.send(e.data));
      remote.addEventListener("close", (e) => server.close(safeCode(e.code), e.reason));
      server.send(JSON.stringify({ type: "open", protocol: res.headers.get("sec-websocket-protocol") || "", setCookies: [] }));
    } catch (err) {
      server.close(1011, String(err).slice(0, 100));
    }
  });

  server.addEventListener("close", (e) => remote?.close(safeCode(e.code), e.reason));
  return new Response(null, { status: 101, webSocket: client });
}

// Some close codes are not allowed to be sent, so swap them for 1000 (normal)
function safeCode(code) {
  return code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
}
