/**
 * `sinwan/image` — `<Img>`, Bun-native image optimization.
 *
 * Static sources are optimized at build time by the Sinwan compiler with
 * bun-plugin-sinwan; runtime sources go through the on-demand handler
 * (`createImageHandler` from `sinwan-compiler/image`). Bun only.
 */
export { Img } from "./img.ts";
export {
  DEFAULT_IMAGE_CONFIG,
  ImageUsageError,
  configureImages,
  defaultLoader,
  getImageConfig,
  getImageProps,
  type ResolvedImgProps,
} from "./props.ts";
export type {
  ImageAsset,
  ImageFit,
  ImageFormat,
  ImageLoader,
  ImageLoaderParams,
  ImagePlaceholder,
  ImageRuntimeConfig,
  ImgAttributes,
  ImgProps,
} from "./types.ts";
