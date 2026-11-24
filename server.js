// Minimal static server — no dependencies.
// Usage: node server.js [port]   (default 8000)
// (Any static server works, e.g. `python -m http.server 8000`.)

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.argv[2]) || 8000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(root, path.normalize(urlPath));
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err && path.basename(filePath) === "firebase-config.js") {
      // Config is optional and gitignored: serve a no-op module instead of a 404
      // so the console stays clean before the user adds their own config.
      const stub = "// Stub: firebase-config.js not created yet.\nexport const firebaseConfig = null;\nexport const cloudModelId = null;\n";
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      return res.end(stub);
    }
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log(`Hybrid Reader → http://localhost:${port}`));
