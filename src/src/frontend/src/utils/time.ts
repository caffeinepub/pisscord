export function formatDistanceToNow(timestamp: bigint): string {
  const ms = Number(timestamp / BigInt(1_000_000));
  const now = Date.now();
  const diff = now - ms;

  if (diff < 0) return "just now";
  if (diff < 60_000) return "just now";
  if (diff < 86_400_000) {
    return `Today at ${formatTime(ms)}`;
  }
  if (diff < 172_800_000) {
    return `Yesterday at ${formatTime(ms)}`;
  }
  return formatDate(ms);
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
