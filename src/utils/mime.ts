const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  // Text
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".xhtml": "application/xhtml+xml",
  ".ics": "text/calendar",
  ".md": "text/markdown",

  // JavaScript / TypeScript / JSON
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".ts": "application/typescript",
  ".json": "application/json",
  ".jsonld": "application/ld+json",
  ".map": "application/json",

  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".apng": "image/apng",

  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",

  // Audio
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".weba": "audio/webm",
  ".mid": "audio/midi",
  ".midi": "audio/midi",

  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
  ".3gp": "video/3gpp",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".rtf": "application/rtf",

  // Archives
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".bz2": "application/x-bzip2",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",

  // WebAssembly
  ".wasm": "application/wasm",

  // Manifest / PWA
  ".webmanifest": "application/manifest+json",
  ".manifest": "text/cache-manifest",

  // Misc
  ".bin": "application/octet-stream",
  ".exe": "application/octet-stream",
  ".dll": "application/octet-stream",
  ".dmg": "application/octet-stream",
  ".iso": "application/octet-stream",
  ".sh": "application/x-sh",
  ".php": "application/x-httpd-php",
  ".swf": "application/x-shockwave-flash",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".toml": "application/toml",
});

/**
 * Look up the MIME type for a given file path or extension.
 *
 * @param pathOrExt – A file path (`"index.html"`) or extension (`".html"`)
 * @returns The MIME type string, or `false` if not found (same contract as `mime-types`).
 */
export function lookup(pathOrExt: string): string | false {
  // Extract the extension from the path
  const dotIndex = pathOrExt.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const ext = pathOrExt.slice(dotIndex).toLowerCase();
  return MIME_TYPES[ext] || false;
}
