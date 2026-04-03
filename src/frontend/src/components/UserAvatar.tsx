interface Props {
  principal: string;
  name: string;
  photoUrl?: string | null;
  size?: number;
  className?: string;
  isMe?: boolean;
}

function getAvatarColor(principal: string, isMe?: boolean): string {
  if (isMe) return "oklch(0.55 0.22 264)";
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60, 180, 310];
  const hue = hues[Math.abs(hash) % hues.length];
  return `oklch(0.55 0.20 ${hue})`;
}

export default function UserAvatar({
  principal,
  name,
  photoUrl,
  size = 32,
  className = "",
  isMe,
}: Props) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: getAvatarColor(principal, isMe),
        fontSize: Math.max(10, Math.floor(size * 0.4)),
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
