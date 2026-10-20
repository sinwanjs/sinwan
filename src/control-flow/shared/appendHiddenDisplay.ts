/** Append `display:none` to a CSS style string (Visible string-style path). */
export function appendHiddenDisplay(style: string): string {
  const trimmed = style.trim();
  const separator = trimmed.length > 0 && !trimmed.endsWith(";") ? ";" : "";
  return `${trimmed}${separator}display:none`;
}
