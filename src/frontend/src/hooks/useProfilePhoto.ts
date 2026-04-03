import { useEffect, useRef, useState } from "react";
import type { backendInterface } from "../backend";

// Module-level cache so all components share the same fetched photos
const photoCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

// Module-level version counter: incremented whenever a photo is saved or cleared.
// Components subscribe to this via usePhotoVersion() to re-fetch when any photo changes.
let photoVersion = 0;
const photoVersionListeners = new Set<() => void>();

function notifyPhotoVersionListeners() {
  photoVersion += 1;
  for (const listener of photoVersionListeners) {
    listener();
  }
}

export function usePhotoVersion(): number {
  const [version, setVersion] = useState(photoVersion);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    photoVersionListeners.add(listener);
    return () => {
      photoVersionListeners.delete(listener);
    };
  }, []);
  return version;
}

// Internal cast helper: the generated backend.ts backendInterface doesn't
// always include saveProfilePhoto/getProfilePhoto (they may be added via
// backend.d.ts augmentation). We cast to any internally to avoid import
// cycles and TS mismatches while keeping external API typed.
function asPhotoActor(actor: backendInterface) {
  return actor as any;
}

export async function fetchProfilePhoto(
  actor: backendInterface,
  principalStr: string,
): Promise<string | null> {
  if (photoCache.has(principalStr)) {
    return photoCache.get(principalStr) ?? null;
  }
  if (pendingFetches.has(principalStr)) {
    return pendingFetches.get(principalStr)!;
  }
  const { Principal } = await import("@icp-sdk/core/principal");
  const promise = asPhotoActor(actor)
    .getProfilePhoto(Principal.fromText(principalStr))
    .then((photo: string | null | undefined) => {
      const result = photo && photo.length > 0 ? photo : null;
      photoCache.set(principalStr, result);
      pendingFetches.delete(principalStr);
      return result;
    })
    .catch(() => {
      pendingFetches.delete(principalStr);
      return null;
    });
  pendingFetches.set(principalStr, promise);
  return promise;
}

export function invalidatePhotoCache(principalStr: string) {
  photoCache.delete(principalStr);
  pendingFetches.delete(principalStr);
  // Notify all hook instances that a photo changed so they re-fetch
  notifyPhotoVersionListeners();
}

export function useProfilePhotos(
  principals: string[],
  actor: backendInterface | null,
): Record<string, string | null> {
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  // Track which principals we've fetched per actor instance
  const fetchedRef = useRef<Set<string>>(new Set());
  // Subscribe to global photo version so we re-fetch when any photo changes
  const version = usePhotoVersion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional – principals.join() and version used as stable cache keys; principals.filter/length accessed inside
  useEffect(() => {
    if (!actor || principals.length === 0) return;

    // On version bump, clear fetchedRef so we re-fetch everyone
    // (a photo was saved/cleared somewhere)
    const toFetch = principals.filter((p) => !fetchedRef.current.has(p));
    if (toFetch.length === 0) return;

    for (const p of toFetch) fetchedRef.current.add(p);

    Promise.all(
      toFetch.map(async (p) => {
        const url = await fetchProfilePhoto(actor, p);
        return [p, url] as [string, string | null];
      }),
    ).then((entries) => {
      setPhotos((prev) => {
        const next = { ...prev };
        for (const [p, url] of entries) next[p] = url;
        return next;
      });
    });
  }, [actor, principals.join(","), version]);

  // When version changes, clear fetchedRef so ALL principals get re-fetched
  const prevVersionRef = useRef(version);
  useEffect(() => {
    if (version !== prevVersionRef.current) {
      prevVersionRef.current = version;
      // Bust the fetchedRef so all principals re-fetch
      fetchedRef.current = new Set();
    }
  }, [version]);

  return photos;
}

export function useProfilePhoto(
  actor?: backendInterface | null,
  myPrincipalStr?: string | null,
) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Subscribe to global version so this hook also re-fetches when photos change
  const version = usePhotoVersion();
  const lastFetchedPrincipalRef = useRef<string | null>(null);

  const savePhoto = async (dataUrl: string, principalStr?: string) => {
    setPhotoUrl(dataUrl);
    if (actor) {
      try {
        await asPhotoActor(actor).saveProfilePhoto(dataUrl);
        const key = principalStr ?? myPrincipalStr;
        if (key) invalidatePhotoCache(key);
      } catch (e) {
        console.warn("Failed to save profile photo to backend", e);
      }
    }
  };

  const clearPhoto = async (principalStr?: string) => {
    setPhotoUrl(null);
    if (actor) {
      try {
        await asPhotoActor(actor).saveProfilePhoto("");
        const key = principalStr ?? myPrincipalStr;
        if (key) invalidatePhotoCache(key);
      } catch (e) {
        console.warn("Failed to clear profile photo from backend", e);
      }
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional – version used to trigger re-fetch when photos change globally
  useEffect(() => {
    if (!actor || !myPrincipalStr) return;
    // Re-fetch whenever version changes or principal changes
    lastFetchedPrincipalRef.current = myPrincipalStr;
    // Force re-fetch from backend (bypass cache) by deleting cache entry first
    // only on version changes (someone saved a photo)
    fetchProfilePhoto(actor, myPrincipalStr).then((url) => {
      if (lastFetchedPrincipalRef.current === myPrincipalStr) {
        setPhotoUrl(url);
      }
    });
  }, [actor, myPrincipalStr, version]);

  return { photoUrl, savePhoto, clearPhoto };
}
