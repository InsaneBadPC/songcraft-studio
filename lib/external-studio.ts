import { supabase } from "@/lib/supabase";
import { getPlayableAudioUrl } from "@/lib/audio-source";

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
  stylePrompts: string[];
  lyrics: string | null;
  notes: string | null;
  coverStorageKey: string | null;
  coverUrl: string | null;
  youtubeDescription: string | null;
  youtubeTags: string | null;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type StudioStylePrompt = { id: string; userId: string; content: string; note: string | null; rating: number; createdAt: Date; updatedAt: Date };

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
export type StudioSnapshot = { albums: StudioAlbum[]; documents: StudioDocument[]; songs: StudioSong[]; versions: StudioVersion[]; rhymeWords: StudioRhymeWord[]; stylePrompts: StudioStylePrompt[] };

type SessionUser = { id: string };
const mapTime = (value: string | null | undefined) => (value ? new Date(value) : null);
const signedUrl = async (path: string | null) => {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("songcraft").createSignedUrl(path, 60 * 60);
  // Jedna poškozená nebo již neexistující příloha nesmí zablokovat celý katalog.
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};
const owner = async (): Promise<SessionUser> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Pro synchronizaci s externím cloudem se nejdříve přihlas.");
  return data.user;
};
const assert = <T>(data: T | null, error: { message: string } | null): T => {
  if (error || data === null) throw new Error(error?.message || "Externí cloud nevrátil očekávaná data.");
  return data;
};

const albumFromRow = async (row: any): Promise<StudioAlbum> => ({ id: row.id, userId: row.user_id, name: row.name, description: row.description, releaseYear: row.release_year, coverStorageKey: row.cover_path, coverUrl: await signedUrl(row.cover_path), sortOrder: row.sort_order, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const documentFromRow = async (row: any): Promise<StudioDocument> => ({ id: row.id, userId: row.user_id, albumId: row.album_id, title: row.title, stylePrompt: row.style_prompt, lyrics: row.lyrics, notes: row.notes, coverStorageKey: row.cover_path, coverUrl: await signedUrl(row.cover_path), status: row.status === "complete" ? "complete" : "draft", completedAt: mapTime(row.completed_at), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const songFromRow = async (row: any): Promise<StudioSong> => ({ id: row.id, userId: row.user_id, albumId: row.album_id, sourceDocumentId: row.source_lyric_id, title: row.title, stylePrompt: row.style_prompt, stylePrompts: songStylePrompts(row), lyrics: row.lyrics, notes: row.notes, coverStorageKey: row.cover_path, coverUrl: await signedUrl(row.cover_path), youtubeDescription: row.youtube_description ?? null, youtubeTags: row.youtube_tags ?? null, completedAt: new Date(row.completed_at), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const versionFromRow = async (row: any): Promise<StudioVersion> => {
  const storageUrl = await signedUrl(row.storage_path);
  const taggedStorageUrl = await signedUrl(row.tagged_storage_path);
  return { id: row.id, userId: row.user_id, songId: row.song_id, label: row.label, originalFileName: row.original_file_name, storageKey: row.storage_path, storageUrl: getPlayableAudioUrl(storageUrl) ?? "", mimeType: row.mime_type, byteSize: row.byte_size, rating: row.rating, isPrimary: row.is_primary, isFinal: row.is_final, id3Title: row.id3_title, id3Artist: row.id3_artist, id3Album: row.id3_album, id3TrackNumber: row.id3_track_number, id3Year: row.id3_year, id3Genre: row.id3_genre, id3Comment: row.id3_comment, taggedStorageKey: row.tagged_storage_path, taggedStorageUrl: getPlayableAudioUrl(taggedStorageUrl), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
};
const rhymeFromRow = (row: any): StudioRhymeWord => ({ id: row.id, userId: row.user_id, word: row.word, createdAt: new Date(row.created_at) });
const stylePromptFromRow = (row: any): StudioStylePrompt => ({ id: row.id, userId: row.user_id, content: row.content, note: row.note, rating: row.rating ?? 0, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
const songStylePrompts = (row: any): string[] => {
  const list = Array.isArray(row.style_prompts) ? row.style_prompts.filter((entry: unknown) => typeof entry === "string" && entry.trim()) : [];
  if (list.length) return list;
  return row.style_prompt?.trim() ? [row.style_prompt] : [];
};
const fileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "soubor";

export async function getExternalStudioSnapshot(): Promise<StudioSnapshot> {
  const [albums, documents, songs, versions, rhymeWords, stylePrompts] = await Promise.all([
    supabase.from("sc_albums").select("*").order("sort_order").order("name"),
    supabase.from("sc_lyrics").select("*").order("updated_at", { ascending: false }),
    supabase.from("sc_songs").select("*").order("completed_at", { ascending: false }),
    supabase.from("sc_audio_versions").select("*").order("is_final", { ascending: false }).order("is_primary", { ascending: false }).order("rating", { ascending: false }),
    supabase.from("sc_rhyme_words").select("*").order("word"),
    supabase.from("sc_style_prompts").select("*").order("rating", { ascending: false }).order("updated_at", { ascending: false }),
  ]);
  return {
    albums: await Promise.all(assert(albums.data, albums.error).map(albumFromRow)),
    documents: await Promise.all(assert(documents.data, documents.error).map(documentFromRow)),
    songs: await Promise.all(assert(songs.data, songs.error).map(songFromRow)),
    versions: await Promise.all(assert(versions.data, versions.error).map(versionFromRow)),
    rhymeWords: assert(rhymeWords.data, rhymeWords.error).map(rhymeFromRow),
    stylePrompts: assert(stylePrompts.data, stylePrompts.error).map(stylePromptFromRow),
  };
}

export async function uploadToExternalStorage(input: { folder: "covers" | "audio"; fileName: string; contentType: string; base64?: string; bytes?: ArrayBuffer }) {
  const user = await owner();
  const path = `${user.id}/${input.folder}/${Date.now()}-${fileName(input.fileName)}`;
  const bytes = input.bytes ? new Uint8Array(input.bytes) : input.base64 ? Uint8Array.from(globalThis.atob(input.base64), (character) => character.charCodeAt(0)) : null;
  if (!bytes) throw new Error("Chybí data souboru pro nahrání.");
  const { error } = await supabase.storage.from("songcraft").upload(path, bytes, { contentType: input.contentType, upsert: false });
  if (error) throw new Error(error.message);
  return { key: path, url: (await signedUrl(path)) || "", byteSize: bytes.byteLength, originalFileName: fileName(input.fileName), mimeType: input.contentType };
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

async function callExternalUtility<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("songcraft-utilities", { body });
  return assert(data, error) as T;
}

async function callExternalImport<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("songcraft-imports", { body });
  return assert(data, error) as T;
}

export async function importExternalDocx(fileName: string, base64: string) {
  return callExternalImport<{ id: string }>({ action: "import_docx", fileName, base64 });
}

export async function importExternalPdf(fileName: string, base64: string) {
  return callExternalImport<{ id: string }>({ action: "import_pdf", fileName, base64 });
}

export async function importExternalGoogleDocument(url: string, title?: string) {
  return callExternalImport<{ id: string }>({ action: "import_google_document", url, ...(title?.trim() ? { title: title.trim() } : {}) });
}

export async function exportExternalLibrary(albumId?: string) {
  return callExternalUtility<{ url: string; fileName: string; byteSize: number }>({ action: "export_library", ...(albumId ? { albumId } : {}) });
}

export async function exportExternalLyricsTxt() {
  return callExternalUtility<{ url: string; fileName: string; byteSize: number }>({ action: "export_lyrics_txt" });
}

export async function exportExternalTaggedCopy(versionId: string) {
  const { data, error } = await supabase.from("sc_audio_versions").select("id, label, id3_comment").eq("id", versionId).single();
  const version = assert(data, error);
  const result = await callExternalMediaFunction(version.id, version.label, version.id3_comment);
  return { url: (await signedUrl(result.path)) || "", fileName: result.fileName };
}

export type ExternalCoverGeneration =
  | { status: "processing"; jobId?: string; message?: string }
  | { status: "completed"; coverPath: string }
  | { status: "failed"; error: string };

export async function createExternalCoverGeneration(entityType: "song" | "lyric" | "album", entityId: string, options?: { format?: "youtube_16_9"; userNote?: string | null }) {
  const { data, error } = await supabase.functions.invoke("songcraft-cover-ai", { body: { action: "create", entityType, entityId, ...options } });
  const result = assert(data, error) as { jobId?: string; message?: string; error?: string };
  if (!result.jobId) throw new Error(result.error ?? "Cloudová AI nyní nemůže generování přijmout.");
  return result as { jobId: string; message?: string };
}

export async function checkExternalCoverGeneration(entityType: "song" | "lyric" | "album", entityId: string, jobId: string, options?: { format?: "youtube_16_9" }) {
  const { data, error } = await supabase.functions.invoke("songcraft-cover-ai", { body: { action: "check", entityType, entityId, jobId, ...options } });
  return assert(data, error) as ExternalCoverGeneration;
}

export type ExternalYoutubeVideo =
  | { status: "processing"; jobId: string; message?: string }
  | { status: "completed"; url: string }
  | { status: "failed"; error: string };

export const YOUTUBE_EFFECTS = ["static", "zoom", "wave", "zoom_wave", "blur"] as const;
export type YoutubeEffect = (typeof YOUTUBE_EFFECTS)[number];

export async function createExternalYoutubeVideo(songId: string, versionId: string, effect: YoutubeEffect = "zoom_wave") {
  const { data, error } = await supabase.functions.invoke("songcraft-youtube", { body: { action: "create", songId, versionId, effect } });
  return assert(data, error) as ExternalYoutubeVideo;
}

export async function checkExternalYoutubeVideo(songId: string, versionId: string, jobId: string) {
  const { data, error } = await supabase.functions.invoke("songcraft-youtube", { body: { action: "check", songId, versionId, jobId } });
  return assert(data, error) as ExternalYoutubeVideo;
}

export async function updateExternalAlbum(input: { id: string; name?: string; description?: string | null; releaseYear?: number | null; coverStorageKey?: string | null; sortOrder?: number }) {
  const { error } = await supabase.from("sc_albums").update({ name: input.name, description: input.description, release_year: input.releaseYear, cover_path: input.coverStorageKey, sort_order: input.sortOrder }).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function createExternalDocument(input: { title: string; albumId?: string | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null }) {
  const user = await owner();
  const { data, error } = await supabase.from("sc_lyrics").insert({ user_id: user.id, title: input.title, album_id: input.albumId ?? null, style_prompt: input.stylePrompt ?? null, lyrics: input.lyrics ?? null, notes: input.notes ?? null, cover_path: input.coverStorageKey ?? null }).select("id").single();
  return assert(data, error).id;
}

export async function updateExternalDocument(input: { id: string; title?: string; albumId?: string | null; stylePrompt?: string | null; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null }) {
  const { error } = await supabase.from("sc_lyrics").update({ title: input.title, album_id: input.albumId, style_prompt: input.stylePrompt, lyrics: input.lyrics, notes: input.notes, cover_path: input.coverStorageKey }).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function completeExternalDocument(id: string) {
  const { data, error } = await supabase.rpc("sc_complete_lyric", { p_lyric_id: id });
  return assert(data, error) as string;
}

export async function createExternalSong(input: { title: string; albumId?: string | null; stylePrompt?: string | null; stylePrompts?: string[]; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; sourceDocumentId?: string | null }) {
  const user = await owner();
  const prompts = (input.stylePrompts ?? []).map((entry) => entry.trim()).filter(Boolean);
  const { data, error } = await supabase.from("sc_songs").insert({ user_id: user.id, title: input.title, album_id: input.albumId ?? null, source_lyric_id: input.sourceDocumentId ?? null, style_prompt: input.stylePrompt ?? prompts[0] ?? null, style_prompts: prompts, lyrics: input.lyrics ?? null, notes: input.notes ?? null, cover_path: input.coverStorageKey ?? null }).select("id").single();
  return assert(data, error).id;
}

export async function updateExternalSong(input: { id: string; title?: string; albumId?: string | null; stylePrompt?: string | null; stylePrompts?: string[]; lyrics?: string | null; notes?: string | null; coverStorageKey?: string | null; youtubeDescription?: string | null; youtubeTags?: string | null }) {
  const prompts = input.stylePrompts === undefined ? undefined : input.stylePrompts.map((entry) => entry.trim()).filter(Boolean);
  const { error } = await supabase.from("sc_songs").update({
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.albumId !== undefined ? { album_id: input.albumId } : {}),
    ...(prompts !== undefined ? { style_prompts: prompts, style_prompt: prompts[0] ?? null } : input.stylePrompt !== undefined ? { style_prompt: input.stylePrompt } : {}),
    ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.coverStorageKey !== undefined ? { cover_path: input.coverStorageKey } : {}),
    ...(input.youtubeDescription !== undefined ? { youtube_description: input.youtubeDescription } : {}),
    ...(input.youtubeTags !== undefined ? { youtube_tags: input.youtubeTags } : {}),
  }).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export type ExternalVersionInput = {
  songId: string;
  label: string;
  originalFileName: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  rating?: number;
  isPrimary?: boolean;
  id3Title?: string | null;
  id3Artist?: string | null;
  id3Album?: string | null;
  id3TrackNumber?: string | null;
  id3Year?: string | null;
  id3Genre?: string | null;
  id3Comment?: string | null;
};

export async function createExternalVersion(input: ExternalVersionInput) {
  const user = await owner();
  const { data, error } = await supabase.from("sc_audio_versions").insert({ user_id: user.id, song_id: input.songId, label: input.label, original_file_name: input.originalFileName, storage_path: input.storageKey, mime_type: input.mimeType, byte_size: input.byteSize, rating: input.rating ?? 0, is_primary: input.isPrimary ?? false, id3_title: input.id3Title ?? null, id3_artist: input.id3Artist ?? "Temney", id3_album: input.id3Album ?? null, id3_track_number: input.id3TrackNumber ?? null, id3_year: input.id3Year ?? null, id3_genre: input.id3Genre ?? null, id3_comment: input.id3Comment ?? null }).select("id").single();
  return assert(data, error).id;
}

export async function updateExternalVersion(input: { id: string; label?: string; rating?: number; id3Title?: string | null; id3Artist?: string | null; id3Album?: string | null; id3TrackNumber?: string | null; id3Year?: string | null; id3Genre?: string | null; id3Comment?: string | null }) {
  const { error } = await supabase.from("sc_audio_versions").update({ label: input.label, rating: input.rating, id3_title: input.id3Title, id3_artist: input.id3Artist, id3_album: input.id3Album, id3_track_number: input.id3TrackNumber, id3_year: input.id3Year, id3_genre: input.id3Genre, id3_comment: input.id3Comment }).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function setExternalPrimaryVersion(id: string) {
  const { error } = await supabase.rpc("sc_set_version_state", { p_version_id: id, p_final: false });
  if (error) throw new Error(error.message);
}

export async function setExternalFinalVersion(id: string) {
  const { error } = await supabase.rpc("sc_set_version_state", { p_version_id: id, p_final: true });
  if (error) throw new Error(error.message);
}

export async function deleteExternalVersion(id: string) {
  const { error } = await supabase.from("sc_audio_versions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createExternalStylePrompt(input: { content: string; note?: string | null; rating?: number }) {
  const user = await owner();
  const { data, error } = await supabase.from("sc_style_prompts").insert({ user_id: user.id, content: input.content.trim(), note: input.note?.trim() || null, rating: input.rating ?? 0 }).select("id").single();
  return assert(data, error).id;
}

export async function updateExternalStylePrompt(input: { id: string; content?: string; note?: string | null; rating?: number }) {
  const { error } = await supabase.from("sc_style_prompts").update({ ...(input.content !== undefined ? { content: input.content.trim() } : {}), ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}), ...(input.rating !== undefined ? { rating: input.rating } : {}), updated_at: new Date().toISOString() }).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function deleteExternalStylePrompt(id: string) {
  const { error } = await supabase.from("sc_style_prompts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type YoutubeCopyAction = "description" | "tags";

export async function generateExternalYoutubeText(action: YoutubeCopyAction, songId: string) {
  const { data, error } = await supabase.functions.invoke("songcraft-copywriter", { body: { action, songId } });
  return assert(data, error) as { text: string };
}
