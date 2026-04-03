import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useCreateServer } from "../hooks/useQueries";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: bigint) => void;
}

export default function CreateServerModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const { mutate, isPending } = useCreateServer();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutate(name.trim(), {
      onSuccess: (id) => {
        setName("");
        onCreated?.(id);
        onClose();
      },
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          data-ocid="create_server.modal"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-dc-sidebar rounded-lg w-full max-w-sm shadow-2xl overflow-hidden"
          >
            <div className="relative">
              <div className="h-32 bg-dc-blurple" />
              <button
                type="button"
                data-ocid="create_server.close_button"
                onClick={onClose}
                className="absolute top-4 right-4 text-white/80 hover:text-white"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pb-6">
              <h2 className="text-xl font-bold text-dc-primary mb-1 mt-4 text-center">
                Create Your Server
              </h2>
              <p className="text-dc-secondary text-sm text-center mb-6">
                Give your server a name and start chatting.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="server-name-input"
                    className="block text-xs font-bold text-dc-secondary uppercase tracking-wide mb-2"
                  >
                    Server Name
                  </label>
                  <input
                    id="server-name-input"
                    data-ocid="create_server.input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Server"
                    maxLength={100}
                    className="w-full px-3 py-2 bg-dc-chat text-dc-primary rounded border border-dc-serverbar placeholder-dc-muted focus:outline-none focus:ring-2 focus:ring-dc-blurple text-sm"
                  />
                </div>
                <button
                  data-ocid="create_server.submit_button"
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="w-full py-2 bg-dc-blurple text-white font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isPending ? "Creating..." : "Create Server"}
                </button>
                <button
                  data-ocid="create_server.cancel_button"
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 text-dc-secondary hover:text-dc-primary text-sm transition-colors"
                >
                  Back
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
