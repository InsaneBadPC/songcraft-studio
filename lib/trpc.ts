import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import {
  callExternalMediaFunction,
  checkExternalCoverGeneration,
  checkExternalYoutubeVideo,
  completeExternalDocument,
  createExternalAlbum,
  createExternalCoverGeneration,
  createExternalYoutubeVideo,
  createExternalDocument,
  createExternalRhymeWord,
  createExternalSong,
  createExternalVersion,
  deleteExternalRhymeWord,
  deleteExternalVersion,
  exportExternalLibrary,
  exportExternalTaggedCopy,
  getExternalStudioSnapshot,
  importExternalDocx,
  importExternalGoogleDocument,
  setExternalFinalVersion,
  setExternalPrimaryVersion,
  updateExternalAlbum,
  updateExternalDocument,
  updateExternalSong,
  updateExternalVersion,
  uploadToExternalStorage,
} from "@/lib/external-studio";
import { supabase } from "@/lib/supabase";

const studioSnapshotKey = ["songcraft", "supabase", "snapshot"] as const;
const unavailable = async (_input?: unknown) => { throw new Error("Tato externí operace se právě dokončuje. Zkus ji znovu za okamžik."); };
const directProvider = ({ children }: PropsWithChildren<{ client?: unknown; queryClient?: unknown }>) => children;

/**
 * Kompatibilní klient zachovává rozhraní obrazovek, ale volá přímo externí
 * Supabase. Název zůstal zachován, aby migrace nepřerušila navigaci aplikace.
 */
export const trpc = {
  Provider: directProvider,
  useUtils: () => {
    const queryClient = useQueryClient();
    return { studio: { snapshot: { invalidate: () => queryClient.invalidateQueries({ queryKey: studioSnapshotKey }) } } };
  },
  auth: {
    logout: { useMutation: () => useMutation({ mutationFn: async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; return { success: true } as const; } }) },
  },
  studio: {
    snapshot: { useQuery: (_input?: undefined, options?: { enabled?: boolean }) => useQuery({ queryKey: studioSnapshotKey, queryFn: getExternalStudioSnapshot, enabled: options?.enabled ?? true }) },
    createCustomRhymeWord: { useMutation: () => useMutation({ mutationFn: ({ word }: { word: string }) => createExternalRhymeWord(word) }) },
    deleteCustomRhymeWord: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => deleteExternalRhymeWord(String(id)) }) },
    createAlbum: { useMutation: () => useMutation({ mutationFn: (input: { name: string; description?: string | null; releaseYear?: number | null; coverStorageKey?: string | null; coverUrl?: string | null }) => createExternalAlbum(input) }) },
    updateAlbum: { useMutation: () => useMutation({ mutationFn: (input: { id: string | number; name?: string; description?: string | null; releaseYear?: number | null; coverStorageKey?: string | null; sortOrder?: number }) => updateExternalAlbum({ ...input, id: String(input.id) }) }) },
    createDocument: { useMutation: () => useMutation({ mutationFn: (input: { title: string; albumId?: string | number | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; coverUrl?: string | null }) => createExternalDocument({ ...input, albumId: input.albumId === null || input.albumId === undefined ? null : String(input.albumId) }) }) },
    updateDocument: { useMutation: () => useMutation({ mutationFn: (input: { id: string | number; title?: string; albumId?: string | number | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; coverUrl?: string | null }) => updateExternalDocument({ ...input, id: String(input.id), albumId: input.albumId === null || input.albumId === undefined ? input.albumId : String(input.albumId) }) }) },
    completeDocument: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => completeExternalDocument(String(id)) }) },
    createSong: { useMutation: () => useMutation({ mutationFn: (input: { title: string; albumId?: string | number | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; coverUrl?: string | null }) => createExternalSong({ ...input, albumId: input.albumId === null || input.albumId === undefined ? null : String(input.albumId) }) }) },
    updateSong: { useMutation: () => useMutation({ mutationFn: (input: { id: string | number; title?: string; albumId?: string | number | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; coverUrl?: string | null }) => updateExternalSong({ ...input, id: String(input.id), albumId: input.albumId === null || input.albumId === undefined ? input.albumId : String(input.albumId) }) }) },
    upload: { useMutation: () => useMutation({ mutationFn: uploadToExternalStorage }) },
    createVersion: { useMutation: () => useMutation({ mutationFn: (input: { songId: string | number; label: string; originalFileName: string; storageKey: string; storageUrl?: string; mimeType: string; byteSize: number; rating?: number; isPrimary?: boolean; id3Title?: string | null; id3Artist?: string | null; id3Album?: string | null; id3TrackNumber?: string | null; id3Year?: string | null; id3Genre?: string | null; id3Comment?: string | null }) => createExternalVersion({ ...input, songId: String(input.songId) }) }) },
    updateVersion: { useMutation: () => useMutation({ mutationFn: (input: { id: string | number; label?: string; rating?: number; id3Title?: string | null; id3Artist?: string | null; id3Album?: string | null; id3TrackNumber?: string | null; id3Year?: string | null; id3Genre?: string | null; id3Comment?: string | null }) => updateExternalVersion({ ...input, id: String(input.id) }) }) },
    setPrimaryVersion: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => setExternalPrimaryVersion(String(id)) }) },
    setFinalVersion: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => setExternalFinalVersion(String(id)) }) },
    deleteVersion: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => deleteExternalVersion(String(id)) }) },
    prepareManagedCopy: { useMutation: () => useMutation({ mutationFn: ({ id, label, note }: { id: string | number; label: string; note?: string | null }) => callExternalMediaFunction(String(id), label, note) }) },
    exportTaggedCopy: { useMutation: () => useMutation({ mutationFn: ({ id }: { id: string | number }) => exportExternalTaggedCopy(String(id)) }) },
    exportWholeLibrary: { useMutation: () => useMutation({ mutationFn: ({ albumId }: { albumId?: string | number }) => exportExternalLibrary(albumId === undefined ? undefined : String(albumId)) }) },
    createCoverGeneration: { useMutation: () => useMutation({ mutationFn: ({ entityType, entityId }: { entityType: "song" | "lyric"; entityId: string | number }) => createExternalCoverGeneration(entityType, String(entityId)) }) },
    checkCoverGeneration: { useMutation: () => useMutation({ mutationFn: ({ entityType, entityId, jobId }: { entityType: "song" | "lyric"; entityId: string | number; jobId: string }) => checkExternalCoverGeneration(entityType, String(entityId), jobId) }) },
    createYoutubeVideo: { useMutation: () => useMutation({ mutationFn: ({ songId, versionId }: { songId: string | number; versionId: string | number }) => createExternalYoutubeVideo(String(songId), String(versionId)) }) },
    checkYoutubeVideo: { useMutation: () => useMutation({ mutationFn: ({ songId, versionId, jobId }: { songId: string | number; versionId: string | number; jobId: string }) => checkExternalYoutubeVideo(String(songId), String(versionId), jobId) }) },
    importDocx: { useMutation: () => useMutation({ mutationFn: ({ fileName, base64 }: { fileName: string; base64: string }) => importExternalDocx(fileName, base64).then((result) => result.id) }) },
    importGoogleDocument: { useMutation: () => useMutation({ mutationFn: ({ url, title }: { url: string; title: string }) => importExternalGoogleDocument(url, title).then((result) => result.id) }) },
  },
};

export function createTRPCClient() { return {}; }
