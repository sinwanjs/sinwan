import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Window } from "happy-dom";

import { jsx } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import { renderToString } from "../src/server/index.ts";
import {
  DEFAULT_IMAGE_CONFIG,
  ImageUsageError,
  Img,
  configureImages,
  defaultLoader,
  getImageConfig,
  getImageProps,
  type ImageAsset,
  type ImgProps,
} from "../src/image/index.ts";
import { resetImageConfig } from "../src/image/props.ts";

const asset: ImageAsset = Object.freeze({
  src: "/hero-800.webp",
  srcSet: "/hero-800.webp 1x, /hero-1600.webp 2x",
  width: 800,
  height: 400,
  fit: "cover",
  format: "webp",
  placeholder: "data:image/png;base64,AAAA",
});

const responsive: ImageAsset = Object.freeze({
  src: "/team-1200.webp",
  srcSet: "/team-640.webp 640w, /team-1200.webp 1200w",
  sizes: "50vw",
  width: 1200,
  height: 800,
  fit: "contain",
  format: "webp",
});

let win: InstanceType<typeof Window>;
let container: HTMLElement;
const globals = globalThis as Record<string, unknown>;
const domGlobals = ["document", "Element", "Comment", "Text", "DocumentFragment", "Node", "HTMLElement", "Event"];
const originalGlobals = new Map(domGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  for (const name of domGlobals) {
    globals[name] = name === "document" ? win.document : Reflect.get(win, name);
  }
  globals.window = win;
  container = win.document.createElement("div") as unknown as HTMLElement;
  win.document.body.appendChild(container as never);
});

afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globals[name];
  }
  delete globals.window;
  delete globals.__DEV__;
  resetImageConfig();
});

function render(props: ImgProps): HTMLImageElement {
  mount(() => Img(props), container);
  const img = container.querySelector("img");
  if (!img) throw new Error("no <img> rendered");
  return img as HTMLImageElement;
}

describe("getImageProps", () => {
  it("renders a build-time asset with its srcset, size, fit and blur", () => {
    expect(getImageProps({ src: asset, alt: "Shop" })).toEqual({
      src: "/hero-800.webp",
      srcset: "/hero-800.webp 1x, /hero-1600.webp 2x",
      alt: "Shop",
      width: 800,
      height: 400,
      loading: "lazy",
      decoding: "async",
      style:
        'object-fit:cover;background-image:url("data:image/png;base64,AAAA");background-size:cover;background-position:center;background-repeat:no-repeat',
    });
  });

  it("props override the asset; empty placeholder, sizes, aspect ratio, fill and user style", () => {
    const out = getImageProps({
      src: responsive,
      alt: "",
      width: 600,
      height: 300,
      sizes: "100vw",
      fit: "inside",
      placeholder: "empty",
      blurDataURL: "data:x",
      aspectRatio: "3:2",
      style: { borderRadius: "8px", "margin-top": 2, color: null },
    });
    expect(out).toMatchObject({ sizes: "100vw", width: 600, height: 300 });
    expect(out.style).toBe("max-width:100%;height:auto;object-fit:contain;aspect-ratio:3/2;border-radius:8px;margin-top:2");
    const filled = getImageProps({ src: responsive, alt: "", fill: true, aspectRatio: 1.5, style: "opacity:.5;" });
    expect(filled.width).toBeUndefined();
    expect(filled.height).toBeUndefined();
    expect(filled.sizes).toBe("50vw");
    expect(filled.style).toBe("position:absolute;inset:0;width:100%;height:100%;object-fit:contain;aspect-ratio:1.5;opacity:.5");
  });

  it("priority makes the image eager and high priority; loading, decoding and fetchPriority pass through", () => {
    expect(getImageProps({ src: asset, alt: "", priority: true, loading: "lazy" })).toMatchObject({ loading: "eager", fetchpriority: "high" });
    expect(getImageProps({ src: asset, alt: "", loading: "eager", decoding: "sync", fetchPriority: "low" })).toMatchObject({
      loading: "eager",
      decoding: "sync",
      fetchpriority: "low",
    });
  });

  it("runtime sources: density srcset on allowed widths through the loader", () => {
    const out = getImageProps({ src: "/u/a b.jpg", alt: "", width: 100, height: 50, quality: 85, format: "avif" });
    expect(out.src).toBe("/_sinwan/image?url=%2Fu%2Fa%20b.jpg&w=128&q=85&f=avif");
    expect(out.srcset).toBe("/_sinwan/image?url=%2Fu%2Fa%20b.jpg&w=128&q=85&f=avif 1x, /_sinwan/image?url=%2Fu%2Fa%20b.jpg&w=256&q=85&f=avif 2x");
    expect(out).toMatchObject({ width: 100, height: 50 });
    const deduped = getImageProps({ src: "x.jpg", alt: "", width: 5000, densities: [1, 2] });
    expect(deduped.srcset).toBe("/_sinwan/image?url=x.jpg&w=3840&q=75 1x");
  });

  it("runtime sources: width srcset for sizes, fill or no width", () => {
    const loader = ({ src, width, quality }: { src: string; width: number; quality: number }) => `https://cdn.test/${src}?w=${width}&q=${quality}`;
    configureImages({ deviceSizes: [400, 800], quality: 60 });
    expect(getImageProps({ src: "a.jpg", alt: "", sizes: "50vw", loader })).toMatchObject({
      src: "https://cdn.test/a.jpg?w=800&q=60",
      srcset: "https://cdn.test/a.jpg?w=400&q=60 400w, https://cdn.test/a.jpg?w=800&q=60 800w",
      sizes: "50vw",
    });
    expect(getImageProps({ src: "a.jpg", alt: "", fill: true }).sizes).toBe("100vw");
    expect(getImageProps({ src: "a.jpg", alt: "" }).sizes).toBe("100vw");
    expect(getImageProps({ src: "a.jpg", alt: "", blurDataURL: "data:b", width: 10 }).style).toContain('url("data:b")');
  });

  it("unoptimized renders the source as given", () => {
    expect(getImageProps({ src: "/logo.svg", alt: "Logo", unoptimized: true, width: 40, height: 40 })).toEqual({
      src: "/logo.svg",
      alt: "Logo",
      width: 40,
      height: 40,
      loading: "lazy",
      decoding: "async",
    });
    expect(getImageProps({ src: "/logo.svg", alt: undefined, unoptimized: true })).toMatchObject({ alt: "" });
  });

  it("development errors explain what is missing", () => {
    expect(() => getImageProps({ src: asset, alt: undefined }, true)).toThrow(ImageUsageError);
    expect(() => getImageProps({ src: asset, alt: undefined }, true)).toThrow('needs `alt` text (use alt="" for a decorative image)');
    expect(() => getImageProps({ src: "/a.jpg", alt: "" }, true)).toThrow("needs `width` (CSS pixels) or `fill`");
    expect(() => getImageProps({ src: "/a.jpg", alt: "", width: 10, placeholder: "blur" }, true)).toThrow("needs `blurDataURL`");
    expect(() => getImageProps({ src: "/a.jpg", alt: "", fill: true }, true)).not.toThrow();
    expect(() => getImageProps({ src: "/a.svg", alt: "", unoptimized: true }, true)).not.toThrow();
    expect(new ImageUsageError("x").name).toBe("ImageUsageError");
  });

  it("configuration", () => {
    expect(getImageConfig()).toBe(DEFAULT_IMAGE_CONFIG);
    configureImages({ path: "/img" });
    expect(getImageConfig().path).toBe("/img");
    expect(defaultLoader({ src: "a", width: 16, quality: 50, format: "auto" })).toBe("/img?url=a&w=16&q=50");
    resetImageConfig();
    expect(getImageConfig()).toBe(DEFAULT_IMAGE_CONFIG);
  });
});

describe("<Img>", () => {
  it("renders an <img> with the computed attributes and passes native ones through", () => {
    const img = render({
      src: asset,
      alt: "Shop",
      class: "rounded",
      id: "hero",
      "aria-describedby": "caption",
      "data-kind": "photo",
      crossOrigin: "anonymous",
      referrerPolicy: "no-referrer",
    });
    expect(img.getAttribute("src")).toBe("/hero-800.webp");
    expect(img.getAttribute("srcset")).toBe(asset.srcSet);
    expect(img.getAttribute("alt")).toBe("Shop");
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("class")).toBe("rounded");
    expect(img.getAttribute("id")).toBe("hero");
    expect(img.getAttribute("aria-describedby")).toBe("caption");
    expect(img.getAttribute("data-kind")).toBe("photo");
    expect(img.getAttribute("crossorigin")).toBe("anonymous");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.style.objectFit).toBe("cover");
    expect(img.hasAttribute("fetchpriority")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
  });

  it("follows reactive props", async () => {
    const alt = signal("First");
    const src = signal<ImageAsset | string>(asset);
    const img = render({ src: () => src.value, alt: () => alt.value });
    alt.value = "Second";
    src.value = responsive;
    await nextTick();
    expect(img.getAttribute("alt")).toBe("Second");
    expect(img.getAttribute("src")).toBe("/team-1200.webp");
    expect(img.getAttribute("sizes")).toBe("50vw");
  });

  it("priority preloads the image in <head>", () => {
    const img = render({ src: responsive, alt: "", priority: true });
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("loading")).toBe("eager");
    const link = win.document.head.querySelector('link[rel="preload"][as="image"]');
    expect(link?.getAttribute("href")).toBe("/team-1200.webp");
    expect(link?.getAttribute("imagesrcset")).toBe(responsive.srcSet);
    expect(link?.getAttribute("imagesizes")).toBe("50vw");
    render({ src: "/runtime-unique.jpg", alt: "", unoptimized: true, priority: true });
    expect(win.document.head.querySelector('link[href="/runtime-unique.jpg"]')?.hasAttribute("imagesrcset")).toBe(false);
  });

  it("removes the blur on load and calls the user's onload", () => {
    let loaded = 0;
    const img = render({ src: asset, alt: "", onload: () => loaded++ });
    expect(img.style.backgroundImage).toContain("data:image/png");
    img.dispatchEvent(new win.Event("load") as unknown as Event);
    expect(img.style.backgroundImage).toBe("none");
    expect(loaded).toBe(1);
    const plain = render({ src: "/a.svg", alt: "", unoptimized: true });
    plain.dispatchEvent(new win.Event("load") as unknown as Event);
    expect(plain.style.backgroundImage).toBe("none");
  });

  it("reports helpful errors in development only", () => {
    expect(() => render({ src: "/a.jpg", alt: "" })).not.toThrow();
    globals.__DEV__ = true;
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      container.innerHTML = "";
      mount(() => jsx(Img, { src: "/a.jpg", alt: "" }), container);
      expect(container.querySelector("img")).toBeNull();
      const reported = errors.mock.calls.flat().find((value) => value instanceof ImageUsageError);
      expect(reported).toBeInstanceOf(ImageUsageError);
      expect(String(reported)).toContain("needs `width`");
    } finally {
      errors.mockRestore();
    }
  });

  it("renders on the server without preloading", async () => {
    delete globals.window;
    delete globals.document;
    const html = await renderToString(jsx(Img, { src: asset, alt: "Shop", priority: true, sizes: "100vw" }));
    expect(html).toStartWith("<img");
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain(`srcset="${asset.srcSet}"`);
    expect(html).toContain('src="/hero-800.webp"');
    expect(html).toContain("object-fit:cover");
    expect(html).not.toContain("onload");
  });
});
