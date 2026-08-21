import { supabase } from "@/lib/supabase";

export type StudioAlbum = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  releaseYear: number | null;
  coverStorageKey: string | null;
  coverUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioDocument = {
  id: string;
  userId: string;
  albumId: string | null;
  title: string;
  stylePrompt: string | null;
  lyrics: string | null;
  notes: string | null;
  coverStorageKey: string | null;
  coverUrl: string | null;
  status: "draft" | "complete";
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioSong = {
  id: string;
  userId: string;
  albumId: string | null;
  sourceDocumentId: string | null;
  title: string;
  stylePrompt: string | null;
  lyrics: string | null;
  notes: string | null;
  coverStorageKey: string | null;
  coverUrl: string | null;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioVersion = {
  id: string;
  userId: string;
  songId: string;
  label: string;
  originalFileName: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  byteSize: number;
  rating: number;
  isPrimary: boolean;
  isFinal: boolean;
  id3Title: string | null;
  id3Artist: string | null;
  id3Album: string | null;
  id3TrackNumber: string | null;
  id3Year: string | null;
  id3Genre: string | null;
  id3Comment: string | null;
  taggedStorageKey: string | null;
  taggedStorageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioRhymeWord = { id: string; userId: string; word: string; createdAt: Date };
export type StudioSnapshot = { albums: StudioAlbum[]; documents: StudioDocument[]; songs: StudioSong[]; versions: StudioVersion[]; rhymeWords: StudioRhymeWord[] };

type SessionUser = { id: string };
const mapTime = (value: string | null | undefined) => (value ? new Date(value) : null);
const withPublicUrl = (path: string | null) => path ? supabase.storage.from("songcraft").getPublicUrl(path).data.publicUrl : null;
const owner = async (): Promise<SessionUser> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Pro synchronizaci s externím cloudem se nejdříve přihlas.");
  return data.user;
};
const assert = <T>(data: T | null, error: { message: string } | null): T => {
  if (error || data === null) throw new Error(error?.message || "Externí cloud nevrátil očekávaná data.");
  return data;
};

const albumFromRow = (row: any): StudioAlbum => ({ id: row.id, userId: row.user_id, name: row.name, description: row.description, releaseYear: row.release_year, coverStorageKey: row.cover_path, coverUrl: withPublicUrl(row.cover_path), sortOrder: row.sort_order, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const documentFromRow = (row: any): StudioDocument => ({ id: row.id, userId: row.user_id, albumId: row.album_id, title: row.title, stylePrompt: row.style_prompt, lyrics: row.lyrics, notes: row.notes, coverStorageKey: row.cover_path, coverUrl: withPublicUrl(row.cover_path), status: row.status === "complete" ? "complete" : "draft", completedAt: mapTime(row.completed_at), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const songFromRow = (row: any): StudioSong => ({ id: row.id, userId: row.user_id, albumId: row.album_id, sourceDocumentId: row.source_lyric_id, title: row.title, stylePrompt: row.style_prompt, lyrics: row.lyrics, notes: row.notes, coverStorageKey: row.cover_path, coverUrl: withPublicUrl(row.cover_path), completedAt: new Date(row.completed_at), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const versionFromRow = (row: any): StudioVersion => ({ id: row.id, userId: row.user_id, songId: row.song_id, label: row.label, originalFileName: row.original_file_name, storageKey: row.storage_path, storageUrl: withPublicUrl(row.storage_path) || "", mimeType: row.mime_type, byteSize: row.byte_size, rating: row.rating, isPrimary: row.is_primary, isFinal: row.is_final, id3Title: row.id3_title, id3Artist: row.id3_artist, id3Album: row.id3_album, id3TrackNumber: row.id3_track_number, id3Year: row.id3_year, id3Genre: row.id3_genre, id3Comment: row.id3_comment, taggedStorageKey: row.tagged_storage_path, taggedStorageUrl: withPublicUrl(row.tagged_storage_path), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const rhymeFromRow = (row: any): StudioRhymeWord => ({ id: row.id, userId: row.user_id, word: row.word, createdAt: new Date(row.created_at) });
const fileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "soubor";

export async function getExternalStudioSnapshot(): Promise<StudioSnapshot> {
  const [albums, documents, songs, versions, rhymeWords] = await Promise.all([
    supabase.from("sc_albums").select("*").order("sort_order").order("name"),
    supabase.from("sc_lyrics").select("*").order("updated_at", { ascending: false }),
    supabase.from("sc_songs").select("*").order("completed_at", { ascending: false }),
    supabase.from("sc_audio_versions").select("*").order("is_final", { ascending: false }).order("is_primary", { ascending: false }).order("rating", { ascending: false }),
    supabase.from("sc_rhyme_words").select("*").order("word"),
  ]);
  return {
    albums: assert(albums.data, albums.error).map(albumFromRow),
    documents: assert(documents.data, documents.error).map(documentFromRow),
    songs: assert(songs.data, songs.error).map(songFromRow),
    versions: assert(versions.data, versions.error).map(versionFromRow),
    rhymeWords: assert(rhymeWords.data, rhymeWords.error).map(rhymeFromRow),
  };
}

export async function uploadToExternalStorage(input: { folder: "covers" | "audio"; fileName: string; contentType: string; base64: string }) {
  const user = await owner();
  const path = `${user.id}/${input.folder}/${Date.now()}-${fileName(input.fileName)}`;
  const binary = globalThis.atob(input.base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const { error } = await supabase.storage.from("songcraft").upload(path, bytes, { contentType: input.contentType, upsert: false });
  if (error) throw new Error(error.message);
  return { key: path, url: withPublicUrl(path) || "", byteSize: bytes.byteLength, originalFileName: fileName(input.fileName), mimeType: input.contentType };
}

export async function createExternalAlbum(input: { name: string; description?: string | null; releaseYear?: number | null; coverStorageKey?: string | null }) {
  const user = await owner();
  const { data, error } = await supabase.from("sc_albums").insert({ user_id: user.id, name: input.name, description: input.description ?? null, release_year: input.releaseYear ?? null, cover_path: input.coverStorageKey ?? null }).select("id").single();
  return assert(data, error).id;
}

export async function createExternalRhymeWord(word: string) {
  const user = await owner();
  const { data, error } = await supabase.from("sc_rhyme_words").upsert({ user_id: user.id, word: word.toLocaleLowerCase("cs-CZ") }, { onConflict: "user_id,word" }).select("id").single();
  return assert(data, error).id;
}

export async function deleteExternalRhymeWord(id: string) {
  const { error } = await supabase.from("sc_rhyme_words").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function callExternalMediaFunction(versionId: string, label: string, note?: string | null) {
  const { data, error } = await supabase.functions.invoke("songcraft-media", { body: { action: "prepare_tagged_copy", versionId, label, note: note ?? null } });
  return assert(data, error) as { path: string; fileName: string };
}

