export function mergeRetainedSnapshots(existing, incoming, now, retentionMs) {
  return [...existing, ...incoming]
    .filter((snapshot) => snapshot.captured_at_epoch_ms >= now - retentionMs)
    .sort((left, right) => left.captured_at_epoch_ms - right.captured_at_epoch_ms);
}

export function selectComparisonBaseline(
  snapshots,
  current,
  targetMs,
  toleranceMs,
  maxFallbackAgeMs = 0,
) {
  if (!current) return null;
  const prior = snapshots.filter(
    (snapshot) => snapshot !== current && snapshot.captured_at_epoch_ms < current.captured_at_epoch_ms,
  );
  const target = current.captured_at_epoch_ms - targetMs;
  const nearest = prior.reduce((best, snapshot) => {
    const distance = Math.abs(snapshot.captured_at_epoch_ms - target);
    if (distance > toleranceMs || (best && best.distance <= distance)) return best;
    return { snapshot, distance };
  }, null);
  if (nearest) return nearest.snapshot;
  if (maxFallbackAgeMs <= 0) return null;
  return [...prior].reverse().find(
    (snapshot) => current.captured_at_epoch_ms - snapshot.captured_at_epoch_ms <= maxFallbackAgeMs,
  ) ?? null;
}
