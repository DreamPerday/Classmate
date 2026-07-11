const port = Number(process.env.CLASSMATE_DEBUG_PORT ?? 9223);
const endpoint = `http://127.0.0.1:${port}`;

class CdpClient {
  constructor(url) {
    this.sequence = 0;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const description = response.exceptionDetails.exception?.description;
      throw new Error(
        description ?? response.exceptionDetails.text ?? "渲染进程执行失败",
      );
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const targets = await fetch(`${endpoint}/json/list`).then((response) => {
  if (!response.ok) throw new Error(`CDP 返回 HTTP ${response.status}`);
  return response.json();
});
const mainTarget = targets.find(
  (target) => target.type === "page" && !target.url.includes("overlay=1"),
);
const overlayTarget = targets.find(
  (target) => target.type === "page" && target.url.includes("overlay=1"),
);
assert(mainTarget && overlayTarget, "未找到主窗口和悬浮窗渲染目标");

const main = new CdpClient(mainTarget.webSocketDebuggerUrl);
const overlay = new CdpClient(overlayTarget.webSocketDebuggerUrl);
await Promise.all([main.connect(), overlay.connect()]);

const initial = await overlay.evaluate("window.desktop.getOverlayState()");
await overlay.evaluate(
  `document.querySelector('button[title="收起"]')?.click()`,
);
await new Promise((resolve) => setTimeout(resolve, 350));
const compact = await overlay.evaluate("window.desktop.getOverlayState()");
assert(
  compact.compact && compact.bounds.height <= 60,
  `悬浮窗未真正收起：${JSON.stringify(compact)}`,
);

await overlay.evaluate(
  `document.querySelector('button[title="展开"]')?.click()`,
);
await new Promise((resolve) => setTimeout(resolve, 350));
const expanded = await overlay.evaluate("window.desktop.getOverlayState()");
assert(!expanded.compact && expanded.bounds.height >= 200, "悬浮窗未恢复展开");
const overlayContent = await overlay.evaluate(`(() => {
  const sections = Array.from(document.querySelectorAll("main > div > section"));
  const transcript = sections[0];
  const understanding = sections[1];
  return {
    width: document.documentElement.clientWidth,
    transcriptOverflow: transcript ? getComputedStyle(transcript).overflowY : null,
    understandingOverflow: understanding ? getComputedStyle(understanding).overflowY : null,
    clamped: sections.reduce((count, section) => count + section.querySelectorAll('[class*="line-clamp"], [class~="truncate"]').length, 0)
  };
})()`);
assert(
  Math.abs(expanded.bounds.width - initial.bounds.width) <= 2,
  `收起或展开不应改变浮窗宽度：${JSON.stringify({ initial, compact, expanded })}`,
);
assert(overlayContent.transcriptOverflow === "auto", "浮窗字幕不能独立滚动");
assert(overlayContent.understandingOverflow === "auto", "浮窗课堂理解不能独立滚动");
assert(overlayContent.clamped === 0, "浮窗正文仍存在截断样式");

await overlay.evaluate("window.desktop.minimizeMain()");
await new Promise((resolve) => setTimeout(resolve, 300));
const minimized = await overlay.evaluate("window.desktop.getMainState()");
assert(minimized.minimized, "无法建立主窗口最小化测试前置状态");
await overlay.evaluate(
  `document.querySelector('button[title="打开主窗口"]')?.click()`,
);
await new Promise((resolve) => setTimeout(resolve, 500));
const restored = await overlay.evaluate("window.desktop.getMainState()");
assert(restored.visible && !restored.minimized, "主窗口未被唤起");

await overlay.evaluate(
  `document.querySelector('button[title="隐藏悬浮窗"]')?.click()`,
);
await new Promise((resolve) => setTimeout(resolve, 250));
const hidden = await overlay.evaluate("window.desktop.getOverlayState()");
assert(!hidden.visible, "隐藏悬浮窗按钮无效");

await main.evaluate(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("课堂悬浮窗"))?.click()`);
await new Promise((resolve) => setTimeout(resolve, 250));
const shown = await overlay.evaluate("window.desktop.getOverlayState()");
assert(shown.visible, "主界面无法重新显示悬浮窗");

await main.evaluate(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "学习报告")?.click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const reportUi = await main.evaluate(`({
  comprehensive: document.body.innerText.includes("综合学习报告"),
  allScope: document.body.innerText.includes("全部课堂"),
  fixedTenDay: document.body.innerText.includes("生成十天报告")
})`);
assert(reportUi.comprehensive && reportUi.allScope && !reportUi.fixedTenDay, "通用报告界面未生效");

await main.evaluate(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "实时课堂")?.click()`);
await new Promise((resolve) => setTimeout(resolve, 150));
const dashboard = await fetch("http://127.0.0.1:4317/api/dashboard")
  .then((response) => response.json())
  .then((envelope) => envelope.data);
assert(dashboard.sessions.length >= 2, "课次切换验证至少需要两个课堂");
const orderedSessions = [...dashboard.sessions].sort(
  (left, right) => left.dayIndex - right.dayIndex,
);
const switchedSessions = [];
for (const session of orderedSessions.slice(0, 2)) {
  const changed = await main.evaluate(`(() => {
    const select = document.querySelector('select[aria-label="当前课堂"]');
    if (!select) return false;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setValue?.call(select, ${JSON.stringify(session.id)});
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, "找不到当前课堂切换控件");
  await new Promise((resolve) => setTimeout(resolve, 450));
  const state = await main.evaluate(`(() => {
    const select = document.querySelector('select[aria-label="当前课堂"]');
    const transcript = document.querySelector('[aria-live="polite"]');
    return {
      selectedSession: select?.value ?? null,
      transcriptItems: transcript?.querySelectorAll("article").length ?? 0,
      titleVisible: document.body.innerText.includes(${JSON.stringify(session.title)})
    };
  })()`);
  assert(
    state.selectedSession === session.id && state.titleVisible,
    `切换课堂后界面状态未更新：${JSON.stringify(state)}`,
  );
  const selectedDashboard = await fetch(
    `http://127.0.0.1:4317/api/dashboard?courseId=${encodeURIComponent(session.courseId)}&sessionId=${encodeURIComponent(session.id)}`,
  )
    .then((response) => response.json())
    .then((envelope) => envelope.data);
  assert(
    selectedDashboard.activeSession?.id === session.id &&
      state.transcriptItems === selectedDashboard.recentTranscript.length,
    `切换课堂后字幕没有同步：${JSON.stringify({ state, sessionId: selectedDashboard.activeSession?.id, apiItems: selectedDashboard.recentTranscript.length })}`,
  );
  switchedSessions.push({
    dayIndex: session.dayIndex,
    sessionId: session.id,
    transcriptItems: state.transcriptItems,
  });
}
const scrollUi = await main.evaluate(`(() => {
  const transcript = document.querySelector('[aria-live="polite"]');
  const eventTitle = Array.from(document.querySelectorAll("div")).find((element) => element.textContent?.trim() === "课堂理解");
  const eventPanel = eventTitle?.parentElement;
  return {
    transcriptOverflow: transcript ? getComputedStyle(transcript).overflowY : null,
    transcriptScrollable: transcript ? transcript.scrollHeight > transcript.clientHeight : false,
    transcriptScrollHeight: transcript?.scrollHeight ?? null,
    transcriptClientHeight: transcript?.clientHeight ?? null,
    transcriptItems: transcript?.querySelectorAll("article").length ?? 0,
    eventOverflow: eventPanel ? getComputedStyle(eventPanel).overflowY : null,
    eventScrollHeight: eventPanel?.scrollHeight ?? null,
    eventClientHeight: eventPanel?.clientHeight ?? null,
    clampedEvents: document.querySelectorAll(".line-clamp-2").length
  };
})()`);
assert(scrollUi.transcriptOverflow === "auto", "字幕区域未独立滚动");
assert(scrollUi.eventOverflow === "auto", "右侧内容区域未独立滚动");
assert(scrollUi.clampedEvents === 0, "右侧内容仍被截断");
const overflowProbe = await main.evaluate(`(() => {
  const transcript = document.querySelector('[aria-live="polite"]');
  const eventTitle = Array.from(document.querySelectorAll("div")).find((element) => element.textContent?.trim() === "课堂理解");
  const eventPanel = eventTitle?.parentElement;
  function probe(container) {
    if (!container) return { scrolled: false, reason: "missing" };
    const original = container.scrollTop;
    const before = { scrollHeight: container.scrollHeight, clientHeight: container.clientHeight };
    const filler = document.createElement("div");
    filler.style.height = "1600px";
    filler.style.minHeight = "1600px";
    filler.style.blockSize = "1600px";
    filler.style.flexShrink = "0";
    filler.dataset.scrollProbe = "true";
    container.appendChild(filler);
    container.scrollTop = container.scrollHeight;
    const after = { scrollHeight: container.scrollHeight, clientHeight: container.clientHeight, scrollTop: container.scrollTop };
    const scrolled = after.scrollHeight > after.clientHeight && after.scrollTop > 0;
    filler.remove();
    container.scrollTop = original;
    return { scrolled, before, after };
  }
  return { transcript: probe(transcript), understanding: probe(eventPanel) };
})()`);
assert(overflowProbe.transcript.scrolled, `字幕溢出后无法向下滚动：${JSON.stringify(overflowProbe.transcript)}`);
assert(overflowProbe.understanding.scrolled, `右侧内容溢出后无法向下滚动：${JSON.stringify(overflowProbe.understanding)}`);

await main.evaluate(`Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "任务中心")?.click()`);
await new Promise((resolve) => setTimeout(resolve, 200));
const taskBefore = dashboard.tasks[0];
assert(taskBefore, "任务完成状态验证至少需要一条任务");
const targetStatus = taskBefore.status === "done" ? "open" : "done";
const taskClicked = await main.evaluate(`(() => {
  const input = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find((element) => element.getAttribute("aria-label")?.includes(${JSON.stringify(taskBefore.title)}));
  if (!input || input.disabled) return false;
  input.click();
  return true;
})()`);
assert(taskClicked, "任务复选框不可用");
await new Promise((resolve) => setTimeout(resolve, 1200));
const taskUiAfterClick = await main.evaluate(`(() => {
  const input = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find((element) => element.getAttribute("aria-label")?.includes(${JSON.stringify(taskBefore.title)}));
  return {
    checked: input?.checked ?? null,
    disabled: input?.disabled ?? null,
    labels: Array.from(document.querySelectorAll('input[type="checkbox"]')).map((element) => element.getAttribute("aria-label"))
  };
})()`);
const taskChanged = await fetch("http://127.0.0.1:4317/api/dashboard")
  .then((response) => response.json())
  .then((envelope) => envelope.data.tasks.find((task) => task.id === taskBefore.id));
assert(
  taskChanged?.status === targetStatus,
  `任务状态未通过界面保存：${JSON.stringify({ before: taskBefore.status, after: taskChanged?.status, taskUiAfterClick })}`,
);
const taskRestored = await main.evaluate(`(() => {
  const input = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find((element) => element.getAttribute("aria-label")?.includes(${JSON.stringify(taskBefore.title)}));
  if (!input || input.disabled) return false;
  input.click();
  return true;
})()`);
assert(taskRestored, "任务复选框无法恢复原状态");
await new Promise((resolve) => setTimeout(resolve, 450));
const restoredTask = await fetch("http://127.0.0.1:4317/api/dashboard")
  .then((response) => response.json())
  .then((envelope) => envelope.data.tasks.find((task) => task.id === taskBefore.id));
assert(restoredTask?.status === taskBefore.status, "任务状态测试后未恢复");
const taskToggle = {
  taskId: taskBefore.id,
  before: taskBefore.status,
  changed: taskChanged.status,
  restored: restoredTask.status,
};

let captureAction = null;
const requestedCaptureAction = process.argv.includes("--start-capture")
  ? "start"
  : process.argv.includes("--stop-capture")
    ? "stop"
    : null;
if (requestedCaptureAction) {
  const beforeTitle = requestedCaptureAction === "start" ? "开始采集" : "结束采集";
  const afterTitle = requestedCaptureAction === "start" ? "结束采集" : "开始采集";
  const clicked = await overlay.evaluate(`(() => {
    const button = document.querySelector('button[title="${beforeTitle}"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `浮窗${beforeTitle}按钮不可用`);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const changed = await overlay.evaluate(
    `Boolean(document.querySelector('button[title="${afterTitle}"]'))`,
  );
  assert(changed, `浮窗${beforeTitle}按钮未切换状态`);
  captureAction = requestedCaptureAction;
}

console.log(
  JSON.stringify({
    initial,
    compact,
    expanded,
    overlayContent,
    mainWindowState: restored,
    hidden: !hidden.visible,
    shown: shown.visible,
    reportUi,
    switchedSessions,
    scrollUi,
    overflowProbe,
    taskToggle,
    captureAction,
  }),
);
main.close();
overlay.close();
