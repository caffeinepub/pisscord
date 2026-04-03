import {
  ChevronDown,
  Hash,
  Mic,
  PhoneOff,
  Plus,
  Settings,
  Users,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import type { Server } from "../backend";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useAddChannel } from "../hooks/useQueries";
import AudioSettingsModal from "./AudioSettingsModal";

interface Props {
  server: Server | null;
  activeChannel: string | null;
  onSelectChannel: (channel: string) => void;
  onSelectVoiceChannel: (channel: string) => void;
  activeVoiceChannel: string | null;
  joinedVoiceChannel: string | null;
  onLeaveVoice: () => void;
  members: string[];
  memberNames: Record<string, string>;
}

export default function ChannelSidebar({
  server,
  activeChannel,
  onSelectChannel,
  onSelectVoiceChannel,
  activeVoiceChannel,
  joinedVoiceChannel,
  onLeaveVoice,
  members,
  memberNames,
}: Props) {
  const [addingTextChannel, setAddingTextChannel] = useState(false);
  const [addingVoiceChannel, setAddingVoiceChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const { mutate: addChannel } = useAddChannel();
  const { identity } = useInternetIdentity();
  const myPrincipal = identity?.getPrincipal().toString();

  const handleAddTextChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !server) return;
    const name = `>${newChannelName.trim().toLowerCase().replace(/\s+/g, "-")}`;
    addChannel(
      { serverId: server.id, channelName: name },
      {
        onSuccess: () => {
          setNewChannelName("");
          setAddingTextChannel(false);
        },
      },
    );
  };

  const handleAddVoiceChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || !server) return;
    const name = `!${newChannelName.trim().replace(/\s+/g, "-")}`;
    addChannel(
      { serverId: server.id, channelName: name },
      {
        onSuccess: () => {
          setNewChannelName("");
          setAddingVoiceChannel(false);
        },
      },
    );
  };

  if (!server) {
    return (
      <div className="w-full md:w-60 md:min-w-60 bg-dc-sidebar flex flex-col items-center justify-center">
        <p className="text-dc-muted text-sm">Select a server</p>
      </div>
    );
  }

  const textChannels = server.channels.filter((ch) => ch.startsWith(">"));
  const voiceChannels = server.channels.filter((ch) => ch.startsWith("!"));
  const legacyChannels = server.channels.filter(
    (ch) => !ch.startsWith(">") && !ch.startsWith("!"),
  );
  const allTextChannels = [...legacyChannels, ...textChannels];

  const isOwner = server.owner.toString() === myPrincipal;

  return (
    <div className="w-full md:w-60 md:min-w-60 bg-dc-sidebar flex flex-col">
      {/* Server header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-dc-serverbar shadow-sm cursor-pointer hover:bg-dc-channelhover transition-colors">
        <span className="font-semibold text-dc-primary text-sm truncate">
          {server.name}
        </span>
        <ChevronDown size={16} className="text-dc-secondary" />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Text Channels */}
        <div className="mb-2">
          <div className="flex items-center justify-between px-2 py-1 group">
            <span className="text-xs font-bold text-dc-secondary uppercase tracking-wide">
              Text Channels
            </span>
            {isOwner && (
              <button
                type="button"
                data-ocid="channel.add_button"
                onClick={() => {
                  setAddingVoiceChannel(false);
                  setNewChannelName("");
                  setAddingTextChannel(true);
                }}
                className="opacity-0 group-hover:opacity-100 text-dc-secondary hover:text-dc-primary transition-all"
                aria-label="Add text channel"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          {allTextChannels.map((ch, idx) => {
            const displayName = ch.startsWith(">") ? ch.slice(1) : ch;
            return (
              <button
                type="button"
                key={ch}
                data-ocid={`channel.item.${idx + 1}`}
                onClick={() => onSelectChannel(ch)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                  activeChannel === ch
                    ? "bg-dc-active text-dc-primary"
                    : "text-dc-secondary hover:bg-dc-channelhover hover:text-dc-primary"
                }`}
              >
                <Hash size={16} className="flex-shrink-0" />
                <span className="truncate">{displayName}</span>
              </button>
            );
          })}

          {addingTextChannel && (
            <form onSubmit={handleAddTextChannel} className="px-2 mt-1">
              <label htmlFor="new-text-channel-input" className="sr-only">
                New text channel name
              </label>
              <input
                id="new-text-channel-input"
                data-ocid="channel.input"
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                // biome-ignore lint/a11y/noAutofocus: intended UX
                autoFocus
                placeholder="new-channel"
                onBlur={() => {
                  if (!newChannelName) setAddingTextChannel(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAddingTextChannel(false);
                }}
                className="w-full px-2 py-1 bg-dc-chat text-dc-primary text-sm rounded border border-dc-blurple focus:outline-none"
              />
              <p className="text-xs text-dc-muted mt-1">
                Enter to confirm · Esc to cancel
              </p>
            </form>
          )}

          {allTextChannels.length === 0 && !addingTextChannel && (
            <p className="px-2 py-1 text-xs text-dc-muted">
              No text channels yet
            </p>
          )}
        </div>

        {/* Voice Channels */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2 py-1 group">
            <span className="text-xs font-bold text-dc-secondary uppercase tracking-wide">
              Voice Channels
            </span>
            {isOwner && (
              <button
                type="button"
                data-ocid="voice_channel.add_button"
                onClick={() => {
                  setAddingTextChannel(false);
                  setNewChannelName("");
                  setAddingVoiceChannel(true);
                }}
                className="opacity-0 group-hover:opacity-100 text-dc-secondary hover:text-dc-primary transition-all"
                aria-label="Add voice channel"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          {voiceChannels.map((ch, idx) => {
            const dName = ch.slice(1);
            const isActive = activeVoiceChannel === ch;
            const isConnected = joinedVoiceChannel === ch;

            return (
              <button
                type="button"
                key={ch}
                data-ocid={`voice_channel.item.${idx + 1}`}
                onClick={() => onSelectVoiceChannel(ch)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? "bg-dc-active text-dc-primary"
                    : "text-dc-secondary hover:bg-dc-channelhover hover:text-dc-primary"
                }`}
              >
                <Volume2 size={16} className="flex-shrink-0" />
                <span className="truncate flex-1 text-left">{dName}</span>
                {isConnected && (
                  <Mic size={12} className="text-green-400 flex-shrink-0" />
                )}
              </button>
            );
          })}

          {addingVoiceChannel && (
            <form onSubmit={handleAddVoiceChannel} className="px-2 mt-1">
              <label htmlFor="new-voice-channel-input" className="sr-only">
                New voice channel name
              </label>
              <input
                id="new-voice-channel-input"
                data-ocid="voice_channel.input"
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                // biome-ignore lint/a11y/noAutofocus: intended UX
                autoFocus
                placeholder="General"
                onBlur={() => {
                  if (!newChannelName) setAddingVoiceChannel(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAddingVoiceChannel(false);
                }}
                className="w-full px-2 py-1 bg-dc-chat text-dc-primary text-sm rounded border border-dc-blurple focus:outline-none"
              />
              <p className="text-xs text-dc-muted mt-1">
                Enter to confirm · Esc to cancel
              </p>
            </form>
          )}

          {voiceChannels.length === 0 && !addingVoiceChannel && (
            <p className="px-2 py-1 text-xs text-dc-muted">
              No voice channels yet
            </p>
          )}
        </div>

        {/* Members */}
        <div className="mt-2">
          <div className="flex items-center px-2 py-1">
            <Users size={14} className="text-dc-secondary mr-1" />
            <span className="text-xs font-bold text-dc-secondary uppercase tracking-wide">
              Members — {members.length}
            </span>
          </div>
          {members.map((principal, idx) => {
            const name =
              memberNames[principal] || `${principal.slice(0, 8)}...`;
            const isMe = principal === myPrincipal;
            return (
              <div
                key={principal}
                data-ocid={`member.item.${idx + 1}`}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-dc-channelhover transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: `oklch(0.55 0.20 ${(principal.charCodeAt(0) * 37) % 360})`,
                  }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-dc-secondary truncate">
                  {name}
                  {isMe ? " (you)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voice connected indicator */}
      {joinedVoiceChannel && (
        <div className="px-3 py-2 bg-green-900/20 border-t border-green-700/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-green-400 flex-1 truncate">
              Voice connected · {joinedVoiceChannel.slice(1)}
            </span>
            <button
              type="button"
              data-ocid="voice.disconnect_button"
              onClick={onLeaveVoice}
              title="Disconnect from voice"
              className="text-dc-muted hover:text-red-400 transition-colors flex-shrink-0"
            >
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div className="h-14 px-2 flex items-center gap-2 bg-dc-serverbar">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: "oklch(0.55 0.22 264)" }}
        >
          {(memberNames[myPrincipal || ""] || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dc-primary truncate">
            {memberNames[myPrincipal || ""] || "Unknown"}
          </p>
          <p className="text-xs text-dc-muted truncate">
            {myPrincipal?.slice(0, 12)}...
          </p>
        </div>
        <button
          type="button"
          data-ocid="user_settings.open_modal_button"
          onClick={() => setShowAudioSettings(true)}
          title="Audio settings"
          className="text-dc-muted hover:text-dc-primary transition-colors flex-shrink-0 p-1"
        >
          <Settings size={16} />
        </button>
      </div>

      <AudioSettingsModal
        open={showAudioSettings}
        onClose={() => setShowAudioSettings(false)}
        showBitrate={false}
      />
    </div>
  );
}
