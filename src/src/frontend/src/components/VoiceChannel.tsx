import type { Principal } from "@icp-sdk/core/principal";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, PhoneOff, Settings, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActor } from "../hooks/useActor";
import { useAudioSettings } from "../hooks/useAudioSettings";
import {
  useGetMySignals,
  useJoinVoiceChannel,
  useLeaveVoiceChannel,
  useVoiceChannelPresence,
} from "../hooks/useQueries";
import AudioSettingsModal from "./AudioSettingsModal";

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const onStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onStateChange);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    }, timeoutMs);
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
  channelName: string;
  memberNames: Record<string, string>;
  myPrincipal: string | null;
  onJoinedChange: (channelName: string | null) => void;
  isOwner: boolean;
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
  const { settings } = useAudioSettings();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const processedSignalIds = useRef<Set<string>>(new Set());
  const channelRef = useRef(channelName);
  channelRef.current = channelName;

  const isJoinedRef = useRef(false);
  const handleLeaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const { mutateAsync: joinVoiceChannel } = useJoinVoiceChannel();
  const { mutateAsync: leaveVoiceChannel } = useLeaveVoiceChannel();

  const { data: presence = [] } = useVoiceChannelPresence(channelName);
  const { data: signals = [] } = useGetMySignals(channelName, isJoined);

  const displayName = channelName.startsWith("!")
    ? channelName.slice(1)
    : channelName;

  const createPeerConnection = useCallback(
    (remotePrincipal: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remotePrincipal);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

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
        audio.play().catch((e) => console.warn("Audio play failed", e));
      };

      peersRef.current.set(remotePrincipal, pc);
      return pc;
    },
    [],
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
            const pc = createPeerConnection(fromPrincipal);

            const offer: RTCSessionDescriptionInit = JSON.parse(sig.payload);
            await pc.setRemoteDescription(offer);

            const answer = await pc.createAnswer();
            const modifiedSdp = applyBitrate(
              answer.sdp || "",
              settings.bitrate,
            );
            await pc.setLocalDescription({ ...answer, sdp: modifiedSdp });

            await waitForIceGathering(pc);

            const p = { toString: () => fromPrincipal } as Principal;
            await actor.sendSignal(
              p,
              channelRef.current,
              "answer",
              JSON.stringify(pc.localDescription),
            );
          } else if (sig.signalType === "answer") {
            const pc = peersRef.current.get(fromPrincipal);
            if (pc && pc.signalingState === "have-local-offer") {
              const answer: RTCSessionDescriptionInit = JSON.parse(sig.payload);
              await pc.setRemoteDescription(answer);
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
    actor,
    myPrincipal,
    createPeerConnection,
    settings.bitrate,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: actor handled via ref
  useEffect(() => {
    if (!isJoined || !actor || !myPrincipal) return;

    const initiateConnections = async () => {
      const presenceSet = new Set(presence.map((p) => p.toString()));

      for (const [principal, pc] of peersRef.current) {
        const gone = !presenceSet.has(principal);
        const failed =
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.iceConnectionState === "failed";
        if (gone || failed) {
          pc.close();
          peersRef.current.delete(principal);
          const audio = remoteAudioRefs.current.get(principal);
          if (audio) {
            audio.srcObject = null;
            remoteAudioRefs.current.delete(principal);
          }
        }
      }

      for (const p of presence) {
        const remotePrincipal = p.toString();
        if (remotePrincipal === myPrincipal) continue;

        const existing = peersRef.current.get(remotePrincipal);
        const alreadyConnected =
          existing &&
          existing.connectionState !== "failed" &&
          existing.connectionState !== "closed" &&
          existing.iceConnectionState !== "failed";
        if (alreadyConnected) continue;

        if (myPrincipal < remotePrincipal) {
          const pc = createPeerConnection(remotePrincipal);
          try {
            const offer = await pc.createOffer();
            const modifiedSdp = applyBitrate(offer.sdp || "", settings.bitrate);
            await pc.setLocalDescription({ ...offer, sdp: modifiedSdp });

            await waitForIceGathering(pc);

            const principal = { toString: () => remotePrincipal } as Principal;
            await actor.sendSignal(
              principal,
              channelRef.current,
              "offer",
              JSON.stringify(pc.localDescription),
            );
          } catch (e) {
            console.warn("Failed to create/send offer", e);
            pc.close();
            peersRef.current.delete(remotePrincipal);
          }
        }
      }
    };

    initiateConnections();
  }, [
    presence,
    isJoined,
    actor,
    myPrincipal,
    createPeerConnection,
    settings.bitrate,
  ]);

  const handleLeave = useCallback(async () => {
    setIsJoined(false);
    isJoinedRef.current = false;
    onJoinedChange(null);

    for (const [, pc] of peersRef.current) {
      pc.close();
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

    try {
      if (actor) await leaveVoiceChannel(channelName);
    } catch (e) {
      console.warn("Failed to leave voice channel", e);
    }
  }, [actor, channelName, leaveVoiceChannel, onJoinedChange]);

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

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      <div className="h-12 px-4 flex items-center gap-3 border-b border-dc-serverbar shadow-sm flex-shrink-0">
        <Volume2 size={20} className="text-dc-secondary" />
        <span className="font-semibold text-dc-primary">{displayName}</span>
        <span className="text-xs text-dc-muted ml-1">
          {isJoined ? "Connected" : "Voice Channel"}
        </span>
        {isJoined && (
          <div className="flex items-center gap-1 ml-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400">Live</span>
          </div>
        )}
        {isOwner && (
          <button
            type="button"
            data-ocid="voice.open_modal_button"
            onClick={() => setShowSettings(true)}
            title="Voice channel settings"
            className="ml-auto text-dc-muted hover:text-dc-primary transition-colors"
          >
            <Settings size={16} />
          </button>
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
                      <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-dc-chat" />
                    </div>
                    <span className="text-xs text-dc-secondary text-center max-w-[80px] truncate">
                      {isMe ? `${name} (you)` : name}
                    </span>
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
            <div className="flex items-center justify-center gap-4 mt-4">
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
                data-ocid="voice.delete_button"
                onClick={handleLeave}
                title="Leave voice channel"
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
              >
                <PhoneOff size={20} className="text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      <AudioSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        showBitrate={true}
      />
    </div>
  );
}
