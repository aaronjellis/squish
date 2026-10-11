#!/usr/bin/env node
// Dependency-free static server for local dev and Playwright.
// Usage: node scripts/serve.cjs [port]   (default 8788, serves the repo root)
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const port = parseInt(process.argv[2] || process.env.PORT || "8788", 10);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".cjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".mp4": "video/mp4", ".wav": "audio/wav",
  ".mp3": "audio/mpeg", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".rtf": "application/rtf", ".ico": "image/x-icon", ".map": "application/json",
};
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (p.endsWith("/")) p += "squish.html";
  const file = path.join(root, p);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(port, () => console.log("Squish at http://localhost:" + port + "/squish.html"));
