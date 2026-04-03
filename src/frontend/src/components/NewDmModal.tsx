import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Search, Users } from "lucide-react";
import { useState } from "react";
import { useAllUsers } from "../hooks/useQueries";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectUsers: (principals: string[]) => void;
  myPrincipal: string | null;
}

function getAvatarColor(principal: string) {
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60];
  return `oklch(0.55 0.20 ${hues[Math.abs(hash) % hues.length]})`;
}

export default function NewDmModal({
  open,
  onClose,
  onSelectUsers,
  myPrincipal,
}: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: allUsers = [], isLoading } = useAllUsers();

  const filtered = allUsers.filter(([principal, profile]) => {
    const principalStr = principal.toString();
    if (principalStr === myPrincipal) return false;
    const term = search.toLowerCase();
    return (
      profile.name.toLowerCase().includes(term) ||
      principalStr.toLowerCase().includes(term)
    );
  });

  const toggleUser = (principalStr: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(principalStr)) {
        next.delete(principalStr);
      } else {
        next.add(principalStr);
      }
      return next;
    });
  };

  const handleStart = () => {
    if (selected.size === 0) return;
    onSelectUsers(Array.from(selected));
    onClose();
    setSearch("");
    setSelected(new Set());
  };

  const handleClose = () => {
    onClose();
    setSearch("");
    setSelected(new Set());
  };

  const selectedCount = selected.size;
  const isGroup = selectedCount > 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        className="bg-dc-sidebar border-dc-serverbar text-dc-primary max-w-md"
        data-ocid="dm.new_chat.dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-dc-primary text-lg font-bold">
            {isGroup ? "Create Group Conversation" : "Open a Conversation"}
          </DialogTitle>
        </DialogHeader>

        {/* Selected count badge */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-dc-blurple/20 rounded text-sm">
            <Users size={14} className="text-dc-blurple" />
            <span className="text-dc-primary">
              {selectedCount} user{selectedCount !== 1 ? "s" : ""} selected
              {isGroup ? " (Group DM)" : " (Direct Message)"}
            </span>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 bg-dc-chat rounded px-3 py-2">
          <Search size={16} className="text-dc-muted flex-shrink-0" />
          <input
            data-ocid="dm.new_chat.search_input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            // biome-ignore lint/a11y/noAutofocus: intended UX
            autoFocus
            className="flex-1 bg-transparent text-dc-primary placeholder-dc-muted focus:outline-none text-sm"
          />
        </div>

        {/* User list */}
        <div className="max-h-72 overflow-y-auto -mx-1">
          {isLoading && (
            <div
              className="flex items-center justify-center py-8"
              data-ocid="dm.new_chat.loading_state"
            >
              <div className="w-5 h-5 border-2 border-dc-blurple border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div
              className="py-8 text-center"
              data-ocid="dm.new_chat.empty_state"
            >
              <p className="text-dc-muted text-sm">
                {search ? "No users found." : "No other users registered yet."}
              </p>
            </div>
          )}

          {filtered.map(([principal, profile], idx) => {
            const principalStr = principal.toString();
            const name = profile.name || `${principalStr.slice(0, 8)}...`;
            const isSelected = selected.has(principalStr);
            return (
              <button
                type="button"
                key={principalStr}
                data-ocid={`dm.new_chat.item.${idx + 1}`}
                onClick={() => toggleUser(principalStr)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors ${
                  isSelected
                    ? "bg-dc-blurple/20 hover:bg-dc-blurple/30"
                    : "hover:bg-dc-channelhover"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: getAvatarColor(principalStr) }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-dc-primary truncate">
                    {name}
                  </p>
                  <p className="text-xs text-dc-muted truncate">
                    {principalStr.slice(0, 20)}...
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? "bg-dc-blurple border-dc-blurple"
                      : "border-dc-muted"
                  }`}
                >
                  {isSelected && <Check size={12} className="text-white" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Start button */}
        <button
          type="button"
          data-ocid="dm.new_chat.submit_button"
          onClick={handleStart}
          disabled={selectedCount === 0}
          className="w-full py-2.5 bg-dc-blurple hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded transition-opacity text-sm"
        >
          {selectedCount === 0
            ? "Select at least 1 user"
            : isGroup
              ? `Create Group DM (${selectedCount} people)`
              : "Open Direct Message"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
