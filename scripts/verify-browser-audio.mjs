const port = Number(process.env.BROWSER_DEBUG_PORT ?? 9224);
const endpoint = `http://127.0.0.1:${port}`;
const targets = await fetch(`${endpoint}/json/list`).then((response) =>
  response.json(),
);
const target = targets.find(
  (item) => item.type === "page" && item.url.endsWith("audio-playback.html"),
);
if (!target) throw new Error("未找到浏览器音频测试页");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? "浏览器执行失败");
  }
  return response.result.value;
}

const stateExpression = `(() => {
  const audio = document.querySelector("audio");
  return {
    currentTime: audio?.currentTime ?? null,
    duration: Number.isFinite(audio?.duration) ? audio.duration : null,
    paused: audio?.paused ?? null,
    readyState: audio?.readyState ?? null,
    networkState: audio?.networkState ?? null,
    error: audio?.error ? { code: audio.error.code, message: audio.error.message } : null
  };
})()`;
let before = await evaluate(stateExpression);
if (process.argv.includes("--start")) {
  await evaluate(`document.querySelector("audio").play()`);
}
await new Promise((resolve) => setTimeout(resolve, 1200));
const after = await evaluate(stateExpression);
if (process.argv.includes("--start") && !(after.currentTime > before.currentTime)) {
  throw new Error(`浏览器音频未前进：${JSON.stringify({ before, after })}`);
}
console.log(JSON.stringify({ before, after }));
socket.close();
