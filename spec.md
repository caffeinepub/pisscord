# Pisscord

## Current State
Three confirmed bugs in v20:
1. Profile photos: useProfilePhoto.ts is localStorage-only. Backend saveProfilePhoto/getProfilePhoto exist but are never called.
2. Ghost rings: App.tsx polling only adds rings, never removes when call ends.
3. 1-on-1 DM call: DmChatArea passes only [otherPrincipal], missing caller. Caller sees 'not in call'.
4. Presence teardown: single stale poll closes all WebRTC peers.

## Requested Changes (Diff)

### Add
- Backend calls in useProfilePhoto.ts with in-memory cache
- Ring cleanup pass in App.tsx polling

### Modify
- useProfilePhoto.ts: integrate backend actor calls
- App.tsx: sweep stale rings in poll loop
- DmChatArea: include myPrincipal in 1-on-1 call members
- VoiceChannel + DMCallScreen: 3-miss guard before closing peer

### Remove
- Nothing

## Implementation Plan
1. Rewrite useProfilePhoto.ts to call actor.saveProfilePhoto and actor.getProfilePhoto with Map cache
2. Update SettingsModal to pass actor to photo hook
3. Update all avatar render sites to fetch from backend
4. Fix App.tsx poll to remove rings where getDMCallState returns null
5. Fix DmChatArea to include myPrincipal in 1-on-1 call member list
6. Add 3-miss guard to VoiceChannel and DMCallScreen presence teardown
