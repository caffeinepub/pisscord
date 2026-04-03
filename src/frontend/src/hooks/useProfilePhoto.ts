import { useEffect, useRef, useState } from "react";
import type { backendInterface } from "../backend";

// Module-level cache so all components share the same fetched photos
const photoCache = new Map<string, string | null>();
const pendingFetches = new Map<string, Promise<string | null>>();

// Internal cast helper: the generated backend.ts backendInterface doesn't
// always include saveProfilePhoto/getProfilePhoto (they may be added via
// backend.d.ts augmentation). We cast to any internally to avoid import
// cycles and TS mismatches while keeping external API typed.
function asPhotoActor(actor: backendInterface) {
  // biome-ignore lint/suspicious/noExplicitAny: backend methods not in generated interface
  return actor as any;
}

/**
 * Fetch a single user's profile photo from the ICP backend.
 * Results are cached module-level to avoid redundant backend calls.
 */
export async function fetchProfilePhoto(
  actor: backendInterface,
  principalStr: string,
): Promise<string | null> {
  if (photoCache.has(principalStr)) {
    return photoCache.get(principalStr) ?? null;
  }
  // Deduplicate concurrent fetches for the same principal
  if (pendingFetches.has(principalStr)) {
    return pendingFetches.get(principalStr)!;
  }
  const { Principal } = await import("@icp-sdk/core/principal");
  const promise = asPhotoActor(actor)
    .getProfilePhoto(Principal.fromText(principalStr))
    .then((photo: string | null | undefined) => {
      const result = photo ?? null;
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

/**
 * Invalidate the cache for a principal (call after saving a new photo).
 */
export function invalidatePhotoCache(principalStr: string) {
  photoCache.delete(principalStr);
  pendingFetches.delete(principalStr);
}

/**
 * Hook: fetches and caches profile photos for a list of principals.
 * Returns a record mapping principal string -> data URL | null.
 */
export function useProfilePhotos(
  principals: string[],
  actor: backendInterface | null,
): Record<string, string | null> {
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  // Use a ref to track which principals we've already kicked off fetches for
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!actor || principals.length === 0) return;

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
  }, [actor, principals]);

  return photos;
}

/**
 * Hook for the current user's own profile photo.
 * Handles save (to backend + local state) and clear.
 */
export function useProfilePhoto(
  actor?: backendInterface | null,
  myPrincipalStr?: string | null,
) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Save photo to backend and update local state
  const savePhoto = async (dataUrl: string, principalStr?: string) => {
    setPhotoUrl(dataUrl);
    if (actor) {
      try {
        await asPhotoActor(actor).saveProfilePhoto(dataUrl);
        // Invalidate cache so other components re-fetch
        const key = principalStr ?? myPrincipalStr;
        if (key) invalidatePhotoCache(key);
      } catch (e) {
        console.warn("Failed to save profile photo to backend", e);
      }
    }
  };

  // Clear photo — remove from backend by saving empty string
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

  // On mount (or when actor/principal become available), load own photo from backend
  useEffect(() => {
    if (!actor || !myPrincipalStr) return;
    fetchProfilePhoto(actor, myPrincipalStr).then((url) => {
      if (url) setPhotoUrl(url);
    });
  }, [actor, myPrincipalStr]);

  return { photoUrl, savePhoto, clearPhoto };
}
