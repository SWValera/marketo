export function normalizeSourcePath(name) {
  return String(name).replaceAll("\\", "/");
}

export function hasIgnoredSourceSegment(name, ignoredSegments) {
  return normalizeSourcePath(name)
    .split("/")
    .some((segment) => ignoredSegments.has(segment));
}
