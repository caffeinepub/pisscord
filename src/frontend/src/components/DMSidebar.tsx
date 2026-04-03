import { MessageSquare, Plus, Search, Settings, Users } from "lucide-react";
import { useState } from "react";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useProfilePhoto } from "../hooks/useProfilePhoto";
import { useMyConversations, useMyGroupDMs } from "../hooks/useQueries";
import SettingsModal from "./SettingsModal";
import UserAvatar from "./UserAvatar";

interface Props {
  myPrincipal: string | null;
  memberNames: Record<string, string>;
  activeDmPrincipal: string | null;
  activeGroupId: string | null;
  onSelectDm: (principal: string) => void;
  onSelectGroup: (groupId: string) => void;
  onOpenNewDm: () => void;
  onOpenSettings: () => void;
}

function getAvatarColor(principal: string) {
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60];
  return `oklch(0.55 0.20 ${hues[Math.abs(hash) % hues.length]})`;
}

export default function DMSidebar({
  myPrincipal,
  memberNames,
  activeDmPrincipal,
  activeGroupId,
  onSelectDm,
  onSelectGroup,
  onOpenNewDm,
}: Props) {
  const { data: conversations = [] } = useMyConversations();
  const { data: groupDMs = [] } = useMyGroupDMs();
  const [showSettings, setShowSettings] = useState(false);
  const [conversationFilter, setConversationFilter] = useState("");
  const { identity } = useInternetIdentity();
  const { actor } = useActor();
  const { photoUrl, savePhoto, clearPhoto } = useProfilePhoto(
    actor,
    myPrincipal,
  );
  const myName =
    memberNames[myPrincipal || ""] ||
    identity?.getPrincipal().toString().slice(0, 8) ||
    "You";

  type ConvEntry =
    | { type: "dm"; principal: string; preview: string; timestamp: bigint }
    | {
        type: "group";
        groupId: string;
        name: string;
        preview: string;
        timestamp: bigint;
      };

  const entries: ConvEntry[] = [
    ...conversations.map(([principal, messages]) => {
      const lastMsg = messages[messages.length - 1];
      return {
        type: "dm" as const,
        principal: principal.toString(),
        preview: lastMsg
          ? lastMsg.content.length > 28
            ? `${lastMsg.content.slice(0, 28)}\u2026`
            : lastMsg.content
          : "No messages yet",
        timestamp: lastMsg?.timestamp ?? 0n,
      };
    }),
    ...groupDMs.map((group) => {
      const memberList = group.members
        .filter((m) => m.toString() !== myPrincipal)
        .map(
          (m) => memberNames[m.toString()] || `${m.toString().slice(0, 6)}...`,
        )
        .join(", ");
      const displayName = group.name || memberList || "Group";
      return {
        type: "group" as const,
        groupId: group.id.toString(),
        name: displayName,
        preview: "Group conversation",
        timestamp: group.timestamp,
      };
    }),
  ];

  entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));

  // Apply conversation filter
  const filterLower = conversationFilter.toLowerCase();
  const filteredEntries = filterLower
    ? entries.filter((entry) => {
        if (entry.type === "dm") {
          const name =
            memberNames[entry.principal] || `${entry.principal.slice(0, 8)}...`;
          return name.toLowerCase().includes(filterLower);
        }
        return entry.name.toLowerCase().includes(filterLower);
      })
    : entries;

  return (
    <>
      <div className="w-60 min-w-60 bg-dc-sidebar flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-dc-serverbar shadow-sm flex-shrink-0">
          <span className="font-semibold text-dc-primary text-sm truncate">
            Direct Messages
          </span>
          <button
            type="button"
            data-ocid="dm.open_modal_button"
            onClick={onOpenNewDm}
            title="New conversation"
            className="text-dc-secondary hover:text-dc-primary transition-colors"
            aria-label="Start new conversation"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Search filter */}
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center gap-1.5 bg-dc-chat rounded px-2 py-1">
            <Search size={12} className="text-dc-muted flex-shrink-0" />
            <input
              data-ocid="dm.search_input"
              type="text"
              value={conversationFilter}
              onChange={(e) => setConversationFilter(e.target.value)}
              placeholder="Find a conversation..."
              className="flex-1 bg-transparent text-xs text-dc-primary placeholder-dc-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          <div className="px-2 py-1 mb-1">
            <span className="text-xs font-bold text-dc-secondary uppercase tracking-wide">
              Conversations
            </span>
          </div>

          {filteredEntries.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-8 px-4 text-center"
              data-ocid="dm.empty_state"
            >
              <MessageSquare size={32} className="text-dc-muted mb-2" />
              <p className="text-dc-muted text-xs">
                {filterLower
                  ? "No conversations match your search."
                  : "No conversations yet. Click + to start one!"}
              </p>
            </div>
          )}

          {filteredEntries.map((entry, idx) => {
            if (entry.type === "dm") {
              const { principal, preview } = entry;
              const name =
                memberNames[principal] || `${principal.slice(0, 8)}...`;
              const isActive =
                activeDmPrincipal === principal && !activeGroupId;

              return (
                <button
                  type="button"
                  key={`dm-${principal}`}
                  data-ocid={`dm.item.${idx + 1}`}
                  onClick={() => onSelectDm(principal)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm transition-colors mb-0.5 ${
                    isActive
                      ? "bg-dc-active text-dc-primary"
                      : "text-dc-secondary hover:bg-dc-channelhover hover:text-dc-primary"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: getAvatarColor(principal) }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-dc-primary truncate">
                      {name}
                    </p>
                    <p className="text-xs text-dc-muted truncate">{preview}</p>
                  </div>
                </button>
              );
            }
            const { groupId, name, preview } = entry;
            const isActive = activeGroupId === groupId;

            return (
              <button
                type="button"
                key={`group-${groupId}`}
                data-ocid={`dm.item.${idx + 1}`}
                onClick={() => onSelectGroup(groupId)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm transition-colors mb-0.5 ${
                  isActive
                    ? "bg-dc-active text-dc-primary"
                    : "text-dc-secondary hover:bg-dc-channelhover hover:text-dc-primary"
                }`}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-dc-blurple/70">
                  <Users size={14} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-dc-primary truncate">
                    {name}
                  </p>
                  <p className="text-xs text-dc-muted truncate">{preview}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* User panel */}
        <div className="h-14 px-2 flex items-center gap-2 bg-dc-serverbar flex-shrink-0">
          <UserAvatar
            principal={myPrincipal || ""}
            name={myName}
            photoUrl={photoUrl}
            size={32}
            isMe
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dc-primary truncate">
              {myName}
            </p>
            <p className="text-xs text-dc-muted truncate">
              {myPrincipal?.slice(0, 12)}...
            </p>
          </div>
          <button
            type="button"
            data-ocid="dm.settings.open_modal_button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-1.5 rounded text-dc-muted hover:text-dc-primary hover:bg-dc-channelhover transition-colors flex-shrink-0"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        showBitrate={false}
        myPrincipal={myPrincipal}
        myName={myName}
        photoUrl={photoUrl}
        onSavePhoto={savePhoto}
        onClearPhoto={clearPhoto}
      />
    </>
  );
}
