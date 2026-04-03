import {
  AtSign,
  Bell,
  Hash,
  HelpCircle,
  Inbox,
  Pin,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import { useProfilePhotos } from "../hooks/useProfilePhoto";
import { useChannelMessages, useSendMessage } from "../hooks/useQueries";
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
  channel: string | null;
  memberNames: Record<string, string>;
  myPrincipal: string | null;
}

export default function ChatArea({ channel, memberNames, myPrincipal }: Props) {
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], isLoading } = useChannelMessages(channel);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { actor } = useActor();

  // Collect unique author principals from messages for photo fetching
  const authorPrincipals = Array.from(
    new Set(messages.map((m) => m.author.toString())),
  );
  const authorPhotos = useProfilePhotos(authorPrincipals, actor);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    if (searchQuery) return; // don't auto-scroll when searching
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, searchQuery]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !channel) return;
    const content = input.trim();
    setInput("");
    sendMessage({ channel, content });
  };

  const displayChannel = channel
    ? channel.startsWith(">")
      ? channel.slice(1)
      : channel
    : null;

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

  if (!channel) {
    return (
      <div
        className="flex-1 bg-dc-chat flex flex-col items-center justify-center"
        data-ocid="chat.empty_state"
      >
        <Hash size={64} className="text-dc-muted mb-4" />
        <h3 className="text-2xl font-bold text-dc-primary mb-2">
          Select a channel
        </h3>
        <p className="text-dc-secondary">
          Pick a channel from the left to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      {/* Top bar */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-dc-serverbar shadow-sm flex-shrink-0">
        <Hash size={20} className="text-dc-secondary" />
        <span className="font-semibold text-dc-primary">{displayChannel}</span>
        <div className="ml-auto flex items-center gap-4 text-dc-secondary">
          <button
            type="button"
            className="hover:text-dc-primary transition-colors"
            aria-label="Notifications"
          >
            <Bell size={20} />
          </button>
          <button
            type="button"
            className="hover:text-dc-primary transition-colors"
            aria-label="Pinned messages"
          >
            <Pin size={20} />
          </button>
          <button
            type="button"
            className="hover:text-dc-primary transition-colors"
            aria-label="Members list"
          >
            <Users size={20} />
          </button>
          <div className="flex items-center bg-dc-serverbar rounded px-2 py-1 gap-1.5">
            <input
              ref={searchInputRef}
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-dc-primary placeholder-dc-muted focus:outline-none w-24"
              data-ocid="chat.search_input"
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
            className="hover:text-dc-primary transition-colors"
            aria-label="Inbox"
          >
            <Inbox size={20} />
          </button>
          <button
            type="button"
            className="hover:text-dc-primary transition-colors"
            aria-label="Help"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div
            className="flex items-center justify-center py-8"
            data-ocid="chat.loading_state"
          >
            <div className="w-6 h-6 border-2 border-dc-blurple border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-16"
            data-ocid="chat.empty_state"
          >
            <div className="w-16 h-16 rounded-full bg-dc-serverbar flex items-center justify-center mb-4">
              <Hash size={32} className="text-dc-secondary" />
            </div>
            <h3 className="text-2xl font-bold text-dc-primary mb-1">
              Welcome to #{displayChannel}!
            </h3>
            <p className="text-dc-secondary text-sm">
              This is the beginning of the #{displayChannel} channel.
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
          const prevMsg = filteredMessages[idx - 1];
          const isContinuation =
            prevMsg &&
            prevMsg.author.toString() === authorPrincipal &&
            Number(msg.timestamp - prevMsg.timestamp) < 5 * 60 * 1_000_000_000;
          const authorPhoto = authorPhotos[authorPrincipal] ?? null;

          return (
            <div
              key={msg.id.toString()}
              data-ocid={`message.item.${idx + 1}`}
              className={`flex items-start gap-4 px-2 py-0.5 rounded hover:bg-dc-hover group transition-colors ${isContinuation ? "mt-0" : "mt-4"}`}
            >
              {!isContinuation ? (
                authorPhoto ? (
                  <img
                    src={authorPhoto}
                    alt={authorName}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0 mt-0.5"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: getUserColor(authorPrincipal) }}
                  >
                    {authorName.charAt(0).toUpperCase()}
                  </div>
                )
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
          <button
            type="button"
            className="text-dc-secondary hover:text-dc-primary transition-colors flex-shrink-0"
            aria-label="Mention user"
          >
            <AtSign size={20} />
          </button>
          <input
            data-ocid="chat.input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message #${displayChannel}`}
            className="flex-1 bg-transparent text-dc-primary placeholder-dc-muted focus:outline-none text-sm"
          />
          <button
            data-ocid="chat.submit_button"
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
