import { Toaster } from "@/components/ui/sonner";
import type { Principal } from "@icp-sdk/core/principal";
import { Principal as PrincipalClass } from "@icp-sdk/core/principal";
import { Hash, Layers, MessageSquare, Users } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import BrowseServersModal from "./components/BrowseServersModal";
import ChannelSidebar from "./components/ChannelSidebar";
import ChatArea from "./components/ChatArea";
import CreateServerModal from "./components/CreateServerModal";
import DMCallRinger from "./components/DMCallRinger";
import DMCallScreen from "./components/DMCallScreen";
import DMSidebar from "./components/DMSidebar";
import DmChatArea from "./components/DmChatArea";
import NewDmModal from "./components/NewDmModal";
import ServerBar from "./components/ServerBar";
import UsernameModal from "./components/UsernameModal";
import VoiceChannel from "./components/VoiceChannel";
import { useActor } from "./hooks/useActor";
import { useAudioSettings } from "./hooks/useAudioSettings";
import { useInternetIdentity } from "./hooks/useInternetIdentity";
import { useProfilePhotos } from "./hooks/useProfilePhoto";
import {
  useAllUsers,
  useCreateGroupDM,
  useMyConversations,
  useMyGroupDMs,
  useServerMembers,
  useUserProfile,
  useUserServers,
} from "./hooks/useQueries";

export default function App() {
  const { identity, login, isInitializing, isLoggingIn } =
    useInternetIdentity();
  const { actor } = useActor();
  const isAuthenticated = !!identity;
  const myPrincipal = identity?.getPrincipal().toString() ?? null;

  // Initialize theme from localStorage on app load
  useAudioSettings();

  const { data: userProfile, isLoading: profileLoading } = useUserProfile();
  const { data: userServers = [] } = useUserServers();

  // DM state
  const [activeView, setActiveView] = useState<"servers" | "dms">("servers");
  const [activeDmPrincipal, setActiveDmPrincipal] = useState<string | null>(
    null,
  );
  const [activeGroupId, setActiveGroupId] = useState<bigint | null>(null);
  const dmConversationType = activeGroupId !== null ? "group" : "dm";
  const [showNewDm, setShowNewDm] = useState(false);

  // DM call state
  const [activeDmCall, setActiveDmCall] = useState<{
    dmChannelId: string;
    members: Principal[];
  } | null>(null);
  const [incomingRings, setIncomingRings] = useState<
    Array<{
      dmChannelId: string;
      callerName: string;
    }>
  >([]);

  // Server state
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

  // DM queries
  const { data: conversations = [] } = useMyConversations();
  const { data: allUsers = [] } = useAllUsers();
  const { data: groupDMs = [] } = useMyGroupDMs();
  const { mutateAsync: createGroupDM } = useCreateGroupDM();

  // Build a name map from all registered users for DM view
  const dmUserNames: Record<string, string> = {};
  for (const [principal, profile] of allUsers) {
    const pStr = principal.toString();
    if (profile.name?.trim()) {
      dmUserNames[pStr] = profile.name;
    }
  }
  if (myPrincipal && userProfile?.name) {
    dmUserNames[myPrincipal] = userProfile.name;
  }

  const activeServer = userServers.find((s) => s.id === activeServerId) ?? null;
  const isOwner = !!(
    activeServer &&
    myPrincipal &&
    activeServer.owner.toString() === myPrincipal
  );

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
    setActiveView("servers");
  }, []);

  const handleOpenDMs = useCallback(() => {
    setActiveView("dms");
    // Auto-select the most recent conversation if none selected yet
    if (
      conversations.length > 0 &&
      activeDmPrincipal === null &&
      activeGroupId === null
    ) {
      setActiveDmPrincipal(conversations[0][0].toString());
    }
  }, [conversations, activeDmPrincipal, activeGroupId]);

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

  // Async profile photos for the mobile member list
  const mobileMemberPrincipals = memberPrincipals.map((p: Principal) =>
    p.toString(),
  );
  const mobileMemberPhotos = useProfilePhotos(mobileMemberPrincipals, actor);

  // Poll for incoming DM calls
  const incomingRingsRef = useRef(incomingRings);
  incomingRingsRef.current = incomingRings;
  const activeDmCallRef = useRef(activeDmCall);
  activeDmCallRef.current = activeDmCall;
  // Use refs for name maps to avoid them as effect deps (they're computed values)
  const dmUserNamesRef = useRef(dmUserNames);
  dmUserNamesRef.current = dmUserNames;
  const enrichedNamesRef = useRef(enrichedNames);
  enrichedNamesRef.current = enrichedNames;

  useEffect(() => {
    if (!actor || !myPrincipal) return;

    const poll = async () => {
      // Collect all channel IDs to poll
      const channelIds: string[] = [
        ...conversations.map(([p]) => p.toString()),
        ...groupDMs.map((g) => g.id.toString()),
      ];

      for (const channelId of channelIds) {
        try {
          const callState = await actor.getDMCallState(channelId);
          if (!callState) continue;

          // Skip if we're already in this call
          if (activeDmCallRef.current?.dmChannelId === channelId) continue;

          // Skip only if we are the call initiator (not just any participant)
          const amInitiator = callState.initiator.toString() === myPrincipal;
          if (amInitiator) continue;

          // Check if already ringing
          const alreadyRinging = incomingRingsRef.current.some(
            (r) => r.dmChannelId === channelId,
          );
          if (alreadyRinging) continue;

          // Get caller name — read via ref to avoid stale closure
          const callerPrincipal = callState.initiator.toString();
          const callerName =
            dmUserNamesRef.current[callerPrincipal] ||
            enrichedNamesRef.current[callerPrincipal] ||
            `${callerPrincipal.slice(0, 8)}...`;

          setIncomingRings((prev) => [
            ...prev,
            { dmChannelId: channelId, callerName },
          ]);
        } catch {
          // ignore individual poll failures
        }
      }

      // Bug 2 fix: sweep existing rings — remove any whose call state is gone
      // (handles the case where the caller hangs up before the callee clicks anything)
      const existingRings = incomingRingsRef.current;
      if (existingRings.length > 0) {
        const toRemove: string[] = [];
        await Promise.all(
          existingRings.map(async (ring) => {
            try {
              const state = await actor.getDMCallState(ring.dmChannelId);
              if (!state) toRemove.push(ring.dmChannelId);
            } catch {
              // ignore
            }
          }),
        );
        if (toRemove.length > 0) {
          setIncomingRings((prev) =>
            prev.filter((r) => !toRemove.includes(r.dmChannelId)),
          );
        }
      }
    };

    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [actor, myPrincipal, conversations, groupDMs]);

  // Handler: start a DM call
  const handleStartCall = useCallback(
    async (dmChannelId: string, members: Principal[]) => {
      if (!actor) return;
      try {
        await actor.startDMCall(dmChannelId, members);
        await actor.joinDMCall(dmChannelId);
        setActiveDmCall({ dmChannelId, members });
      } catch (e) {
        console.warn("Failed to start DM call", e);
      }
    },
    [actor],
  );

  // Handler: accept a ringing call
  const handleAcceptRing = useCallback(
    async (dmChannelId: string) => {
      if (!actor) return;
      try {
        await actor.joinDMCall(dmChannelId);

        // Fetch the invited members list from the backend
        // (startDMCall stores invitedMembers separately from participants)
        let members: Principal[] = [];
        try {
          // biome-ignore lint/suspicious/noExplicitAny: getDMInvitedMembers may not be in generated interface type
          const invitedMembers = await (actor as any).getDMInvitedMembers(
            dmChannelId,
          );
          if (invitedMembers.length > 0) {
            members = invitedMembers;
          }
        } catch {
          // fallback: reconstruct from conversation data
          const directConv = conversations.find(
            ([p]) => p.toString() === dmChannelId,
          );
          if (directConv) {
            members = [
              PrincipalClass.fromText(dmChannelId),
              ...(myPrincipal ? [PrincipalClass.fromText(myPrincipal)] : []),
            ];
          } else {
            const group = groupDMs.find((g) => g.id.toString() === dmChannelId);
            if (group) members = group.members;
          }
        }

        setActiveDmCall({ dmChannelId, members });
        setIncomingRings((prev) =>
          prev.filter((r) => r.dmChannelId !== dmChannelId),
        );
      } catch (e) {
        console.warn("Failed to accept call", e);
      }
    },
    [actor, conversations, groupDMs, myPrincipal],
  );

  // Handler: handle new DM selection from modal
  const handleSelectUsers = useCallback(
    async (principals: string[]) => {
      if (principals.length === 1) {
        // 1-on-1 DM
        setActiveDmPrincipal(principals[0]);
        setActiveGroupId(null);
        setActiveView("dms");
      } else {
        // Group DM
        try {
          const members = principals.map((p) => PrincipalClass.fromText(p));
          const groupId = await createGroupDM(members);
          setActiveGroupId(groupId);
          setActiveDmPrincipal(null);
          setActiveView("dms");
        } catch (e) {
          console.warn("Failed to create group DM", e);
        }
      }
    },
    [createGroupDM],
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-dc-chat flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-4"
        >
          <div className="w-20 h-20 bg-dc-blurple rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-white text-4xl font-black">P</span>
          </div>
          <h1 className="text-4xl font-black text-dc-primary mb-2">
            Welcome to Pisscord
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

  const serverBarProps = {
    servers: userServers,
    activeServerId: activeView === "servers" ? activeServerId : null,
    onSelectServer: handleSelectServer,
    onCreateServer: () => setShowCreateServer(true),
    onBrowseServers: () => setShowBrowseServers(true),
    onOpenDMs: handleOpenDMs,
    isDmActive: activeView === "dms",
  };

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

  // Merged names for DM view (all registered users + server member names)
  const mergedDmNames = { ...enrichedNames, ...dmUserNames };

  // Resolve group members for active group (kept for future use)
  const _activeGroupData =
    activeGroupId !== null
      ? (groupDMs.find((g) => g.id === activeGroupId) ?? null)
      : null;
  const dmContent = activeDmCall ? (
    <DMCallScreen
      key={activeDmCall.dmChannelId}
      dmChannelId={activeDmCall.dmChannelId}
      allMembers={activeDmCall.members}
      memberNames={mergedDmNames}
      myPrincipal={myPrincipal}
      onEnd={() => setActiveDmCall(null)}
    />
  ) : (
    <DmChatArea
      conversationType={dmConversationType}
      otherPrincipal={dmConversationType === "dm" ? activeDmPrincipal : null}
      groupId={dmConversationType === "group" ? activeGroupId : null}
      memberNames={mergedDmNames}
      myPrincipal={myPrincipal}
      onStartCall={handleStartCall}
    />
  );

  const dmSidebar = (
    <DMSidebar
      myPrincipal={myPrincipal}
      memberNames={mergedDmNames}
      activeDmPrincipal={dmConversationType === "dm" ? activeDmPrincipal : null}
      activeGroupId={
        dmConversationType === "group"
          ? (activeGroupId?.toString() ?? null)
          : null
      }
      onSelectDm={(p) => {
        setActiveDmPrincipal(p);
        setActiveGroupId(null);
      }}
      onSelectGroup={(groupId) => {
        setActiveGroupId(BigInt(groupId));
        setActiveDmPrincipal(null);
      }}
      onOpenNewDm={() => setShowNewDm(true)}
      onOpenSettings={() => {}}
    />
  );

  return (
    <>
      {/* Incoming call ringers — shown above everything */}
      <AnimatePresence>
        {incomingRings.map((ring) => (
          <DMCallRinger
            key={ring.dmChannelId}
            dmChannelId={ring.dmChannelId}
            callerName={ring.callerName}
            onAccept={() => handleAcceptRing(ring.dmChannelId)}
            onDecline={() =>
              setIncomingRings((prev) =>
                prev.filter((r) => r.dmChannelId !== ring.dmChannelId),
              )
            }
          />
        ))}
      </AnimatePresence>

      {/* Mobile layout — bottom tab bar navigation */}
      <div className="flex flex-col h-screen w-screen md:hidden">
        <div className="flex-1 overflow-hidden">
          {activeMobileTab === "servers" && (
            <div className="h-full bg-dc-serverbar overflow-y-auto flex flex-col items-center py-3 gap-2">
              <ServerBar {...serverBarProps} />
            </div>
          )}
          {activeMobileTab === "channels" && (
            <div className="h-full flex flex-col overflow-hidden">
              {activeView === "dms" ? (
                <DMSidebar
                  myPrincipal={myPrincipal}
                  memberNames={mergedDmNames}
                  activeDmPrincipal={
                    dmConversationType === "dm" ? activeDmPrincipal : null
                  }
                  activeGroupId={
                    dmConversationType === "group"
                      ? (activeGroupId?.toString() ?? null)
                      : null
                  }
                  onSelectDm={(p) => {
                    setActiveDmPrincipal(p);
                    setActiveGroupId(null);
                    setActiveMobileTab("chat");
                  }}
                  onSelectGroup={(groupId) => {
                    setActiveGroupId(BigInt(groupId));
                    setActiveDmPrincipal(null);
                    setActiveMobileTab("chat");
                  }}
                  onOpenNewDm={() => setShowNewDm(true)}
                  onOpenSettings={() => {}}
                />
              ) : (
                <ChannelSidebar {...channelSidebarProps} />
              )}
            </div>
          )}
          {activeMobileTab === "chat" && (
            <main className="h-full flex overflow-hidden">
              {activeView === "dms" ? dmContent : voiceOrChat}
            </main>
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
                return (
                  <div
                    key={principal}
                    data-ocid={`mobile.member.item.${idx + 1}`}
                    className="flex items-center gap-3 py-2 px-2 rounded hover:bg-dc-channelhover transition-colors"
                  >
                    {mobileMemberPhotos[principal] ? (
                      <img
                        src={mobileMemberPhotos[principal]!}
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
                  className="text-dc-muted text-sm text-center mt-8"
                  data-ocid="mobile.members.empty_state"
                >
                  No members yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="h-14 bg-dc-serverbar border-t border-black/20 flex items-stretch flex-shrink-0">
          {(
            [
              { id: "servers" as const, icon: Layers, label: "Servers" },
              {
                id: "channels" as const,
                icon: Hash,
                label: activeView === "dms" ? "DMs" : "Channels",
              },
              { id: "chat" as const, icon: MessageSquare, label: "Chat" },
              { id: "members" as const, icon: Users, label: "Members" },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              data-ocid={`mobile.${id}.tab`}
              onClick={() => setActiveMobileTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeMobileTab === id ? "text-white" : "text-dc-muted"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Desktop layout — unchanged */}
      <div className="hidden md:flex h-screen w-screen overflow-hidden">
        <ServerBar {...serverBarProps} />
        {activeView === "dms" ? (
          dmSidebar
        ) : (
          <ChannelSidebar {...channelSidebarProps} />
        )}
        <main className="flex-1 flex overflow-hidden">
          {activeView === "dms" ? dmContent : voiceOrChat}
        </main>
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
      <NewDmModal
        open={showNewDm}
        onClose={() => setShowNewDm(false)}
        onSelectUsers={handleSelectUsers}
        myPrincipal={myPrincipal}
      />
      <Toaster />
    </>
  );
}
