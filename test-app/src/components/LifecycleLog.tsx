import { cc, onMounted, onUnmounted } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { render } from "sinwan/renderer";

const log = signal<string[]>([]);

const push = (line: string) => {
  const ts = new Date().toLocaleTimeString();
  log.value = [...log.value, `[${ts}] ${line}`];
};

// Inner component that announces itself in the log on mount/unmount.
const Greeting = cc<{ name: string }>(({ name }) => {
  push(`<Greeting name="${name}"> setup`);
  onMounted(() => push(`<Greeting name="${name}"> mounted`));
  onUnmounted(() => push(`<Greeting name="${name}"> unmounted`));
  return <p>Hello, {name}!</p>;
});

export const LifecycleLog = cc(() => {
  const visible = signal(false);

  let host: HTMLDivElement | null = null;
  let app: { unmount(): void } | null = null;

  const sync = () => {
    if (!host) return;
    if (visible.value && !app) {
      app = render(<Greeting name="Sinwan" />, host);
    } else if (!visible.value && app) {
      app.unmount();
      app = null;
    }
  };

  let logHost: HTMLPreElement | null = null;
  let logApp: { unmount(): void } | null = null;
  const renderLog = () => {
    if (!logHost) return;
    logApp?.unmount();
    logApp = render(<>{log.value.map((l) => l + "\n")}</>, logHost);
  };

  onMounted(() => {
    host = document.querySelector("#greeting-host");
    logHost = document.querySelector("#lifecycle-log");
    sync();
    renderLog();
    const stopVisible = visible.subscribe(sync);
    const stopLog = log.subscribe(renderLog);
    onUnmounted(() => {
      stopVisible();
      stopLog();
      app?.unmount();
      logApp?.unmount();
    });
  });

  return (
    <>
      <div class="row">
        <button onClick={() => (visible.value = !visible.value)}>
          Toggle child
        </button>
        <button class="secondary" onClick={() => (log.value = [])}>
          Clear log
        </button>
      </div>
      <div id="greeting-host" style={{ marginTop: "12px" }}></div>
      <pre id="lifecycle-log" class="log"></pre>
    </>
  );
});
