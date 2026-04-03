import { useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Settings,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import { useAudioSettings } from "../hooks/useAudioSettings";
import {
  useGetMySignals,
  useJoinVoiceChannel,
  useLeaveVoiceChannel,
  useVoiceChannelPresence,
} from "../hooks/useQueries";
import SettingsModal from "./SettingsModal";

// Using Open Relay Project (free public TURN server) as relay fallback
// This handles users behind restrictive NAT/firewalls where STUN alone fails
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:80?transport=tcp",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Wait for ICE gathering to complete — up to 8 seconds
async function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 8000);
    pc.addEventListener("icegatheringstatechange", function handler() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    });
  });
}

function applyBitrate(sdp: string, kbps: number): string {
  return sdp.replace(/^(m=audio.*$)/gm, `$1\r\nb=AS:${kbps}`);
}

function countCandidates(sdp: string): {
  host: number;
  srflx: number;
  relay: number;
} {
  const lines = sdp.split("\n");
  let host = 0;
  let srflx = 0;
  let relay = 0;
  for (const line of lines) {
    if (line.startsWith("a=candidate:")) {
      if (line.includes(" host ")) host++;
      else if (line.includes(" srflx ")) srflx++;
      else if (line.includes(" relay ")) relay++;
    }
  }
  return { host, srflx, relay };
}

function getAvatarColor(principal: string): string {
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60, 180, 310];
  const hue = hues[Math.abs(hash) % hues.length];
  return `oklch(0.55 0.20 ${hue})`;
}

interface Props {
  channelName: string;
  memberNames: Record<string, string>;
  myPrincipal: string | null;
  onJoinedChange: (channelName: string | null) => void;
  isOwner: boolean;
}

interface PeerState {
  pc: RTCPeerConnection;
  hasRemoteDescription: boolean;
}

export default function VoiceChannel({
  channelName,
  memberNames,
  myPrincipal,
  onJoinedChange,
  isOwner,
}: Props) {
  const { actor } = useActor();
  const qc = useQueryClient();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  const [showDiag, setShowDiag] = useState(false);
  const [diagInfo, setDiagInfo] = useState<string>("");

  const { settings } = useAudioSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [showSettings, setShowSettings] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const processedSignalIds = useRef<Set<string>>(new Set());
  const channelRef = useRef(channelName);
  channelRef.current = channelName;

  const isJoinedRef = useRef(false);
  const handleLeaveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const actorRef = useRef(actor);
  actorRef.current = actor;

  const { mutateAsync: joinVoiceChannel } = useJoinVoiceChannel();
  const { mutateAsync: leaveVoiceChannel } = useLeaveVoiceChannel();

  const { data: presence = [] } = useVoiceChannelPresence(channelName);
  const { data: signals = [] } = useGetMySignals(channelName, isJoined);

  const displayName = channelName.startsWith("!")
    ? channelName.slice(1)
    : channelName;

  const updatePeerStateDisplay = useCallback(
    (remotePrincipal: string, state: string) => {
      setPeerStates((prev) => ({ ...prev, [remotePrincipal]: state }));
    },
    [],
  );

  const closePeer = useCallback((remotePrincipal: string) => {
    const peerState = peersRef.current.get(remotePrincipal);
    if (peerState) {
      peerState.pc.close();
      peersRef.current.delete(remotePrincipal);
    }
    const audio = remoteAudioRefs.current.get(remotePrincipal);
    if (audio) {
      audio.srcObject = null;
      remoteAudioRefs.current.delete(remotePrincipal);
    }
    setPeerStates((prev) => {
      const next = { ...prev };
      delete next[remotePrincipal];
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (remotePrincipal: string): PeerState => {
      closePeer(remotePrincipal);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peerState: PeerState = {
        pc,
        hasRemoteDescription: false,
      };

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.ontrack = (event) => {
        let audio = remoteAudioRefs.current.get(remotePrincipal);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          remoteAudioRefs.current.set(remotePrincipal, audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        updatePeerStateDisplay(remotePrincipal, state);
        if (state === "failed" || state === "closed") {
          peersRef.current.delete(remotePrincipal);
          const audio = remoteAudioRefs.current.get(remotePrincipal);
          if (audio) {
            audio.srcObject = null;
            remoteAudioRefs.current.delete(remotePrincipal);
          }
        }
      };

      peersRef.current.set(remotePrincipal, peerState);
      updatePeerStateDisplay(remotePrincipal, "new");
      return peerState;
    },
    [closePeer, updatePeerStateDisplay],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: actor handled via ref
  useEffect(() => {
    if (!isJoined || !actor || signals.length === 0) return;

    const processSignals = async () => {
      for (const sig of signals) {
        const sigId = sig.id.toString();
        if (processedSignalIds.current.has(sigId)) continue;
        processedSignalIds.current.add(sigId);

        const fromPrincipal = sig.from.toString();
        if (fromPrincipal === myPrincipal) continue;

        try {
          if (sig.signalType === "offer") {
            const peerState = createPeerConnection(fromPrincipal);
            updatePeerStateDisplay(fromPrincipal, "answering");
            const offer: RTCSessionDescriptionInit = JSON.parse(sig.payload);
            await peerState.pc.setRemoteDescription(offer);
            peerState.hasRemoteDescription = true;

            const answer = await peerState.pc.createAnswer();
            await peerState.pc.setLocalDescription(answer);
            await waitForIceGathering(peerState.pc);

            const localDesc = peerState.pc.localDescription;
            if (localDesc) {
              const { host, srflx, relay } = countCandidates(localDesc.sdp);
              setDiagInfo(
                `Answer sent — candidates: ${host} host, ${srflx} srflx, ${relay} relay`,
              );
            }

            await actorRef.current!.sendSignal(
              sig.from,
              channelRef.current,
              "answer",
              JSON.stringify({
                type: peerState.pc.localDescription?.type,
                sdp: applyBitrate(
                  peerState.pc.localDescription?.sdp ?? "",
                  settingsRef.current.bitrate,
                ),
              }),
            );
          } else if (sig.signalType === "answer") {
            const peerState = peersRef.current.get(fromPrincipal);
            if (peerState && !peerState.hasRemoteDescription) {
              const answer: RTCSessionDescriptionInit = JSON.parse(sig.payload);
              await peerState.pc.setRemoteDescription(answer);
              peerState.hasRemoteDescription = true;
              updatePeerStateDisplay(fromPrincipal, "connecting");
            }
          }
        } catch (e) {
          console.warn("Signal processing error", sig.signalType, e);
        }
      }
    };

    processSignals();
  }, [
    signals,
    isJoined,
    myPrincipal,
    createPeerConnection,
    updatePeerStateDisplay,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: actor handled via ref
  useEffect(() => {
    if (!isJoined || !actor || !myPrincipal) return;

    const initiateConnections = async () => {
      for (const p of presence) {
        const remotePrincipal = p.toString();
        if (remotePrincipal === myPrincipal) continue;

        if (myPrincipal < remotePrincipal) {
          const existing = peersRef.current.get(remotePrincipal);
          if (existing) {
            const state = existing.pc.connectionState;
            if (state !== "failed" && state !== "closed") continue;
          }

          const peerState = createPeerConnection(remotePrincipal);
          updatePeerStateDisplay(remotePrincipal, "gathering");
          try {
            const offer = await peerState.pc.createOffer();
            await peerState.pc.setLocalDescription(offer);
            await waitForIceGathering(peerState.pc);

            const localDesc = peerState.pc.localDescription;
            if (localDesc) {
              const { host, srflx, relay } = countCandidates(localDesc.sdp);
              setDiagInfo(
                `Offer sent — candidates: ${host} host, ${srflx} srflx, ${relay} relay`,
              );
            }

            await actorRef.current!.sendSignal(
              p,
              channelRef.current,
              "offer",
              JSON.stringify({
                type: peerState.pc.localDescription?.type,
                sdp: applyBitrate(
                  peerState.pc.localDescription?.sdp ?? "",
                  settingsRef.current.bitrate,
                ),
              }),
            );
            updatePeerStateDisplay(remotePrincipal, "waiting-answer");
          } catch (e) {
            console.warn("Failed to create offer", e);
            closePeer(remotePrincipal);
          }
        }
      }

      const presenceSet = new Set(presence.map((p) => p.toString()));
      for (const [principal] of peersRef.current) {
        if (!presenceSet.has(principal)) {
          closePeer(principal);
        }
      }
    };

    initiateConnections();
  }, [
    presence,
    isJoined,
    myPrincipal,
    createPeerConnection,
    closePeer,
    updatePeerStateDisplay,
  ]);

  const handleLeave = useCallback(async () => {
    setIsJoined(false);
    isJoinedRef.current = false;
    onJoinedChange(null);

    for (const [principal] of peersRef.current) {
      closePeer(principal);
    }
    peersRef.current.clear();

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    for (const [, audio] of remoteAudioRefs.current) {
      audio.srcObject = null;
    }
    remoteAudioRefs.current.clear();
    processedSignalIds.current.clear();
    setPeerStates({});

    try {
      if (actorRef.current) await leaveVoiceChannel(channelName);
    } catch (e) {
      console.warn("Failed to leave voice channel", e);
    }
  }, [channelName, leaveVoiceChannel, onJoinedChange, closePeer]);

  handleLeaveRef.current = handleLeave;

  useEffect(() => {
    return () => {
      if (isJoinedRef.current) {
        handleLeaveRef.current();
      }
    };
  }, []);

  const handleJoin = async () => {
    if (!actor) return;
    setIsJoining(true);
    setError(null);
    try {
      await joinVoiceChannel(channelName);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          echoCancellation: settings.echoCancellation,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;
      setIsJoined(true);
      isJoinedRef.current = true;
      onJoinedChange(channelName);
      qc.invalidateQueries({ queryKey: ["voicePresence", channelName] });
    } catch (e) {
      console.error("Failed to join voice", e);
      setError("Could not access microphone or join channel.");
      try {
        await leaveVoiceChannel(channelName);
      } catch {}
    } finally {
      setIsJoining(false);
    }
  };

  const handleForceReconnect = () => {
    // Close all peers and reset signal cache so fresh connections are created
    for (const [principal] of peersRef.current) {
      closePeer(principal);
    }
    peersRef.current.clear();
    processedSignalIds.current.clear();
    setPeerStates({});
    setDiagInfo("Reconnecting...");
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const presencePrincipals = presence.map((p) => p.toString());

  function stateLabel(principal: string): { label: string; color: string } {
    if (principal === myPrincipal)
      return { label: "you", color: "text-green-400" };
    const state = peerStates[principal];
    switch (state) {
      case "gathering":
        return { label: "gathering ICE...", color: "text-yellow-400" };
      case "answering":
        return { label: "negotiating...", color: "text-yellow-400" };
      case "waiting-answer":
        return { label: "waiting for answer...", color: "text-yellow-400" };
      case "connecting":
        return { label: "connecting...", color: "text-yellow-400" };
      case "connected":
        return { label: "connected", color: "text-green-400" };
      case "failed":
        return { label: "failed", color: "text-red-400" };
      case "disconnected":
        return { label: "disconnected", color: "text-orange-400" };
      case "closed":
        return { label: "closed", color: "text-red-400" };
      default:
        return { label: isJoined ? "waiting..." : "", color: "text-dc-muted" };
    }
  }

  const anyConnected = Object.values(peerStates).some((s) => s === "connected");
  const anyFailed = Object.values(peerStates).some(
    (s) => s === "failed" || s === "closed",
  );

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      <div className="h-12 px-4 flex items-center gap-3 border-b border-dc-serverbar shadow-sm flex-shrink-0">
        <Volume2 size={20} className="text-dc-secondary" />
        <span className="font-semibold text-dc-primary">{displayName}</span>
        <span className="text-xs text-dc-muted ml-1">
          {isJoined
            ? anyConnected
              ? "Connected"
              : "Connecting..."
            : "Voice Channel"}
        </span>
        {isJoined && (
          <div className="flex items-center gap-1 ml-2">
            <span
              className={`w-2 h-2 rounded-full ${
                anyConnected
                  ? "bg-green-500 animate-pulse"
                  : anyFailed
                    ? "bg-red-500"
                    : "bg-yellow-500 animate-pulse"
              }`}
            />
            <span
              className={`text-xs ${
                anyConnected
                  ? "text-green-400"
                  : anyFailed
                    ? "text-red-400"
                    : "text-yellow-400"
              }`}
            >
              {anyConnected ? "Live" : anyFailed ? "Failed" : "Connecting"}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            <h3 className="text-xs font-bold text-dc-muted uppercase tracking-wide mb-4 text-center">
              {presencePrincipals.length} participant
              {presencePrincipals.length !== 1 ? "s" : ""} in channel
            </h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {presencePrincipals.length === 0 && (
                <p className="text-dc-muted text-sm text-center">
                  No one is here yet. Join to start!
                </p>
              )}
              {presencePrincipals.map((principal) => {
                const name =
                  memberNames[principal] || `${principal.slice(0, 8)}...`;
                const isMe = principal === myPrincipal;
                const avatarColor = getAvatarColor(principal);
                const { label, color } = stateLabel(principal);

                return (
                  <div
                    key={principal}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="relative">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-dc-chat ${
                          peerStates[principal] === "connected" || isMe
                            ? "bg-green-500"
                            : "bg-yellow-500"
                        }`}
                      />
                    </div>
                    <span className="text-xs text-dc-secondary text-center max-w-[80px] truncate">
                      {isMe ? `${name} (you)` : name}
                    </span>
                    {label && (
                      <span
                        className={`text-[10px] ${color} text-center max-w-[80px] truncate`}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-2 bg-red-900/30 border border-red-700/40 rounded text-red-400 text-sm text-center"
              data-ocid="voice.error_state"
            >
              {error}
            </div>
          )}

          {!isJoined ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full bg-dc-sidebar flex items-center justify-center mb-2">
                <Volume2 size={36} className="text-dc-muted" />
              </div>
              <h2 className="text-xl font-bold text-dc-primary">
                {displayName}
              </h2>
              <p className="text-dc-secondary text-sm text-center">
                Join this voice channel to start talking with others.
              </p>
              <button
                type="button"
                data-ocid="voice.primary_button"
                onClick={handleJoin}
                disabled={isJoining}
                className="mt-4 px-8 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-semibold rounded-full transition-colors text-sm"
              >
                {isJoining ? "Joining..." : "Join Voice"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  data-ocid="voice.toggle"
                  onClick={toggleMute}
                  title={isMuted ? "Unmute" : "Mute"}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isMuted
                      ? "bg-red-600 hover:bg-red-500"
                      : "bg-dc-sidebar hover:bg-dc-active"
                  }`}
                >
                  {isMuted ? (
                    <MicOff size={20} className="text-white" />
                  ) : (
                    <Mic size={20} className="text-dc-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleForceReconnect}
                  title="Force reconnect"
                  className="w-12 h-12 rounded-full bg-dc-sidebar hover:bg-dc-active flex items-center justify-center transition-colors"
                >
                  <RefreshCw size={18} className="text-dc-secondary" />
                </button>

                <button
                  type="button"
                  data-ocid="voice.settings.open_modal_button"
                  onClick={() => setShowSettings(true)}
                  title={isOwner ? "Voice & Audio Settings" : "Audio Settings"}
                  className="w-12 h-12 rounded-full bg-dc-sidebar hover:bg-dc-active flex items-center justify-center transition-colors"
                >
                  <Settings size={18} className="text-dc-secondary" />
                </button>

                <button
                  type="button"
                  data-ocid="voice.delete_button"
                  onClick={handleLeave}
                  title="Leave voice channel"
                  className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
                >
                  <PhoneOff size={20} className="text-white" />
                </button>
              </div>

              {/* Diagnostics toggle */}
              <button
                type="button"
                onClick={() => setShowDiag(!showDiag)}
                className="text-xs text-dc-muted hover:text-dc-secondary transition-colors"
              >
                {showDiag ? "Hide diagnostics" : "Show diagnostics"}
              </button>

              {showDiag && (
                <div className="w-full bg-dc-sidebar rounded p-3 text-xs text-dc-secondary font-mono space-y-1">
                  <p className="text-dc-muted font-bold uppercase tracking-wide">
                    Diagnostics
                  </p>
                  {diagInfo && <p>{diagInfo}</p>}
                  {Object.entries(peerStates).map(([p, s]) => (
                    <p key={p}>
                      {memberNames[p] || p.slice(0, 12)}:{" "}
                      <span
                        className={
                          s === "connected"
                            ? "text-green-400"
                            : s === "failed"
                              ? "text-red-400"
                              : "text-yellow-400"
                        }
                      >
                        {s}
                      </span>
                    </p>
                  ))}
                  {Object.keys(peerStates).length === 0 && (
                    <p className="text-dc-muted">No peer connections yet</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        showBitrate={isOwner}
      />
    </div>
  );
}
