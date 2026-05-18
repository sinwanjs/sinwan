/**
 * Phase 5 — STATIC React-compatible API tests.
 */

import { describe, it, expect } from "bun:test";
import {
  prerender,
  prerenderToNodeStream,
  resumeAndPrerender,
  resumeAndPrerenderToNodeStream,
} from "../../../../src/integrations/react/_static.ts";
import type { SinwanElement } from "../../../../src/types.ts";

const div = (
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: "div",
  props: { ...props, children },
  children: children as any,
});

async function streamToString(s: ReadableStream<Uint8Array>): Promise<string> {
  const reader = s.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

async function nodeStreamToString(s: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of s as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks as readonly Uint8Array[]).toString("utf8");
}

describe("prerender", () => {
  it("returns { prelude, postponed: null }", async () => {
    const result = await prerender(div({}, "hi"));
    expect(result.postponed).toBeNull();
    const html = await streamToString(result.prelude);
    expect(html).toContain("hi");
  });

  it("appends bootstrapModules", async () => {
    const { prelude } = await prerender(div({}, "x"), {
      bootstrapModules: ["/client.js"],
    });
    const html = await streamToString(prelude);
    expect(html).toContain('type="module"');
    expect(html).toContain("/client.js");
  });
});

describe("prerenderToNodeStream", () => {
  it("returns a node Readable that emits the prerendered HTML", async () => {
    const { prelude } = await prerenderToNodeStream(div({}, "node"));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("node");
  });
});

describe("resumeAndPrerender", () => {
  it("falls back to a fresh prerender when there is no postponed state", async () => {
    const { prelude, postponed } = await resumeAndPrerender(
      div({}, "resumed"),
      null,
    );
    expect(postponed).toBeNull();
    const html = await streamToString(prelude);
    expect(html).toContain("resumed");
  });

  it("resumeAndPrerenderToNodeStream returns a node stream", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(
      div({}, "n"),
      null,
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("n");
  });
});
