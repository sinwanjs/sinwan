import type { Stats } from "node:fs";

/**
 * Generate a weak ETag string from an `fs.Stats` object or a string/Buffer body.
 *
 * - For `Stats`: uses `mtime` + `size`.
 * - For `string | Buffer`: uses a fast hash of the content.
 */
export function etag(entity: Stats): string;
export function etag(entity: string | Buffer): string;
export function etag(entity: Stats | string | Buffer): string {
  if (isStats(entity)) {
    const mtime = entity.mtime.getTime().toString(16);
    const size = entity.size.toString(16);
    return `W/"${size}-${mtime}"`;
  }

  // String / Buffer body
  const len =
    typeof entity === "string"
      ? Buffer.byteLength(entity, "utf8")
      : entity.length;

  if (len === 0) {
    return `W/"0-0"`;
  }

  const hash = Bun.hash(entity).toString(16);
  return `W/"${len.toString(16)}-${hash}"`;
}

function isStats(obj: unknown): obj is Stats {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "mtime" in obj &&
    "size" in obj &&
    typeof (obj as Stats).mtime?.getTime === "function"
  );
}
