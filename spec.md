# Pisscord

## Current State

Pisscord is a Discord clone on ICP with working server voice channels (WebRTC P2P), text channels, DMs, group DMs, and group voice calls. Server voice channels work correctly. DM calls are broken due to a ring poller bug where the callee is already in `participants` before they ever see the ring. Profile photos are saved to the backend but disappear on refresh because the hook only loads photos when SettingsModal is open, and the photo cache caches `null` permanently for other users who haven't uploaded yet, preventing re-fetch after they upload.

## Requested Changes (Diff)

### Add
- `invitedMembers` field to `DMCallState` backend type — stores the full invited members list separately from `participants`
- `getDMInvitedMembers(dmChannelId)` backend query — returns the invited members list for UI tile display
- Mic denied error UI in `DMCallScreen` — visible error message instead of silent infinite connecting
- Global photo cache bust signal — `photoVersion` counter in `useProfilePhoto.ts` that increments on any `saveProfilePhoto` call, forcing all hook instances to re-fetch

### Modify
- `startDMCall` backend — store ONLY `[initiator]` in `participants`; store full `members` in `invitedMembers`
- `endDMCall` backend — no-op (return without trapping) if call does not exist
- `joinDMCall` backend — already correct; confirm it adds caller to participants
- Ring poller in `App.tsx` — change `if (amParticipant) continue` to `if (amInitiator) continue`
- `useProfilePhoto.ts` — add module-level `photoVersion` signal; `invalidatePhotoCache` increments it; `useProfilePhotos` subscribes to it so all instances re-fetch when any photo changes
- `SettingsModal.tsx` — remove `useProfilePhoto` hook from inside the modal; receive `photoUrl`, `savePhoto`, `clearPhoto` as props from App.tsx where the hook is lifted
- `App.tsx` — lift `useProfilePhoto` to top level so photo is always loaded; pass photo props down to SettingsModal; update `handleStartCall` to pass members separately
- `DMCallScreen` — use `getDMInvitedMembers` to build the tile list instead of relying solely on `allMembers` prop; show mic error state
- `backend.d.ts` — add `getDMInvitedMembers` signature and update `DMCallState` type to include `invitedMembers`

### Remove
- Dead `groupCallMembers` / `void groupCallMembers` in App.tsx
- Unused `dmChannelId` prop from `DMCallRinger` interface (keep harmless, low priority)

## Implementation Plan

1. Update `src/backend/main.mo`:
   - Add `invitedMembers: [Principal]` to `DMCallState` type
   - `startDMCall`: set `participants = [initiator]`, set `invitedMembers = members` (ensuring initiator is present)
   - `endDMCall`: change trap-on-missing to silent return
   - Add `getDMInvitedMembers` public query

2. Update `src/frontend/src/backend.d.ts`:
   - Add `invitedMembers: Array<Principal>` to `DMCallState` interface
   - Add `getDMInvitedMembers(dmChannelId: string): Promise<Array<Principal>>` to `backendInterface`

3. Update `src/frontend/src/hooks/useProfilePhoto.ts`:
   - Add module-level `photoVersionListeners` set and `photoVersion` counter
   - `invalidatePhotoCache` increments version and notifies listeners
   - `useProfilePhotos` subscribes to version changes to re-fetch when any photo updates
   - `useProfilePhoto` (own photo hook) subscribes the same way

4. Update `src/frontend/src/App.tsx`:
   - Lift `useProfilePhoto(actor, myPrincipal)` to App.tsx top level
   - Pass `photoUrl`, `savePhoto`, `clearPhoto` as props to SettingsModal
   - Fix ring poller: `amInitiator` check instead of `amParticipant`
   - Remove dead `groupCallMembers` code

5. Update `src/frontend/src/components/SettingsModal.tsx`:
   - Remove internal `useProfilePhoto` hook call
   - Accept `photoUrl`, `savePhoto`, `clearPhoto` as props

6. Update `src/frontend/src/components/DMCallScreen.tsx`:
   - Add `micError` state; show visible error if getUserMedia fails
   - Fetch `getDMInvitedMembers` on mount to get full tile list
