/**
 * Pure attribute computation for `<Img>`: turns resolved props into plain
 * `<img>` attributes. Shared by the component and by `getImageProps` (for
 * `<picture>` or CSS backgrounds).
 */
import type {
  ImageAsset,
  ImageFit,
  ImageLoader,
  ImageRuntimeConfig,
  ImgAttributes,
  ImgProps,
} from "./types.ts";

export const DEFAULT_IMAGE_CONFIG: ImageRuntimeConfig = Object.freeze({
  path: "/_sinwan/image",
  deviceSizes: Object.freeze([640, 750, 828, 1080, 1200, 1920, 2048, 3840]),
  imageSizes: Object.freeze([16, 32, 48, 64, 96, 128, 256, 384]),
  quality: 75,
});

let config: ImageRuntimeConfig = DEFAULT_IMAGE_CONFIG;

/**
 * Sets the on-demand route and sizes used by runtime sources. Call once at
 * startup with the same values as `createImageHandler`.
 */
export function configureImages(next: Partial<ImageRuntimeConfig>): void {
  config = Object.freeze({ ...config, ...next });
}

/** Current runtime image settings. */
export function getImageConfig(): ImageRuntimeConfig {
  return config;
}

/** Restores the defaults (tests). */
export function resetImageConfig(): void {
  config = DEFAULT_IMAGE_CONFIG;
}

/** `<path>?url=…&w=…&q=…[&f=…]` on the configured handler route. */
export const defaultLoader: ImageLoader = ({ src, width, quality, format }) => {
  const query = `url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
  return `${config.path}?${query}${format && format !== "auto" ? `&f=${format}` : ""}`;
};

/** Thrown in development for an `<Img>` that cannot render correctly. */
export class ImageUsageError extends Error {
  override name = "ImageUsageError";

  constructor(message: string) {
    super(`[sinwan/image] ${message}`);
  }
}

/** Data props after reactive values are read. */
export type ResolvedImgProps = Omit<ImgProps, "src" | "alt" | "width" | "height" | "id" | "class" | "style" | "title"> & {
  src: ImageAsset | string;
  alt: string | undefined;
  width?: number;
  height?: number;
  style?: string | Record<string, string | number | null | undefined>;
};

function isAsset(src: ImageAsset | string): src is ImageAsset {
  return typeof src === "object" && src !== null && typeof src.src === "string";
}

const OBJECT_FIT: Record<ImageFit, string> = {
  cover: "cover",
  outside: "cover",
  contain: "contain",
  inside: "contain",
  fill: "fill",
};

function aspectRatioCss(value: number | string): string {
  return typeof value === "number" ? String(value) : value.replace(":", "/");
}

function kebab(key: string): string {
  return key.includes("-") ? key : key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function styleText(style: ResolvedImgProps["style"]): string {
  if (style === undefined || style === null) return "";
  if (typeof style === "string") return style.trim().replace(/;$/, "");
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value !== null && value !== undefined) parts.push(`${kebab(key)}:${value}`);
  }
  return parts.join(";");
}

/** The smallest allowed width ≥ `target`, else the largest. */
function allowedWidth(target: number, widths: readonly number[]): number {
  return widths.find((width) => width >= target) ?? widths[widths.length - 1] ?? target;
}

function runtimeSrcSet(src: string, props: ResolvedImgProps): Pick<ImgAttributes, "src" | "srcset" | "sizes"> {
  const loader = props.loader ?? defaultLoader;
  const quality = props.quality ?? config.quality;
  const format = props.format;
  const sizes = props.sizes ?? (props.fill ? "100vw" : undefined);
  if (sizes !== undefined || props.width === undefined) {
    const widths = [...config.deviceSizes];
    const largest = widths[widths.length - 1] ?? 1080;
    return {
      src: loader({ src, width: largest, quality, format }),
      srcset: widths.map((width) => `${loader({ src, width, quality, format })} ${width}w`).join(", "),
      sizes: sizes ?? "100vw",
    };
  }
  const all = [...new Set([...config.imageSizes, ...config.deviceSizes])].sort((a, b) => a - b);
  const seen = new Set<number>();
  const entries: string[] = [];
  let fallback = "";
  for (const density of props.densities ?? [1, 2]) {
    const width = allowedWidth(Math.ceil(props.width * density), all);
    if (seen.has(width)) continue;
    seen.add(width);
    const url = loader({ src, width, quality, format });
    if (fallback === "") fallback = url;
    entries.push(`${url} ${density}x`);
  }
  return { src: fallback, srcset: entries.join(", ") };
}

/**
 * Plain `<img>` attributes for `props`. In development, throws
 * {@link ImageUsageError} for a missing `alt`, or a runtime source with
 * neither `width` nor `fill`.
 */
export function getImageProps(props: ResolvedImgProps, dev = false): ImgAttributes {
  const { src } = props;
  if (dev) {
    if (props.alt === undefined) {
      throw new ImageUsageError('<Img> needs `alt` text (use alt="" for a decorative image).');
    }
    if (!isAsset(src) && !props.unoptimized && !props.fill && props.width === undefined) {
      throw new ImageUsageError(
        `<Img src="${src}"> is optimized at runtime and needs \`width\` (CSS pixels) or \`fill\`, so the right file size can be chosen.`,
      );
    }
    if (props.placeholder === "blur" && !isAsset(src) && props.blurDataURL === undefined) {
      throw new ImageUsageError('<Img placeholder="blur"> with a runtime source needs `blurDataURL`.');
    }
  }

  const attributes: ImgAttributes = {
    src: "",
    alt: props.alt ?? "",
    loading: props.priority ? "eager" : (props.loading ?? "lazy"),
    decoding: props.decoding ?? "async",
  };
  const fetchPriority = props.priority ? "high" : props.fetchPriority;
  if (fetchPriority !== undefined) attributes.fetchpriority = fetchPriority;

  let fit: ImageFit | undefined = props.fit;
  let placeholder: string | undefined = props.blurDataURL;
  if (isAsset(src)) {
    attributes.src = src.src;
    attributes.srcset = src.srcSet;
    const sizes = props.sizes ?? src.sizes;
    if (sizes !== undefined) attributes.sizes = sizes;
    attributes.width = props.width ?? src.width;
    attributes.height = props.height ?? src.height;
    fit ??= src.fit;
    if (props.placeholder !== "empty") placeholder ??= src.placeholder;
  } else if (props.unoptimized) {
    attributes.src = src;
    if (props.width !== undefined) attributes.width = props.width;
    if (props.height !== undefined) attributes.height = props.height;
  } else {
    Object.assign(attributes, runtimeSrcSet(src, props));
    if (props.width !== undefined) attributes.width = props.width;
    if (props.height !== undefined) attributes.height = props.height;
  }
  if (props.placeholder === "empty") placeholder = undefined;

  const style: string[] = [];
  if (props.fill) {
    delete attributes.width;
    delete attributes.height;
    style.push("position:absolute", "inset:0", "width:100%", "height:100%");
  } else if (attributes.sizes !== undefined) {
    // Responsive (`sizes`) images follow their container, not their intrinsic width.
    style.push("max-width:100%", "height:auto");
  }
  if (fit !== undefined) style.push(`object-fit:${OBJECT_FIT[fit]}`);
  if (props.aspectRatio !== undefined) style.push(`aspect-ratio:${aspectRatioCss(props.aspectRatio)}`);
  if (placeholder !== undefined) {
    style.push(`background-image:url("${placeholder}")`, "background-size:cover", "background-position:center", "background-repeat:no-repeat");
  }
  const own = styleText(props.style);
  if (own !== "") style.push(own);
  if (style.length > 0) attributes.style = style.join(";");
  return attributes;
}
