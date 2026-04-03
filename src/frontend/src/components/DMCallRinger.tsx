import { Phone, PhoneOff } from "lucide-react";
import { motion } from "motion/react";

interface Props {
  dmChannelId: string;
  callerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60];
  return `oklch(0.55 0.20 ${hues[Math.abs(hash) % hues.length]})`;
}

export default function DMCallRinger({
  callerName,
  onAccept,
  onDecline,
}: Props) {
  return (
    <motion.div
      initial={{ y: "-100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "-100%", opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 200 }}
      className="fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm"
      data-ocid="dm.ringer.modal"
    >
      <div
        className="bg-dc-sidebar border border-black/30 border-t-0 rounded-b-2xl shadow-2xl px-6 py-5 flex flex-col items-center gap-4"
        style={{
          animation: "ringerPulse 1.8s ease-in-out infinite",
        }}
      >
        {/* Avatar */}
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{
            duration: 1.5,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-4 ring-green-500/50"
          style={{ backgroundColor: getAvatarColor(callerName) }}
        >
          {callerName.charAt(0).toUpperCase()}
        </motion.div>

        {/* Label */}
        <div className="text-center">
          <p className="text-dc-primary font-semibold text-base leading-tight">
            {callerName}
          </p>
          <p className="text-dc-muted text-sm mt-0.5">is calling you...</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            data-ocid="dm.ringer.decline_button"
            onClick={onDecline}
            className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors shadow-lg"
            title="Decline"
          >
            <PhoneOff size={20} className="text-white" />
          </button>
          <button
            type="button"
            data-ocid="dm.ringer.confirm_button"
            onClick={onAccept}
            className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors shadow-lg"
            title="Accept"
          >
            <Phone size={20} className="text-white" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ringerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
          50% { box-shadow: 0 0 0 8px rgba(34,197,94,0.12); }
        }
      `}</style>
    </motion.div>
  );
}
