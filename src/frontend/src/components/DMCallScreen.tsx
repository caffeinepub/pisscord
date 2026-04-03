import type { Principal } from "@icp-sdk/core/principal";
import {
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import { useAudioSettings } from "../hooks/useAudioSettings";
import { useProfilePhotos } from "../hooks/useProfilePhoto";
import { useGetDMCallPresence, useGetMyDMSignals } from "../hooks/useQueries";

// Same STUN-only ICE servers as VoiceChannel.tsx
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

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

function getAvatarColor(principal: string): string {
  let hash = 0;
  for (let i = 0; i < principal.length; i++)
    hash = (hash * 31 + principal.charCodeAt(i)) | 0;
  const hues = [264, 145, 30, 340, 200, 60, 180, 310];
  const hue = hues[Math.abs(hash) % hues.length];
  return `oklch(0.55 0.20 ${hue})`;
}

interface Props {
  dmChannelId: string;
  allMembers: Principal[];
  memberNames: Record<string, string>;
  myPrincipal: string | null;
  onEnd: () => void;
}

interface PeerState {
  pc: RTCPeerConnection;
  hasRemoteDescription: boolean;
}

export default function DMCallScreen({
  dmChannelId,
  allMembers,
  memberNames,
  myPrincipal,
  onEnd,
}: Props) {
  const { actor } = useActor();
  const { settings } = useAudioSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string, string>>({});
  const [speakingStates, setSpeakingStates] = useState<Record<string, boolean>>(
    {},
  );
  const [elapsed, setElapsed] = useState(0);

  // Per-user volume state
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [volumePopoverFor, setVolumePopoverFor] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const processedSignalIds = useRef<Set<string>>(new Set());
  const peerMissCountRef = useRef<Map<string, number>>(new Map());
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const dmChannelRef = useRef(dmChannelId);
  dmChannelRef.current = dmChannelId;

  // Speaking detection refs
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const [isConnected, setIsConnected] = useState(false);

  const { data: presence = [] } = useGetDMCallPresence(dmChannelId, true);
  const { data: signals = [] } = useGetMyDMSignals(dmChannelId, true);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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

  // Initialize local media on mount
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: settingsRef.current.noiseSuppression,
            autoGainControl: settingsRef.current.autoGainControl,
            echoCancellation: settingsRef.current.echoCancellation,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        localStreamRef.current = stream;

        // Set up speaking detection for local stream
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        localAnalyserRef.current = analyser;

        setIsConnected(true);
      } catch (e) {
        console.error("DM call: failed to get mic", e);
      }
    };
    setup();
    return () => {
      cancelled = true;
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

  const createPeerConnection = useCallback(
    (remotePrincipal: string): PeerState => {
      closePeer(remotePrincipal);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peerState: PeerState = { pc, hasRemoteDescription: false };

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

  // Process incoming signals
  useEffect(() => {
    if (signals.length === 0) return;

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

            // CRITICAL: use sig.from directly — real Principal from backend
            await actorRef.current!.sendDMSignal(
              sig.from,
              dmChannelRef.current,
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
          console.warn("DM signal processing error", sig.signalType, e);
        }
      }
    };

    processSignals();
  }, [signals, myPrincipal, createPeerConnection, updatePeerStateDisplay]);

  // Initiate connections to presence members
  useEffect(() => {
    if (!myPrincipal || !isConnected) return;

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

            // CRITICAL: use p directly — real Principal from getDMCallPresence
            await actorRef.current!.sendDMSignal(
              p,
              dmChannelRef.current,
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
            console.warn("DM call: failed to create offer", e);
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
    myPrincipal,
    isConnected,
    createPeerConnection,
    closePeer,
    updatePeerStateDisplay,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, peerState] of peersRef.current) peerState.pc.close();
      peersRef.current.clear();
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      for (const [, audio] of remoteAudioRefs.current) audio.srcObject = null;
      remoteAudioRefs.current.clear();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const handleEnd = async () => {
    // Close all peers
    for (const [principal] of peersRef.current) closePeer(principal);
    peersRef.current.clear();

    // Stop local tracks
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }

    // Notify backend
    try {
      if (actorRef.current)
        await actorRef.current.endDMCall(dmChannelRef.current);
    } catch (e) {
      console.warn("endDMCall failed", e);
    }

    onEnd();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    for (const [, audio] of remoteAudioRefs.current) {
      audio.muted = next;
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

  const handleTileClick = (principal: string) => {
    if (principal === myPrincipal) return;
    setVolumePopoverFor((prev) => (prev === principal ? null : principal));
  };

  // Load initial volume state from localStorage on mount
  useEffect(() => {
    const saved: Record<string, number> = {};
    for (const p of allMembers) {
      const pStr = p.toString();
      const vol = localStorage.getItem(`userVolume_${pStr}`);
      if (vol !== null) saved[pStr] = Number(vol);
    }
    if (Object.keys(saved).length > 0) {
      setUserVolumes(saved);
    }
  }, [allMembers]);

  // Build participant list: show all members (not just presence)
  const allPrincipals = allMembers.map((p) => p.toString());
  if (myPrincipal && !allPrincipals.includes(myPrincipal)) {
    allPrincipals.push(myPrincipal);
  }

  // Async profile photos for call participants
  const otherCallPrincipals = allPrincipals.filter((p) => p !== myPrincipal);
  const memberPhotos = useProfilePhotos(otherCallPrincipals, actor);

  return (
    <div
      className="flex-1 flex flex-col bg-dc-chat min-w-0"
      data-ocid="dm.call.panel"
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
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-dc-serverbar shadow-sm flex-shrink-0">
        <span className="font-semibold text-dc-primary text-sm">
          Voice Call
        </span>
        <span className="text-xs text-dc-muted font-mono">
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Participant tiles */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="flex flex-wrap gap-6 justify-center max-w-3xl">
          {allPrincipals.map((principal) => {
            const name =
              memberNames[principal] || `${principal.slice(0, 8)}...`;
            const isMe = principal === myPrincipal;
            const connState = peerStates[principal];
            const isSpeaking = speakingStates[principal] ?? false;
            const isInPresence = presence.some(
              (p) => p.toString() === principal,
            );
            const avatarColor = getAvatarColor(principal);
            const userPhoto = memberPhotos[principal] ?? null;
            const showVolume = !isMe && volumePopoverFor === principal;
            const currentVolume = userVolumes[principal] ?? 100;

            let statusLabel = "";
            let statusColor = "text-dc-muted";
            if (isMe) {
              statusLabel = isMuted ? "Muted" : "You";
              statusColor = "text-green-400";
            } else if (connState === "connected") {
              statusLabel = "Connected";
              statusColor = "text-green-400";
            } else if (connState === "failed") {
              statusLabel = "Failed";
              statusColor = "text-red-400";
            } else if (connState) {
              statusLabel = connState;
              statusColor = "text-yellow-400";
            } else if (!isInPresence) {
              statusLabel = "Not in call";
              statusColor = "text-dc-muted";
            } else {
              statusLabel = "Connecting...";
              statusColor = "text-yellow-400";
            }

            return (
              <div
                key={principal}
                className="flex flex-col items-center gap-3 w-28 relative"
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
                      className="w-20 h-20 rounded-full object-cover shadow-lg transition-all duration-150"
                      style={{
                        boxShadow: isSpeaking
                          ? "0 0 0 3px rgba(34,197,94,0.8), 0 0 16px 4px rgba(34,197,94,0.35)"
                          : undefined,
                      }}
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg transition-all duration-150"
                      style={{
                        backgroundColor: avatarColor,
                        boxShadow: isSpeaking
                          ? "0 0 0 3px rgba(34,197,94,0.8), 0 0 16px 4px rgba(34,197,94,0.35)"
                          : undefined,
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

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
                        data-ocid="dm.call.volume.input"
                        type="range"
                        min="0"
                        max="300"
                        step="1"
                        value={currentVolume}
                        onChange={(e) =>
                          handleVolumeChange(principal, Number(e.target.value))
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

                <div className="text-center">
                  <p className="text-sm font-medium text-dc-primary truncate max-w-[100px]">
                    {isMe ? `${name} (you)` : name}
                  </p>
                  <p
                    className={`text-xs ${statusColor} truncate max-w-[100px]`}
                  >
                    {statusLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom control bar */}
      <div className="bg-dc-serverbar px-6 py-4 flex items-center justify-center gap-4 flex-shrink-0">
        {/* Mute */}
        <button
          type="button"
          data-ocid="dm.call.toggle"
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

        {/* Deafen */}
        <button
          type="button"
          data-ocid="dm.call.secondary_button"
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen" : "Deafen"}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isDeafened
              ? "bg-red-600 hover:bg-red-500"
              : "bg-dc-sidebar hover:bg-dc-active"
          }`}
        >
          {isDeafened ? (
            <VolumeX size={20} className="text-white" />
          ) : (
            <Headphones size={20} className="text-dc-primary" />
          )}
        </button>

        {/* End call */}
        <button
          type="button"
          data-ocid="dm.call.delete_button"
          onClick={handleEnd}
          title="End call"
          className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
        >
          <PhoneOff size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}
