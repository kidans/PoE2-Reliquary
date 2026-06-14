export function mergeRetainedSnapshots(existing, incoming, now, retentionMs) {
  return [...existing, ...incoming]
    .filter((snapshot) => snapshot.captured_at_epoch_ms >= now - retentionMs)
    .sort((left, right) => left.captured_at_epoch_ms - right.captured_at_epoch_ms);
}
