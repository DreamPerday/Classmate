import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const port = Number(process.env.MAVEN_PROXY_PORT ?? 4873);
const repositories = {
  "/gradle-plugin/": "https://maven.aliyun.com/repository/gradle-plugin/",
  "/google/": "https://maven.aliyun.com/repository/google/",
  "/public/": "https://maven.aliyun.com/repository/public/",
};

createServer(async (request, response) => {
  const route = Object.entries(repositories).find(([prefix]) => request.url?.startsWith(prefix));
  if (!route || !request.url) {
    response.writeHead(404).end();
    return;
  }
  const [prefix, upstream] = route;
  try {
    const target = upstream + request.url.slice(prefix.length);
    const result = await fetch(target, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: request.headers.range ? { range: request.headers.range } : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(120_000),
    });
    const headers = {};
    for (const name of ["content-type", "content-length", "last-modified", "etag", "accept-ranges", "content-range"]) {
      const value = result.headers.get(name);
      if (value) headers[name] = value;
    }
    response.writeHead(result.status, headers);
    if (request.method === "HEAD" || !result.body) response.end();
    else await pipeline(Readable.fromWeb(result.body), response);
  } catch (error) {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, "127.0.0.1", () => process.stdout.write(`Maven proxy listening on 127.0.0.1:${port}\n`));
