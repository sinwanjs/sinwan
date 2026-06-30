import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import type { HydrationAdapter } from "../src/hydration/adapter.ts";
import { DEFAULT_HYDRATION_ADAPTER } from "../src/hydration/markers.ts";

let doc: Document;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
});

const customAdapter: HydrationAdapter = {
  componentAttr: "data-test-id",
  eventAttr: "data-test-ev",
  emitComponentMarker(index) {
    return `data-test-id="x${index}"`;
  },
  emitEventMarker(bindings) {
    return `data-test-ev="${bindings.map(([event, idx]) => `${event}:${idx}`).join(",")}"`;
  },
  emitTextOpenMarker(index) {
    return `<!--test-t:${index}-->`;
  },
  emitTextCloseMarker() {
    return "<!--/test-t-->";
  },
  emitFunctionOpenMarker() {
    return "<!--test-f-->";
  },
  emitFunctionCloseMarker() {
    return "<!--/test-f-->";
  },
  parseComponentMarker(el) {
    const value = el.getAttribute("data-test-id");
    if (value == null) return null;
    return parseInt(value.slice(1), 10);
  },
  parseEventMarker(value) {
    return value.split(",").map((pair) => {
      const colonIndex = pair.indexOf(":");
      return [pair.slice(0, colonIndex), Number(pair.slice(colonIndex + 1))];
    });
  },
  parseTextOpenMarker(node) {
    const data = node.data;
    if (data.startsWith("test-t:")) {
      const idx = parseInt(data.slice(7), 10);
      return Number.isNaN(idx) ? -1 : idx;
    }
    return -1;
  },
  isTextCloseMarker(node) {
    return node.data === "/test-t";
  },
  isFunctionOpenMarker(node) {
    return node.data === "test-f";
  },
  isFunctionCloseMarker(node) {
    return node.data === "/test-f";
  },
  stripMarkers(html) {
    return html
      .replace(/\s+data-test-id="x\d+"/g, "")
      .replace(/\s+data-test-ev="[^"]*"/g, "")
      .replace(/<!--test-t:\d+-->/g, "")
      .replace(/<!--\/test-t-->/g, "");
  },
};

describe("HydrationAdapter", () => {
  it("emits and parses component markers", () => {
    const attr = DEFAULT_HYDRATION_ADAPTER.emitComponentMarker(3);
    expect(attr).toBe('data-sinwan-id="c3"');

    const el = document.createElement("div");
    el.setAttribute("data-sinwan-id", "c3");
    expect(DEFAULT_HYDRATION_ADAPTER.parseComponentMarker(el)).toBe(3);
  });

  it("emits and parses event markers", () => {
    const attr = DEFAULT_HYDRATION_ADAPTER.emitEventMarker([
      ["click", 0],
      ["input", 1],
    ]);
    expect(attr).toBe('data-sinwan-ev="click:0,input:1"');

    expect(
      DEFAULT_HYDRATION_ADAPTER.parseEventMarker("click:0,input:1"),
    ).toEqual([
      ["click", 0],
      ["input", 1],
    ]);
  });

  it("emits and parses text markers", () => {
    const open = DEFAULT_HYDRATION_ADAPTER.emitTextOpenMarker(5);
    expect(open).toBe("<!--sinwan-t:5-->");
    const close = DEFAULT_HYDRATION_ADAPTER.emitTextCloseMarker();
    expect(close).toBe("<!--/sinwan-t-->");

    const openComment = document.createComment("sinwan-t:5");
    const closeComment = document.createComment("/sinwan-t");
    expect(DEFAULT_HYDRATION_ADAPTER.parseTextOpenMarker(openComment)).toBe(5);
    expect(DEFAULT_HYDRATION_ADAPTER.isTextCloseMarker(closeComment)).toBe(
      true,
    );
  });

  it("emits and parses function markers", () => {
    const open = DEFAULT_HYDRATION_ADAPTER.emitFunctionOpenMarker();
    expect(open).toBe("<!--sinwan-r-->");
    const close = DEFAULT_HYDRATION_ADAPTER.emitFunctionCloseMarker();
    expect(close).toBe("<!--/sinwan-r-->");

    const openComment = document.createComment("sinwan-r");
    const closeComment = document.createComment("/sinwan-r");
    expect(DEFAULT_HYDRATION_ADAPTER.isFunctionOpenMarker(openComment)).toBe(
      true,
    );
    expect(DEFAULT_HYDRATION_ADAPTER.isFunctionCloseMarker(closeComment)).toBe(
      true,
    );
  });

  it("strips all hydration markers from HTML", () => {
    const html = `<div data-sinwan-id="c0" data-sinwan-ev="click:0"><p>Count: <!--sinwan-t:0-->5<!--/sinwan-t--></p></div>`;
    expect(DEFAULT_HYDRATION_ADAPTER.stripMarkers(html)).toBe(
      "<div><p>Count: 5</p></div>",
    );
  });

  it("supports a custom adapter implementation", () => {
    const el = document.createElement("div");
    el.setAttribute("data-test-id", "x7");
    expect(customAdapter.parseComponentMarker(el)).toBe(7);

    const openComment = document.createComment("test-t:2");
    expect(customAdapter.parseTextOpenMarker(openComment)).toBe(2);

    const html =
      '<div data-test-id="x0" data-test-ev="click:0"><!--test-t:0-->x<!--/test-t--></div>';
    expect(customAdapter.stripMarkers(html)).toBe("<div>x</div>");
  });
});
