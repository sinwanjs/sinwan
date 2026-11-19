/**
 * Types for `<Img>` (`sinwan/image`).
 */
import type { Reactive } from "../types.ts";

/**
 * How the image fills its box.
 * - `cover`: fill the box and keep the ratio; the overflow is cropped by
 *   `object-fit: cover` (Bun.Image resizes, it does not crop pixels).
 * - `contain` / `inside`: fit within the box and keep the ratio.
 * - `fill`: stretch to the box.
 * - `outside`: cover the box and keep the ratio, without cropping.
 */
export type ImageFit = "cover" | "contain" | "fill" | "inside" | "outside";

/** Output format. `auto` is WebP at build time and `Accept`-negotiated on demand. */
export type ImageFormat = "auto" | "webp" | "avif" | "jpeg" | "png";

export type ImagePlaceholder = "blur" | "empty";

/**
 * What a static `<Img src="./hero.jpg" />` becomes after the Sinwan compiler
 * and bun-plugin-sinwan optimize it: hashed files, ready-made `srcset`, the
 * rendered size and an optional inlined blur.
 */
export interface ImageAsset {
  readonly src: string;
  readonly srcSet: string;
  readonly sizes?: string;
  /** Rendered width in CSS pixels. */
  readonly width: number;
  /** Rendered height in CSS pixels. */
  readonly height: number;
  readonly fit: ImageFit;
  readonly format: Exclude<ImageFormat, "auto">;
  /** `data:image/png;base64,…` ThumbHash blur, when `placeholder="blur"`. */
  readonly placeholder?: string;
}

export interface ImageLoaderParams {
  src: string;
  /** Width in physical pixels to produce. */
  width: number;
  quality: number;
  format?: ImageFormat;
}

/** Builds the URL of an optimized copy of a runtime `src`. */
export type ImageLoader = (params: ImageLoaderParams) => string;

/** App-wide settings for runtime (`string`) sources. */
export interface ImageRuntimeConfig {
  /** Route of the on-demand handler (`createImageHandler` from `sinwan-compiler/image`). */
  path: string;
  /** Must match the handler's `deviceSizes`. */
  deviceSizes: readonly number[];
  /** Must match the handler's `imageSizes`. */
  imageSizes: readonly number[];
  /** Default quality; must be one of the handler's `qualities`. */
  quality: number;
}

type Handler<E extends Event> = (event: E) => void;

export interface ImgProps {
  /**
   * The image. A string literal or an imported image file is optimized at
   * build time; any other string is optimized on demand through the loader.
   */
  src: Reactive<ImageAsset | string>;
  /** Required. Use `alt=""` for decorative images. */
  alt: Reactive<string>;
  /** Rendered width in CSS pixels. Required for runtime sources unless `fill`. */
  width?: Reactive<number>;
  /** Rendered height in CSS pixels. */
  height?: Reactive<number>;
  /** Encoder quality, 1–100 (default 75). Static for build-time images. */
  quality?: number;
  format?: ImageFormat;
  fit?: ImageFit;
  /** Width / height ratio: `1.5`, `"3/2"` or `"3:2"`; reserves the box with `aspect-ratio`. */
  aspectRatio?: number | string;
  /** `sizes` attribute: switches `srcset` to width descriptors. */
  sizes?: string;
  /** Densities for `x` descriptors when `sizes` is not set (default `[1, 2]`). */
  densities?: readonly number[];
  /** `blur` paints a low-quality preview behind the image until it loads. */
  placeholder?: ImagePlaceholder;
  /** Blur preview for runtime sources (static ones get one generated). */
  blurDataURL?: string;
  /** Above-the-fold image: eager, `fetchpriority="high"` and preloaded. */
  priority?: boolean;
  /** Default `"lazy"` (ignored with `priority`). */
  loading?: "lazy" | "eager";
  /** Default `"async"`. */
  decoding?: "async" | "auto" | "sync";
  fetchPriority?: "high" | "low" | "auto";
  /** Fill the positioned parent (absolute, 100% × 100%); width and height become optional. */
  fill?: boolean;
  /** Render `src` as is: no optimization, no `srcset`. */
  unoptimized?: boolean;
  /** Custom URL builder for runtime sources (CDN, existing API). */
  loader?: ImageLoader;
  id?: Reactive<string>;
  class?: Reactive<string>;
  style?: Reactive<string | Record<string, string | number | null | undefined>>;
  title?: Reactive<string>;
  crossOrigin?: "anonymous" | "use-credentials" | "";
  referrerPolicy?: string;
  onload?: Handler<Event>;
  onerror?: Handler<Event>;
  ref?: unknown;
  role?: string;
  tabIndex?: number;
  [aria: `aria-${string}`]: Reactive<string | boolean | undefined>;
  [data: `data-${string}`]: Reactive<string | number | boolean | undefined>;
}

/** Plain `<img>` attributes computed for an `<Img>`. */
export interface ImgAttributes {
  src: string;
  srcset?: string;
  sizes?: string;
  alt: string;
  width?: number;
  height?: number;
  loading: "lazy" | "eager";
  decoding: "async" | "auto" | "sync";
  fetchpriority?: "high" | "low" | "auto";
  style?: string;
}
