import { Hash, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  useAllServers,
  useJoinServer,
  useUserServers,
} from "../hooks/useQueries";

interface Props {
  open: boolean;
  onClose: () => void;
  onJoined?: (id: bigint) => void;
}

export default function BrowseServersModal({ open, onClose, onJoined }: Props) {
  const { data: allServers = [] } = useAllServers();
  const { data: userServers = [] } = useUserServers();
  const { mutate: joinServer, isPending } = useJoinServer();

  const joinedIds = new Set(userServers.map((s) => s.id.toString()));

  const handleJoin = (serverId: bigint, serverName: string) => {
    joinServer(serverId, {
      onSuccess: () => {
        toast.success(`Joined ${serverName}!`);
        onJoined?.(serverId);
      },
      onError: () => {
        toast.error("Failed to join server");
      },
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          data-ocid="browse_servers.modal"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-dc-sidebar rounded-lg w-full max-w-lg shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-dc-serverbar">
              <h2 className="text-xl font-bold text-dc-primary">
                Discover Servers
              </h2>
              <button
                type="button"
                data-ocid="browse_servers.close_button"
                onClick={onClose}
                className="text-dc-secondary hover:text-dc-primary transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {allServers.length === 0 && (
                <div
                  className="text-center py-16"
                  data-ocid="browse_servers.empty_state"
                >
                  <p className="text-dc-secondary">
                    No servers found. Be the first to create one!
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3">
                {allServers.map((server, idx) => {
                  const isJoined = joinedIds.has(server.id.toString());
                  return (
                    <div
                      key={server.id.toString()}
                      data-ocid={`browse_servers.item.${idx + 1}`}
                      className="flex items-center gap-4 p-4 bg-dc-chat rounded-lg hover:bg-dc-hover transition-colors"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                        style={{
                          backgroundColor: `oklch(0.55 0.20 ${(server.id.toString().charCodeAt(0) * 37) % 360})`,
                        }}
                      >
                        {server.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-dc-primary">
                          {server.name}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-dc-secondary mt-0.5">
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {server.members.length} members
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash size={12} />
                            {server.channels.length} channels
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-ocid={`browse_servers.join_button.${idx + 1}`}
                        onClick={() => handleJoin(server.id, server.name)}
                        disabled={isJoined || isPending}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                          isJoined
                            ? "bg-dc-active text-dc-muted cursor-default"
                            : "bg-dc-blurple text-white hover:opacity-90"
                        }`}
                      >
                        {isJoined ? "Joined" : "Join"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
