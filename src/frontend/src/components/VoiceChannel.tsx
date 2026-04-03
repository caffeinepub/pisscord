import { useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Settings,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import { useAudioSettings } from "../hooks/useAudioSettings";
import { useProfilePhoto, useProfilePhotos } from "../hooks/useProfilePhoto";
import {
  useGetMySignals,
  useJoinVoiceChannel,
  useLeaveVoiceChannel,
  useVoiceChannelPresence,
} from "../hooks/useQueries";
import SettingsModal from "./SettingsModal";
import UserAvatar from "./UserAvatar";

// STUN servers for ICE candidate gathering (direct P2P connection)
// TURN was removed — Open Relay Project credentials are no longer valid
// and direct P2P via STUN has proven reliable in testing
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
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
  const [speakingStates, setSpeakingStates] = useState<Record<string, boolean>>(
    {},
  );
  const [showDiag, setShowDiag] = useState(false);
  const [diagInfo, setDiagInfo] = useState<string>("");

  // Per-user volume state
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [volumePopoverFor, setVolumePopoverFor] = useState<string | null>(null);

  const { settings } = useAudioSettings();
  const { photoUrl, savePhoto, clearPhoto } = useProfilePhoto(
    actor,
    myPrincipal,
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [showSettings, setShowSettings] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const processedSignalIds = useRef<Set<string>>(new Set());
  const peerMissCountRef = useRef<Map<string, number>>(new Map());
  const channelRef = useRef(channelName);
  channelRef.current = channelName;

  // Speaking detection refs
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

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
    remoteAnalysersRef.current.delete(remotePrincipal);
    setPeerStates((prev) => {
      const next = { ...prev };
      delete next[remotePrincipal];
      return next;
    });
  }, []);

  // Apply saved volume to an audio element
  const applySavedVolume = useCallback(
    (principal: string, audio: HTMLAudioElement) => {
      const saved = localStorage.getItem(`userVolume_${principal}`);
      if (saved !== null) {
        audio.volume = Math.min(3, Math.max(0, Number(saved) / 100));
      }
    },
    [],
  );

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
          applySavedVolume(remotePrincipal, audio);
          remoteAudioRefs.current.set(remotePrincipal, audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});

        // Set up speaking analyser for remote stream
        try {
          const ctx = audioContextRef.current ?? new AudioContext();
          if (!audioContextRef.current) audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(event.streams[0]);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          remoteAnalysersRef.current.set(remotePrincipal, analyser);
        } catch (e) {
          console.warn("Could not create remote analyser", e);
        }
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
    [closePeer, updatePeerStateDisplay, applySavedVolume],
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

            // CRITICAL: use sig.from directly — it is a real Principal from the backend
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

            // CRITICAL: pass `p` directly — it is a real ICP Principal from the presence array
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
          // Bug 4 fix: require 3 consecutive misses before closing peer
          const misses = (peerMissCountRef.current.get(principal) ?? 0) + 1;
          peerMissCountRef.current.set(principal, misses);
          if (misses >= 3) {
            peerMissCountRef.current.delete(principal);
            closePeer(principal);
          }
        } else {
          // Reset miss count when peer is confirmed in presence
          peerMissCountRef.current.delete(principal);
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
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
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

  // Speaking detection polling
  useEffect(() => {
    const buf = new Uint8Array(128);
    speakingIntervalRef.current = setInterval(() => {
      const updates: Record<string, boolean> = {};

      // Local speaking
      if (localAnalyserRef.current && myPrincipal) {
        localAnalyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        updates[myPrincipal] = avg > 10;
      }

      // Remote speaking
      for (const [p, analyser] of remoteAnalysersRef.current) {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        updates[p] = avg > 10;
      }

      setSpeakingStates((prev) => {
        const changed = Object.entries(updates).some(([k, v]) => prev[k] !== v);
        return changed ? { ...prev, ...updates } : prev;
      });
    }, 100);

    return () => {
      if (speakingIntervalRef.current)
        clearInterval(speakingIntervalRef.current);
    };
  }, [myPrincipal]);

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

      // Set up speaking detection for local stream
      try {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        localAnalyserRef.current = analyser;
      } catch (e) {
        console.warn("Could not create local analyser", e);
      }

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

  // Handle volume slider change
  const handleVolumeChange = (principal: string, value: number) => {
    setUserVolumes((prev) => ({ ...prev, [principal]: value }));
    localStorage.setItem(`userVolume_${principal}`, String(value));
    const audio = remoteAudioRefs.current.get(principal);
    if (audio) {
      audio.volume = Math.min(3, Math.max(0, value / 100));
    }
  };

  // Close volume popover when clicking outside
  const handleTileClick = (principal: string) => {
    if (principal === myPrincipal) return;
    setVolumePopoverFor((prev) => (prev === principal ? null : principal));
  };

  // Load initial volume state from localStorage
  useEffect(() => {
    const saved: Record<string, number> = {};
    for (const [, p] of presence.entries()) {
      const pStr = p.toString();
      const vol = localStorage.getItem(`userVolume_${pStr}`);
      if (vol !== null) saved[pStr] = Number(vol);
    }
    if (Object.keys(saved).length > 0) {
      setUserVolumes((prev) => ({ ...saved, ...prev }));
    }
  }, [presence]);

  const presencePrincipals = presence.map((p) => p.toString());

  // Async profile photos for all voice channel participants
  const otherPresencePrincipals = presencePrincipals.filter(
    (p) => p !== myPrincipal,
  );
  const memberPhotos = useProfilePhotos(otherPresencePrincipals, actor);

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

  const hasPeers = Object.keys(peerStates).length > 0;
  const anyConnected =
    !hasPeers || Object.values(peerStates).some((s) => s === "connected");
  const anyFailed = Object.values(peerStates).some(
    (s) => s === "failed" || s === "closed",
  );

  return (
    <div
      className="flex-1 flex flex-col bg-dc-chat min-w-0"
      // Close volume popover on outside click
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          !target.closest("[data-volume-popover]") &&
          !target.closest("[data-volume-tile]")
        ) {
          setVolumePopoverFor(null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setVolumePopoverFor(null);
      }}
      role="presentation"
    >
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
                const isSpeaking = speakingStates[principal] ?? false;
                const showVolume = !isMe && volumePopoverFor === principal;
                const currentVolume = userVolumes[principal] ?? 100;
                // Get this user's profile photo
                const userPhoto = isMe
                  ? photoUrl
                  : (memberPhotos[principal] ?? null);

                return (
                  <div
                    key={principal}
                    className="flex flex-col items-center gap-2 relative"
                  >
                    <div
                      className={`relative ${
                        !isMe ? "cursor-pointer select-none" : ""
                      }`}
                      data-volume-tile={!isMe ? principal : undefined}
                      onClick={() => handleTileClick(principal)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          handleTileClick(principal);
                      }}
                      role={!isMe ? "button" : undefined}
                      tabIndex={!isMe ? 0 : undefined}
                    >
                      {userPhoto ? (
                        <img
                          src={userPhoto}
                          alt={name}
                          className="w-16 h-16 rounded-full object-cover shadow-lg"
                          style={{
                            boxShadow: isSpeaking
                              ? "0 0 0 3px #3ba55d, 0 0 12px 4px rgba(59,165,93,0.5)"
                              : undefined,
                          }}
                        />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg"
                          style={{
                            backgroundColor: avatarColor,
                            boxShadow: isSpeaking
                              ? "0 0 0 3px #3ba55d, 0 0 12px 4px rgba(59,165,93,0.5)"
                              : undefined,
                          }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>
                      )}
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

                    {/* Volume popover */}
                    {showVolume && (
                      <div
                        data-volume-popover="true"
                        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-52 bg-dc-sidebar border border-dc-serverbar rounded-lg shadow-2xl p-3"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-dc-primary truncate max-w-[120px]">
                            {name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setVolumePopoverFor(null)}
                            className="text-dc-muted hover:text-dc-primary transition-colors ml-2 flex-shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Volume2
                            size={12}
                            className="text-dc-muted flex-shrink-0"
                          />
                          <input
                            data-ocid="voice.volume.input"
                            type="range"
                            min="0"
                            max="300"
                            step="1"
                            value={currentVolume}
                            onChange={(e) =>
                              handleVolumeChange(
                                principal,
                                Number(e.target.value),
                              )
                            }
                            className="flex-1 h-1.5 appearance-none rounded-full bg-dc-serverbar accent-dc-blurple cursor-pointer"
                          />
                          <span className="text-xs font-mono text-dc-secondary w-10 text-right flex-shrink-0">
                            {currentVolume}%
                          </span>
                        </div>
                        <p className="text-[10px] text-dc-muted mt-1.5">
                          Click avatar to adjust volume
                        </p>
                      </div>
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
        myPrincipal={myPrincipal}
        myName={memberNames[myPrincipal || ""] || "?"}
        photoUrl={photoUrl}
        onSavePhoto={savePhoto}
        onClearPhoto={clearPhoto}
      />
    </div>
  );
}
