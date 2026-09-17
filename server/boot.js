import http from "http";

const PUBLIC_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = PUBLIC_PORT === 3000 ? 3001 : PUBLIC_PORT + 1;
process.env.PORT = String(INTERNAL_PORT);

let appReady = false;
let startupError = null;

const proxyServer = http.createServer((req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: INTERNAL_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` }
  };

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(startupError ? 503 : 502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({
      status: "starting",
      ready: appReady,
      error: startupError ? startupError.message : "ERP server is still starting"
    }));
  });

  req.pipe(proxyReq);
});

proxyServer.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(`[BOOT] Public port ${PUBLIC_PORT} is listening.`);
});

try {
  await import("./server.js");
  appReady = true;
  console.log(`[BOOT] ERP server is ready on internal port ${INTERNAL_PORT}.`);
} catch (error) {
  startupError = error;
  console.error("[BOOT] ERP server startup failed:", error?.stack || error);
}
