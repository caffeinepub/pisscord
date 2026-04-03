import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Compass, MessageCircle, Plus } from "lucide-react";
import { motion } from "motion/react";
import type { Server } from "../backend";

const SERVER_COLORS = [
  "oklch(0.55 0.22 264)",
  "oklch(0.55 0.20 145)",
  "oklch(0.55 0.20 30)",
  "oklch(0.55 0.20 340)",
  "oklch(0.55 0.20 200)",
  "oklch(0.55 0.20 60)",
];

function getServerColor(id: bigint) {
  return SERVER_COLORS[Number(id % BigInt(SERVER_COLORS.length))];
}

interface Props {
  servers: Server[];
  activeServerId: bigint | null;
  onSelectServer: (id: bigint) => void;
  onCreateServer: () => void;
  onBrowseServers: () => void;
  onOpenDMs: () => void;
  isDmActive: boolean;
}

export default function ServerBar({
  servers,
  activeServerId,
  onSelectServer,
  onCreateServer,
  onBrowseServers,
  onOpenDMs,
  isDmActive,
}: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col items-center gap-2 w-[72px] min-w-[72px] bg-dc-serverbar py-3 overflow-y-auto">
        {/* Home / DMs button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-ocid="server.home_button"
              onClick={onOpenDMs}
              className={`relative w-12 h-12 flex items-center justify-center text-white font-bold text-lg transition-all duration-200 ${
                isDmActive
                  ? "rounded-[30%] bg-dc-blurple"
                  : "rounded-[50%] hover:rounded-[30%] bg-dc-blurple"
              }`}
            >
              {isDmActive && (
                <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-8 bg-white rounded-r-full" />
              )}
              <MessageCircle size={22} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Direct Messages</TooltipContent>
        </Tooltip>

        <div className="w-8 h-[2px] bg-dc-sidebar rounded-full" />

        {servers.map((server, idx) => (
          <Tooltip key={server.id.toString()}>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                data-ocid={`server.item.${idx + 1}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelectServer(server.id)}
                className={`relative w-12 h-12 flex items-center justify-center text-white font-bold text-base transition-all duration-200 ${
                  activeServerId === server.id
                    ? "rounded-[30%]"
                    : "rounded-[50%] hover:rounded-[30%]"
                }`}
                style={{ backgroundColor: getServerColor(server.id) }}
              >
                {activeServerId === server.id && (
                  <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-8 bg-white rounded-r-full" />
                )}
                {server.name.charAt(0).toUpperCase()}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right">{server.name}</TooltipContent>
          </Tooltip>
        ))}

        <div className="w-8 h-[2px] bg-dc-sidebar rounded-full" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-ocid="server.create_button"
              onClick={onCreateServer}
              className="w-12 h-12 rounded-[50%] hover:rounded-[30%] bg-dc-sidebar hover:bg-green-600 flex items-center justify-center text-green-500 hover:text-white transition-all duration-200"
              aria-label="Create Server"
            >
              <Plus size={20} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Create Server</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-ocid="server.browse_button"
              onClick={onBrowseServers}
              className="w-12 h-12 rounded-[50%] hover:rounded-[30%] bg-dc-sidebar hover:bg-dc-blurple flex items-center justify-center text-dc-secondary hover:text-white transition-all duration-200"
              aria-label="Browse Servers"
            >
              <Compass size={20} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Browse Servers</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
