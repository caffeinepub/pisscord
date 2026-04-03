import { Principal as PrincipalClass } from "@icp-sdk/core/principal";
import type { Principal } from "@icp-sdk/core/principal";
import {
  AtSign,
  MessageCircle,
  Pencil,
  Phone,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GroupConversation } from "../backend";
import {
  useConversationWith,
  useGroupDMMessages,
  useMyGroupDMs,
  useRenameGroupDM,
  useSendDM,
  useSendGroupDM,
} from "../hooks/useQueries";
import { formatDistanceToNow } from "../utils/time";

const USER_COLORS = [
  "oklch(0.70 0.18 264)",
  "oklch(0.70 0.18 145)",
  "oklch(0.70 0.18 30)",
  "oklch(0.70 0.18 340)",
  "oklch(0.70 0.18 200)",
  "oklch(0.70 0.18 60)",
];

function getUserColor(principal: string) {
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

interface Props {
  conversationType: "dm" | "group";
  otherPrincipal: string | null;
  groupId: bigint | null;
  memberNames: Record<string, string>;
  myPrincipal: string | null;
  onStartCall: (dmChannelId: string, members: Principal[]) => void;
}

export default function DmChatArea({
  conversationType,
  otherPrincipal,
  groupId,
  memberNames,
  myPrincipal,
  onStartCall,
}: Props) {
  const [input, setInput] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // DM data
  const { data: dmMessages = [], isLoading: dmLoading } = useConversationWith(
    conversationType === "dm" ? otherPrincipal : null,
  );
  const { mutate: sendDM, isPending: dmSending } = useSendDM();

  // Group DM data
  const { data: groupMessages = [], isLoading: groupLoading } =
    useGroupDMMessages(conversationType === "group" ? groupId : null);
  const { mutate: sendGroup, isPending: groupSending } = useSendGroupDM();
  const { mutate: renameGroup } = useRenameGroupDM();
  const { data: groupDMs = [] } = useMyGroupDMs();

  const activeGroup: GroupConversation | null =
    conversationType === "group" && groupId !== null
      ? (groupDMs.find((g) => g.id === groupId) ?? null)
      : null;

  const groupDisplayName = activeGroup
    ? activeGroup.name ||
      activeGroup.members
        .filter((m) => m.toString() !== myPrincipal)
        .map(
          (m) => memberNames[m.toString()] || `${m.toString().slice(0, 6)}...`,
        )
        .join(", ") ||
      "Group"
    : "Group";

  const otherName = otherPrincipal
    ? (memberNames[otherPrincipal] ?? `${otherPrincipal.slice(0, 8)}...`)
    : null;

  const messages = conversationType === "dm" ? dmMessages : groupMessages;
  const isLoading = conversationType === "dm" ? dmLoading : groupLoading;
  const isPending = conversationType === "dm" ? dmSending : groupSending;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    if (searchQuery) return; // don't auto-scroll when searching
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, searchQuery]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setInput("");
    if (conversationType === "dm") {
      if (!otherPrincipal) return;
      sendDM({ recipientStr: otherPrincipal, content });
    } else {
      if (groupId === null) return;
      sendGroup({ groupId, content });
    }
  };

  const handleStartRename = () => {
    setRenameValue(groupDisplayName);
    setIsRenaming(true);
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || groupId === null) return;
    renameGroup({ groupId, newName: renameValue.trim() });
    setIsRenaming(false);
  };

  const handleCallStart = () => {
    if (conversationType === "dm" && otherPrincipal) {
      // Bug 3 fix: include the caller (myPrincipal) in the members list
      const members = [PrincipalClass.fromText(otherPrincipal)];
      if (myPrincipal) members.push(PrincipalClass.fromText(myPrincipal));
      onStartCall(otherPrincipal, members);
    } else if (
      conversationType === "group" &&
      activeGroup &&
      groupId !== null
    ) {
      onStartCall(groupId.toString(), activeGroup.members);
    }
  };

  // Filter messages when search is active
  const filteredMessages = searchQuery.trim()
    ? messages.filter((msg) => {
        const authorPrincipal = msg.author.toString();
        const authorName =
          memberNames[authorPrincipal] ?? `${authorPrincipal.slice(0, 8)}...`;
        return (
          msg.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
          authorName.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : messages;

  // Empty state
  if (conversationType === "dm" && !otherPrincipal) {
    return (
      <div
        className="flex-1 bg-dc-chat flex flex-col items-center justify-center"
        data-ocid="dm.chat.empty_state"
      >
        <MessageCircle size={64} className="text-dc-muted mb-4" />
        <h3 className="text-2xl font-bold text-dc-primary mb-2">
          Your Direct Messages
        </h3>
        <p className="text-dc-secondary">
          Select a conversation or start a new one.
        </p>
      </div>
    );
  }

  if (conversationType === "group" && !groupId) {
    return (
      <div
        className="flex-1 bg-dc-chat flex flex-col items-center justify-center"
        data-ocid="dm.chat.empty_state"
      >
        <Users size={64} className="text-dc-muted mb-4" />
        <h3 className="text-2xl font-bold text-dc-primary mb-2">
          Group Conversations
        </h3>
        <p className="text-dc-secondary">Select a group or create a new one.</p>
      </div>
    );
  }

  const headerName =
    conversationType === "group" ? groupDisplayName : (otherName ?? "");
  const placeholderName =
    conversationType === "group"
      ? `#${groupDisplayName}`
      : `@${otherName ?? ""}`;

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      {/* Top bar */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-dc-serverbar shadow-sm flex-shrink-0">
        {conversationType === "group" ? (
          <Users size={20} className="text-dc-secondary flex-shrink-0" />
        ) : (
          <AtSign size={20} className="text-dc-secondary flex-shrink-0" />
        )}

        {conversationType === "group" && isRenaming ? (
          <form
            onSubmit={handleRename}
            className="flex items-center gap-2 flex-1"
          >
            <input
              data-ocid="dm.group.rename.input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="flex-1 bg-dc-input text-dc-primary rounded px-2 py-0.5 text-sm focus:outline-none border border-dc-blurple"
              // biome-ignore lint/a11y/noAutofocus: intended
              autoFocus
            />
            <button
              type="submit"
              data-ocid="dm.group.rename.save_button"
              className="px-2 py-0.5 bg-dc-blurple text-white text-xs rounded hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              data-ocid="dm.group.rename.cancel_button"
              onClick={() => setIsRenaming(false)}
              className="text-dc-muted hover:text-dc-primary"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            <span className="font-semibold text-dc-primary">{headerName}</span>
            {conversationType === "group" && (
              <button
                type="button"
                data-ocid="dm.group.rename.open_modal_button"
                onClick={handleStartRename}
                title="Rename group"
                className="text-dc-muted hover:text-dc-primary transition-colors"
              >
                <Pencil size={14} />
              </button>
            )}
            <div className="flex-1" />
            {/* Search */}
            <div className="flex items-center bg-dc-serverbar rounded px-2 py-1 gap-1.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="bg-transparent text-sm text-dc-primary placeholder-dc-muted focus:outline-none w-20"
                data-ocid="dm.chat.search_input"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-dc-muted hover:text-dc-primary transition-colors"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : (
                <Search size={16} className="text-dc-secondary" />
              )}
            </div>
            {searchQuery && (
              <span className="text-xs text-dc-muted whitespace-nowrap">
                {filteredMessages.length} result
                {filteredMessages.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              type="button"
              data-ocid="dm.call.primary_button"
              onClick={handleCallStart}
              title="Start voice call"
              className="p-1.5 rounded text-dc-muted hover:text-dc-primary hover:bg-dc-channelhover transition-colors"
            >
              <Phone size={18} />
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div
            className="flex items-center justify-center py-8"
            data-ocid="dm.chat.loading_state"
          >
            <div className="w-6 h-6 border-2 border-dc-blurple border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-16"
            data-ocid="dm.chat.empty_state"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4"
              style={{
                backgroundColor:
                  conversationType === "dm" && otherPrincipal
                    ? getUserColor(otherPrincipal)
                    : "oklch(0.55 0.22 264)",
              }}
            >
              {conversationType === "group" ? (
                <Users size={28} />
              ) : (
                otherName?.charAt(0).toUpperCase()
              )}
            </div>
            <h3 className="text-2xl font-bold text-dc-primary mb-1">
              {headerName}
            </h3>
            <p className="text-dc-secondary text-sm">
              {conversationType === "group"
                ? "This is the beginning of your group conversation."
                : "This is the beginning of your conversation with "}
              {conversationType === "dm" && (
                <span className="font-semibold text-dc-primary">
                  {otherName}
                </span>
              )}
              {conversationType === "dm" && "."}
            </p>
          </div>
        )}

        {!isLoading &&
          messages.length > 0 &&
          filteredMessages.length === 0 &&
          searchQuery && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={32} className="text-dc-muted mb-3" />
              <p className="text-dc-secondary text-sm">
                No messages match &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          )}

        {filteredMessages.map((msg, idx) => {
          const authorPrincipal = msg.author.toString();
          const authorName =
            memberNames[authorPrincipal] ?? `${authorPrincipal.slice(0, 8)}...`;
          const isMe = authorPrincipal === myPrincipal;

          const isSystem = "isSystem" in msg && msg.isSystem;
          if (isSystem) {
            return (
              <div
                key={msg.id.toString()}
                className="text-dc-muted italic text-xs text-center my-2"
              >
                {msg.content}
              </div>
            );
          }

          const prevMsg = filteredMessages[idx - 1];
          const prevIsSystem =
            prevMsg && "isSystem" in prevMsg && prevMsg.isSystem;
          const isContinuation =
            !prevIsSystem &&
            prevMsg &&
            prevMsg.author.toString() === authorPrincipal &&
            Number(msg.timestamp - prevMsg.timestamp) < 5 * 60 * 1_000_000_000;

          return (
            <div
              key={msg.id.toString()}
              data-ocid={`dm.message.item.${idx + 1}`}
              className={`flex items-start gap-4 px-2 py-0.5 rounded hover:bg-dc-hover group transition-colors ${
                isContinuation ? "mt-0" : "mt-4"
              }`}
            >
              {!isContinuation ? (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: getUserColor(authorPrincipal) }}
                >
                  {authorName.charAt(0).toUpperCase()}
                </div>
              ) : (
                <div className="w-10 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {!isContinuation && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span
                      className="font-semibold text-sm hover:underline cursor-pointer"
                      style={{
                        color: isMe
                          ? "oklch(0.70 0.22 264)"
                          : getUserColor(authorPrincipal),
                      }}
                    >
                      {authorName}
                    </span>
                    <span className="text-xs text-dc-muted">
                      {formatDistanceToNow(msg.timestamp)}
                    </span>
                  </div>
                )}
                <p className="text-sm text-dc-primary leading-relaxed break-words whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-6 pt-2 flex-shrink-0">
        <form
          onSubmit={handleSend}
          className="flex items-center gap-2 bg-dc-input rounded-lg px-4 py-3"
        >
          <input
            data-ocid="dm.chat.input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${placeholderName}`}
            className="flex-1 bg-transparent text-dc-primary placeholder-dc-muted focus:outline-none text-sm"
          />
          <button
            data-ocid="dm.chat.submit_button"
            type="submit"
            disabled={!input.trim() || isPending}
            className="text-dc-secondary hover:text-dc-primary disabled:opacity-30 transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
