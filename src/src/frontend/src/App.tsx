import { Toaster } from "@/components/ui/sonner";
import type { Principal } from "@icp-sdk/core/principal";
import { Hash, Layers, MessageSquare, Users } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import BrowseServersModal from "./components/BrowseServersModal";
import ChannelSidebar from "./components/ChannelSidebar";
import ChatArea from "./components/ChatArea";
import CreateServerModal from "./components/CreateServerModal";
import ServerBar from "./components/ServerBar";
import UsernameModal from "./components/UsernameModal";
import VoiceChannel from "./components/VoiceChannel";
import { useActor } from "./hooks/useActor";
import { useInternetIdentity } from "./hooks/useInternetIdentity";
import {
  useServerMembers,
  useUserProfile,
  useUserServers,
} from "./hooks/useQueries";

function getProfilePhoto(principalStr: string): string | null {
  try {
    return localStorage.getItem(`profilePhoto_${principalStr}`);
  } catch {
    return null;
  }
}

export default function App() {
  const { identity, login, isInitializing, isLoggingIn } =
    useInternetIdentity();
  const { actor } = useActor();
  const isAuthenticated = !!identity;
  const myPrincipal = identity?.getPrincipal().toString() ?? null;

  const { data: userProfile, isLoading: profileLoading } = useUserProfile();
  const { data: userServers = [] } = useUserServers();

  const [activeServerId, setActiveServerId] = useState<bigint | null>(null);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [selectedVoiceChannel, setSelectedVoiceChannel] = useState<
    string | null
  >(null);
  const [joinedVoiceChannel, setJoinedVoiceChannel] = useState<string | null>(
    null,
  );
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showBrowseServers, setShowBrowseServers] = useState(false);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [activeMobileTab, setActiveMobileTab] = useState<
    "servers" | "channels" | "chat" | "members"
  >("chat");

  const activeServer = userServers.find((s) => s.id === activeServerId) ?? null;
  const isOwner = activeServer?.owner?.toString() === myPrincipal;

  useEffect(() => {
    if (userServers.length > 0 && activeServerId === null) {
      setActiveServerId(userServers[0].id);
    }
  }, [userServers, activeServerId]);

  useEffect(() => {
    if (!activeServer) return;
    const textChannels = activeServer.channels.filter(
      (ch) => !ch.startsWith("!"),
    );
    if (textChannels.length === 0) {
      setActiveChannel(null);
      return;
    }
    setActiveChannel((prev) => {
      if (prev && activeServer.channels.includes(prev)) return prev;
      return textChannels[0];
    });
  }, [activeServer]);

  const handleSelectServer = useCallback((id: bigint) => {
    setActiveServerId(id);
    setActiveChannel(null);
    setSelectedVoiceChannel(null);
  }, []);

  const handleSelectTextChannel = useCallback((channel: string) => {
    setActiveChannel(channel);
    setSelectedVoiceChannel(null);
    setActiveMobileTab("chat");
  }, []);

  const handleSelectVoiceChannel = useCallback((channel: string) => {
    setSelectedVoiceChannel(channel);
    setActiveMobileTab("chat");
  }, []);

  const handleVoiceJoinedChange = useCallback((channelName: string | null) => {
    setJoinedVoiceChannel(channelName);
  }, []);

  const handleLeaveVoice = useCallback(() => {
    setJoinedVoiceChannel(null);
    setSelectedVoiceChannel(null);
  }, []);

  const { data: memberPrincipals = [] } = useServerMembers(activeServerId);

  const lastMemberKeyRef = useRef("");

  useEffect(() => {
    const key = memberPrincipals.map((p: Principal) => p.toString()).join(",");
    if (
      !actor ||
      memberPrincipals.length === 0 ||
      key === lastMemberKeyRef.current
    )
      return;
    lastMemberKeyRef.current = key;
    let cancelled = false;
    const fetchNames = async () => {
      const entries = await Promise.all(
        memberPrincipals.map(async (p: Principal) => {
          try {
            const profile = await actor.getUserProfile(p);
            const name = profile?.name;
            return [
              p.toString(),
              name?.trim() ? name : `${p.toString().slice(0, 8)}...`,
            ] as [string, string];
          } catch {
            return [p.toString(), `${p.toString().slice(0, 8)}...`] as [
              string,
              string,
            ];
          }
        }),
      );
      if (!cancelled) setMemberNames(Object.fromEntries(entries));
    };
    fetchNames();
    return () => {
      cancelled = true;
    };
  }, [actor, memberPrincipals]);

  const enrichedNames = myPrincipal
    ? { ...memberNames, [myPrincipal]: userProfile?.name ?? "You" }
    : memberNames;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-dc-chat flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-4"
        >
          <div className="w-20 h-20 bg-dc-blurple rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-white text-4xl font-black">C</span>
          </div>
          <h1 className="text-4xl font-black text-dc-primary mb-2">
            Welcome to Cordis
          </h1>
          <p className="text-dc-secondary mb-8 max-w-sm mx-auto">
            Your decentralized community platform. Sign in to join servers and
            start chatting.
          </p>
          <button
            type="button"
            data-ocid="login.primary_button"
            onClick={login}
            disabled={isLoggingIn || isInitializing}
            className="px-8 py-3 bg-dc-blurple text-white font-semibold rounded hover:opacity-90 disabled:opacity-60 transition-opacity text-lg"
          >
            {isInitializing
              ? "Loading..."
              : isLoggingIn
                ? "Signing in..."
                : "Sign In"}
          </button>
          <p className="text-dc-muted text-xs mt-8">
            Powered by Internet Identity on the Internet Computer
          </p>
          <p className="text-dc-muted text-xs mt-4">
            &copy; {new Date().getFullYear()}. Built with ❤️ using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              className="underline hover:text-dc-secondary"
            >
              caffeine.ai
            </a>
          </p>
        </motion.div>
        <Toaster />
      </div>
    );
  }

  if (!profileLoading && !userProfile) {
    return (
      <div className="min-h-screen bg-dc-chat">
        <UsernameModal />
        <Toaster />
      </div>
    );
  }

  const channelSidebarProps = {
    server: activeServer,
    activeChannel,
    onSelectChannel: handleSelectTextChannel,
    onSelectVoiceChannel: handleSelectVoiceChannel,
    activeVoiceChannel: selectedVoiceChannel,
    joinedVoiceChannel,
    onLeaveVoice: handleLeaveVoice,
    members: memberPrincipals.map((p: Principal) => p.toString()),
    memberNames: enrichedNames,
  };

  const serverBarProps = {
    servers: userServers,
    activeServerId,
    onSelectServer: handleSelectServer,
    onCreateServer: () => setShowCreateServer(true),
    onBrowseServers: () => setShowBrowseServers(true),
  };

  const voiceOrChat = selectedVoiceChannel ? (
    <VoiceChannel
      key={selectedVoiceChannel}
      channelName={selectedVoiceChannel}
      memberNames={enrichedNames}
      myPrincipal={myPrincipal}
      onJoinedChange={handleVoiceJoinedChange}
      isOwner={isOwner}
    />
  ) : (
    <ChatArea
      channel={activeChannel}
      memberNames={enrichedNames}
      myPrincipal={myPrincipal}
    />
  );

  const mobileTabItems = [
    { id: "servers" as const, icon: Layers, label: "Servers" },
    { id: "channels" as const, icon: Hash, label: "Channels" },
    { id: "chat" as const, icon: MessageSquare, label: "Chat" },
    { id: "members" as const, icon: Users, label: "Members" },
  ];

  return (
    <>
      {/* Mobile layout */}
      <div className="flex flex-col h-screen w-screen md:hidden">
        <div className="flex-1 overflow-hidden">
          {activeMobileTab === "servers" && (
            <div className="h-full bg-dc-serverbar overflow-y-auto flex flex-col items-center py-3 gap-2">
              <ServerBar {...serverBarProps} />
            </div>
          )}
          {activeMobileTab === "channels" && (
            <div className="h-full flex flex-col">
              <ChannelSidebar {...channelSidebarProps} />
            </div>
          )}
          {activeMobileTab === "chat" && (
            <main className="h-full flex overflow-hidden">{voiceOrChat}</main>
          )}
          {activeMobileTab === "members" && (
            <div className="h-full bg-dc-sidebar overflow-y-auto p-4">
              <p className="text-xs font-bold text-dc-secondary uppercase tracking-wide mb-3">
                Members — {memberPrincipals.length}
              </p>
              {memberPrincipals.map((p: Principal, idx: number) => {
                const principal = p.toString();
                const name =
                  enrichedNames[principal] || `${principal.slice(0, 8)}...`;
                const isMe = principal === myPrincipal;
                const photo = getProfilePhoto(principal);
                return (
                  <div
                    key={principal}
                    data-ocid={`member.item.${idx + 1}`}
                    className="flex items-center gap-3 py-2 px-2 rounded hover:bg-dc-channelhover transition-colors"
                  >
                    {photo ? (
                      <img
                        src={photo}
                        alt={name}
                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{
                          backgroundColor: `oklch(0.55 0.20 ${(principal.charCodeAt(0) * 37) % 360})`,
                        }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-dc-secondary">
                      {name}
                      {isMe ? " (you)" : ""}
                    </span>
                  </div>
                );
              })}
              {memberPrincipals.length === 0 && (
                <p
                  className="text-dc-muted text-sm"
                  data-ocid="members.empty_state"
                >
                  No members yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="h-14 bg-dc-serverbar border-t border-black/20 flex items-stretch flex-shrink-0">
          {mobileTabItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeMobileTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-ocid={`mobile_nav.${tab.id}.tab`}
                onClick={() => setActiveMobileTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? "text-white" : "text-dc-muted"
                }`}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop layout - unchanged */}
      <div className="hidden md:flex h-screen w-screen overflow-hidden">
        <ServerBar {...serverBarProps} />
        <ChannelSidebar {...channelSidebarProps} />
        <main className="flex-1 flex overflow-hidden">{voiceOrChat}</main>
      </div>

      <CreateServerModal
        open={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        onCreated={(id) => handleSelectServer(id)}
      />
      <BrowseServersModal
        open={showBrowseServers}
        onClose={() => setShowBrowseServers(false)}
        onJoined={(id) => {
          handleSelectServer(id);
          setShowBrowseServers(false);
        }}
      />
      <Toaster />
    </>
  );
}
