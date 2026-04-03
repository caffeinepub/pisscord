# Cordis

## Current State
v10 is live and working. Voice channels function correctly with:
- Complete ICE gathering before signaling (2 update calls total)
- TURN relay server (Open Relay Project) for NAT traversal
- Real ICP Principal objects passed to `sendSignal` (sig.from / p from presence list)
- actorRef pattern to avoid stale closure on actor
- PeerState interface tracking `hasRemoteDescription`
- Diagnostics panel with countCandidates, peerStates, diagInfo
- Desktop-only layout (no mobile support)
- No audio settings controls
- No theme switcher

v11 attempted to add audio settings, mobile layout, and bitrate — but broke voice by:
1. Replacing real Principals with fake `{ toString: () => ... }` objects — exact same v8 serialization bug
2. Removing the TURN server config

## Requested Changes (Diff)

### Add
- `useAudioSettings` hook (localStorage-backed): noiseSuppression, autoGainControl, echoCancellation, bitrate (32/64/128), theme (discord/skype)
- `SettingsModal` component: audio toggles + bitrate selector + theme switcher (Discord vs Skype)
- Gear icon (⚙) in ChannelSidebar user panel — opens SettingsModal for all users
- Gear icon in VoiceChannel header (owner only) — opens SettingsModal with bitrate visible
- Mobile layout in App.tsx: bottom tab bar (Servers / Channels / Chat / Members), `md:hidden` mobile / `hidden md:flex` desktop
- Skype theme CSS variables in index.css under `[data-theme="skype"]` — dark navy/blue palette replacing neutral grays, Skype blue (#00AFF0) accent
- Theme applied via `document.documentElement.setAttribute('data-theme', theme)` on init and on change
- `applyBitrate(sdp, kbps)` helper in VoiceChannel — modifies SDP payload sent via sendSignal (not setLocalDescription)

### Modify
- `VoiceChannel.tsx`: wire in audio settings ADDITIVELY. `getUserMedia` uses settings constraints. Bitrate applied to SDP string before JSON.stringify (after waitForIceGathering, before sendSignal). isOwner prop added. Settings gear added to controls. **ALL existing voice logic preserved verbatim** — ICE_SERVERS (with TURN), actorRef pattern, PeerState interface, countCandidates, diagInfo, peerStates, closePeer, updatePeerStateDisplay, handleForceReconnect, real Principal objects.
- `App.tsx`: add activeMobileTab state, mobile layout block (md:hidden), desktop layout (hidden md:flex), isOwner derived and passed to VoiceChannel, setActiveMobileTab("chat") on channel/voice select
- `ChannelSidebar.tsx`: add Settings gear icon in user panel

### Remove
- Nothing from v10 should be removed

## Implementation Plan
1. Create `src/frontend/src/hooks/useAudioSettings.ts` — AudioSettings interface + useAudioSettings hook with localStorage persistence and theme application
2. Create `src/frontend/src/components/SettingsModal.tsx` — Dialog with audio toggles, bitrate select, and Discord/Skype theme toggle
3. Modify `src/frontend/src/index.css` — add `[data-theme="skype"]` block with dark navy/blue OKLCH values
4. Modify `src/frontend/src/components/VoiceChannel.tsx` — add applyBitrate helper, isOwner prop, useAudioSettings wiring, getUserMedia constraints, SDP bitrate injection (in sendSignal payload only), settings gear button + SettingsModal render. Zero changes to ICE, signaling, Principal handling.
5. Modify `src/frontend/src/components/ChannelSidebar.tsx` — add Settings gear icon with click handler and SettingsModal render
6. Modify `src/frontend/src/App.tsx` — mobile bottom tab bar layout, isOwner passed to VoiceChannel
