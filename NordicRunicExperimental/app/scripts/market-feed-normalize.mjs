export function normalizePoeNinjaAssetUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("/gen/image/")) {
    return `https://web.poecdn.com${trimmed}`;
  }
  if (trimmed.startsWith("https://assets.poe.ninja/gen/image/")) {
    return trimmed.replace("https://assets.poe.ninja", "https://web.poecdn.com");
  }
  return trimmed;
}
