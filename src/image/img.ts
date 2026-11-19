/**
 * `<Img>` — an `<img>` with Bun-native optimization behind it.
 *
 * - Static sources (`src="./hero.jpg"` or an imported image file) are
 *   rewritten by the Sinwan compiler and optimized by bun-plugin-sinwan at
 *   build time into hashed WebP/AVIF/JPEG/PNG files with a ready `srcset`.
 * - Runtime sources (`src={url}`) get a `srcset` from the loader, pointing at
 *   the on-demand handler (`createImageHandler` from `sinwan-compiler/image`).
 *
 * Bun only: compiling `<Img>` for Vite or another host fails with a clear
 * error. This component itself is plain DOM and adds no runtime dependency.
 */
import type { SinwanElement } from "../types.ts";
import { computed } from "../reactivity/computed.ts";
import { resolve } from "../reactivity/index.ts";
import { preload } from "../react/resource-hints.ts";
import { isServer } from "../react/_internal/is-server.ts";
import { getImageProps, type ResolvedImgProps } from "./props.ts";
import type { ImgAttributes, ImgProps } from "./types.ts";

/** `<Img>` props that are consumed rather than passed to the `<img>`. */
const OWN_PROPS = new Set<string>([
  "src",
  "alt",
  "width",
  "height",
  "quality",
  "format",
  "fit",
  "aspectRatio",
  "sizes",
  "densities",
  "placeholder",
  "blurDataURL",
  "priority",
  "loading",
  "decoding",
  "fetchPriority",
  "fill",
  "unoptimized",
  "loader",
  "style",
  "crossOrigin",
  "referrerPolicy",
  "onload",
]);

function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

/** Reads the data props (reactive values resolved); handlers and the loader are kept as given. */
function readProps(props: ImgProps): ResolvedImgProps {
  return {
    src: resolve(props.src),
    alt: resolve(props.alt),
    width: resolve(props.width),
    height: resolve(props.height),
    style: resolve(props.style),
    quality: props.quality,
    format: props.format,
    fit: props.fit,
    aspectRatio: props.aspectRatio,
    sizes: props.sizes,
    densities: props.densities,
    placeholder: props.placeholder,
    blurDataURL: props.blurDataURL,
    priority: props.priority,
    loading: props.loading,
    decoding: props.decoding,
    fetchPriority: props.fetchPriority,
    fill: props.fill,
    unoptimized: props.unoptimized,
    loader: props.loader,
  };
}

/**
 * Renders an optimized image. See {@link ImgProps} for every option.
 *
 * @example
 * ```tsx
 * import { Img } from "sinwan/image";
 *
 * <Img src="./hero.jpg" alt="Our shop" width={1200} height={800} priority placeholder="blur" />
 * <Img src="/photos/team.jpg" alt="" sizes="(min-width: 1024px) 50vw, 100vw" />
 * <Img src={product.photoUrl} alt={product.name} width={160} height={160} />
 * ```
 */
export function Img(props: ImgProps): SinwanElement {
  const dev = isDev();
  const attributes = computed(() => getImageProps(readProps(props), dev));
  const attribute = <K extends keyof ImgAttributes>(key: K) => computed(() => attributes.value[key]);

  if (props.priority && !isServer()) {
    const first = attributes.value;
    preload(first.src, {
      as: "image",
      fetchPriority: "high",
      ...(first.srcset === undefined ? {} : { imageSrcSet: first.srcset }),
      ...(first.sizes === undefined ? {} : { imageSizes: first.sizes }),
    });
  }

  const passthrough: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!OWN_PROPS.has(key)) passthrough[key] = Reflect.get(props, key);
  }

  const userOnload = props.onload;
  // Drop the blur once the real image is painted (it would show through transparent pixels).
  const onload = (event: Event) => {
    const target = event.currentTarget;
    if (target !== null && typeof target === "object" && "style" in target && target.style instanceof Object) {
      Reflect.set(target.style, "backgroundImage", "none");
    }
    userOnload?.(event);
  };

  return {
    tag: "img",
    // Order matters: `loading`, `sizes` and `srcset` must be set before `src`.
    props: {
      loading: attribute("loading"),
      decoding: attribute("decoding"),
      fetchpriority: attribute("fetchpriority"),
      sizes: attribute("sizes"),
      srcset: attribute("srcset"),
      src: attribute("src"),
      alt: attribute("alt"),
      width: attribute("width"),
      height: attribute("height"),
      style: attribute("style"),
      crossorigin: props.crossOrigin,
      referrerpolicy: props.referrerPolicy,
      ...passthrough,
      onload,
    },
    children: [],
  };
}
