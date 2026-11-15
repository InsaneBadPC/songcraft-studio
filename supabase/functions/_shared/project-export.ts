import JSZip from "npm:jszip";
import { Buffer } from "node:buffer";

export type ProjectExportKind = "text" | "song";
export type ProjectExportResult = { archive: Uint8Array; fileName: string };
export type ProjectImportResult = { id: string; kind: ProjectExportKind; duplicate: boolean };

const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_STORED_FILE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_BYTES = 350 * 1024 * 1024;
const MAX_AUDIO_ITEMS = 100;

const safe = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "").slice(-180) || "soubor";
const ext = (path: string | null | undefined, fallback: string) => {
  const candidate = path?.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "");
  return candidate ? `.${candidate}` : fallback;
};
const ownedPath = (userId: string, value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 1024 && !value.includes("\\") && !value.includes("..") && value.startsWith(`${userId}/`) ? value : null;
const imageMime = (path: string | null | undefined) => {
  const extension = ext(path, "").toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
};
const audioMime = (path: string | null | undefined, fallback: string | null | undefined) => {
  if (fallback && fallback.startsWith("audio/")) return fallback.split(";")[0];
  const extension = ext(path, "").toLowerCase();
  if (extension === ".mp4" || extension === ".m4a") return "audio/mp4";
  if (extension === ".aac") return "audio/aac";
  return "audio/mpeg";
};
const textOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const nullableText = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];

async function addStoredFile(zip: JSZip, supabase: any, userId: string, storagePath: string | null | undefined, target: string) {
  const path = ownedPath(userId, storagePath);
  if (!path) return null;
  const { data, error } = await supabase.storage.from("songcraft").download(path);
  if (error || !data) return null;
  if (data.size <= 0 || data.size > MAX_STORED_FILE_BYTES) throw new Error("Soubor v exportu překračuje limit.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  zip.file(target, bytes);
  return { file: target, mimeType: "", byteSize: bytes.byteLength };
}

function readme(kind: ProjectExportKind, title: string) {
  const lines = kind === "text"
    ? [
        `SCS2 / SongCraft — export textu`,
        ``,
        `Položka: ${title}`,
        ``,
        `Soubor obsahuje text písně, prompt stylu, poznámky, obal a album (pokud existuje).`,
        `Při importu se album nepřiřazuje. Import vždy vytvoří novou položku.`,
      ]
    : [
        `SCS2 / SongCraft — export skladby`,
        ``,
        `Položka: ${title}`,
        ``,
        `Soubor obsahuje skladbu, text, prompt stylu, poznámky, obal, MP3 verze, YouTube popis, tagy a stav publikace.`,
        `Při importu se album nepřiřazuje. Import vždy vytvoří novou položku.`,
      ];
  return lines.join("\n") + "\n";
}

export async function buildProjectItemArchive(supabase: any, userId: string, kind: ProjectExportKind, id: string, projectLabel: string): Promise<ProjectExportResult> {
  if (kind === "text") {
    const { data: item, error } = await supabase.from("sc_lyrics").select("*").eq("id", id).eq("user_id", userId).single();
    if (error || !item) throw new Error(error?.message || "Text nebyl nalezen.");
    const { data: album } = item.album_id
      ? await supabase.from("sc_albums").select("*").eq("id", item.album_id).eq("user_id", userId).maybeSingle()
      : { data: null };
    const zip = new JSZip();
    const cover = await addStoredFile(zip, supabase, userId, item.cover_path, `cover${ext(item.cover_path, ".jpg")}`);
    const manifest = {
      format: "songcraft-project-export",
      version: 1,
      kind,
      exportedAt: new Date().toISOString(),
      sourceProject: projectLabel,
      item,
      album: album ?? null,
      cover: cover ? { file: cover.file, mimeType: imageMime(item.cover_path), byteSize: cover.byteSize } : null,
      audio: [],
      youtube: null,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("text-pisne.txt", textOrEmpty(item.lyrics));
    zip.file("prompt-stylu.txt", textOrEmpty(item.style_prompt));
    zip.file("poznamky.txt", textOrEmpty(item.notes));
    zip.file("metadata.json", JSON.stringify(item, null, 2));
    zip.file("README.txt", readme(kind, textOrEmpty(item.title) || "Bez názvu"));
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    if (archive.byteLength <= 0 || archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Export překročil limit 300 MB.");
    return { archive, fileName: `${projectLabel}-text-${safe(textOrEmpty(item.title) || "bez-nazvu")}-${new Date().toISOString().slice(0, 10)}.zip` };
  }

  const { data: item, error } = await supabase.from("sc_songs").select("*").eq("id", id).eq("user_id", userId).single();
  if (error || !item) throw new Error(error?.message || "Skladba nebyla nalezena.");
  const { data: album } = item.album_id
    ? await supabase.from("sc_albums").select("*").eq("id", item.album_id).eq("user_id", userId).maybeSingle()
    : { data: null };
  const { data: versions, error: versionsError } = await supabase.from("sc_audio_versions").select("*").eq("song_id", id).eq("user_id", userId).order("is_final", { ascending: false }).order("is_primary", { ascending: false }).order("rating", { ascending: false });
  if (versionsError) throw new Error(versionsError.message);

  const zip = new JSZip();
  const cover = await addStoredFile(zip, supabase, userId, item.cover_path, `cover${ext(item.cover_path, ".jpg")}`);
  const audio: any[] = [];
  for (const [index, version] of (versions ?? []).entries()) {
    if (audio.length >= MAX_AUDIO_ITEMS) break;
    const base = String(index + 1).padStart(2, "0");
    const originalPath = ownedPath(userId, version.original_storage_path ?? version.storage_path);
    const taggedPath = ownedPath(userId, version.tagged_storage_path);
    const originalFile = originalPath ? await addStoredFile(zip, supabase, userId, originalPath, `audio/${base}-original${ext(originalPath, ".mp3")}`) : null;
    const taggedFile = taggedPath && taggedPath !== originalPath ? await addStoredFile(zip, supabase, userId, taggedPath, `audio/${base}-tagged${ext(taggedPath, ".mp3")}`) : null;
    audio.push({
      versionId: version.id,
      label: version.label,
      originalFileName: version.original_file_name,
      mimeType: version.mime_type,
      byteSize: version.byte_size,
      rating: version.rating,
      isPrimary: version.is_primary,
      isFinal: version.is_final,
      id3Title: version.id3_title,
      id3Artist: version.id3_artist,
      id3Album: version.id3_album,
      id3TrackNumber: version.id3_track_number,
      id3Year: version.id3_year,
      id3Genre: version.id3_genre,
      id3Comment: version.id3_comment,
      originalFile: originalFile ? { file: originalFile.file, mimeType: audioMime(originalPath, version.mime_type), byteSize: originalFile.byteSize } : null,
      taggedFile: taggedFile ? { file: taggedFile.file, mimeType: audioMime(taggedPath, version.mime_type), byteSize: taggedFile.byteSize } : null,
      metadata: version,
    });
  }

  const manifest = {
    format: "songcraft-project-export",
    version: 1,
    kind,
    exportedAt: new Date().toISOString(),
    sourceProject: projectLabel,
    item,
    album: album ?? null,
    cover: cover ? { file: cover.file, mimeType: imageMime(item.cover_path), byteSize: cover.byteSize } : null,
    audio,
    youtube: {
      description: item.youtube_description,
      tags: item.youtube_tags,
      isPublished: Boolean(item.is_published),
      publishedAt: item.published_at,
      publishedVideoId: item.published_video_id,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("text-pisne.txt", textOrEmpty(item.lyrics));
  zip.file("prompt-stylu.txt", textOrEmpty(item.style_prompt));
  zip.file("poznamky.txt", textOrEmpty(item.notes));
  zip.file("youtube-popis.txt", textOrEmpty(item.youtube_description));
  zip.file("youtube-tagy.txt", textOrEmpty(item.youtube_tags));
  zip.file("metadata.json", JSON.stringify(item, null, 2));
  zip.file("README.txt", readme(kind, textOrEmpty(item.title) || "Bez názvu"));
  const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  if (archive.byteLength <= 0 || archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Export překročil limit 300 MB.");
  return { archive, fileName: `${projectLabel}-song-${safe(textOrEmpty(item.title) || "bez-nazvu")}-${new Date().toISOString().slice(0, 10)}.zip` };
}

async function uploadImportedFile(supabase: any, userId: string, folder: "covers" | "audio", bytes: Uint8Array, fileName: string, mimeType: string) {
  const cleanName = safe(fileName);
  const path = `${userId}/${folder}/${Date.now()}-${cleanName}`;
  const { error } = await supabase.storage.from("songcraft").upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return { path, byteSize: bytes.byteLength };
}

async function readZipEntry(zip: JSZip, file: string | null | undefined) {
  if (!file) return null;
  const entry = zip.file(file);
  if (!entry) return null;
  const bytes = await entry.async("uint8array");
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_STORED_FILE_BYTES) throw new Error("Soubor v importu překračuje limit.");
  return bytes;
}

export async function importProjectItemArchive(supabase: any, userId: string, fileName: string, base64: string): Promise<ProjectImportResult> {
  if (!base64) throw new Error("Importovaný soubor chybí.");
  if (base64.length > Math.ceil(MAX_IMPORT_BYTES * 4 / 3) + 16) throw new Error("Importovaný soubor je větší než povolený limit.");
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("V souboru chybí manifest.json.");
  const manifest = JSON.parse(await manifestFile.async("string")) as any;
  if (manifest?.format !== "songcraft-project-export" || manifest?.version !== 1) throw new Error("Neznámý formát exportu.");
  if (manifest.kind !== "text" && manifest.kind !== "song") throw new Error("Neznámý typ exportu.");

  const rawTitle = textOrEmpty(manifest.item?.title).trim() || "Bez názvu";
  const table = manifest.kind === "text" ? "sc_lyrics" : "sc_songs";
  const { data: existingRows, error: existingError } = await supabase.from(table).select("id,title").eq("user_id", userId).limit(1000);
  if (existingError) throw new Error(existingError.message);
  const duplicate = (existingRows ?? []).some((row: any) => textOrEmpty(row.title).trim().toLowerCase() === rawTitle.toLowerCase());
  const title = (duplicate ? `${rawTitle} (duplikát)` : rawTitle).slice(0, 255);
  const duplicateNote = duplicate ? `[DUPLIKÁT] Importováno ${new Date().toLocaleDateString("cs-CZ")} ze souboru ${fileName}.\n\n` : "";

  const coverBytes = await readZipEntry(zip, manifest.cover?.file);
  let coverPath: string | null = null;
  if (coverBytes) {
    const uploaded = await uploadImportedFile(supabase, userId, "covers", coverBytes, manifest.cover?.fileName || `cover${ext(manifest.cover?.file, ".jpg")}`, manifest.cover?.mimeType || imageMime(manifest.cover?.file));
    coverPath = uploaded.path;
  }

  if (manifest.kind === "text") {
    const { data, error } = await supabase.from("sc_lyrics").insert({
      user_id: userId,
      album_id: null,
      title,
      style_prompt: nullableText(manifest.item?.style_prompt),
      lyrics: nullableText(manifest.item?.lyrics),
      notes: `${duplicateNote}${textOrEmpty(manifest.item?.notes)}`.trim() || null,
      cover_path: coverPath,
      status: "draft",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: data.id, kind: "text", duplicate };
  }

  const { data: song, error: songError } = await supabase.from("sc_songs").insert({
    user_id: userId,
    album_id: null,
    source_lyric_id: null,
    title,
    style_prompt: nullableText(manifest.item?.style_prompt),
    style_prompts: stringArray(manifest.item?.style_prompts).length ? stringArray(manifest.item?.style_prompts) : (nullableText(manifest.item?.style_prompt) ? [manifest.item.style_prompt] : []),
    lyrics: nullableText(manifest.item?.lyrics),
    notes: `${duplicateNote}${textOrEmpty(manifest.item?.notes)}`.trim() || null,
    cover_path: coverPath,
    youtube_description: nullableText(manifest.youtube?.description),
    youtube_tags: nullableText(manifest.youtube?.tags),
    is_published: Boolean(manifest.youtube?.isPublished),
    published_at: manifest.youtube?.publishedAt || null,
    published_video_id: nullableText(manifest.youtube?.publishedVideoId),
    completed_at: manifest.item?.completed_at || new Date().toISOString(),
  }).select("id").single();
  if (songError) throw new Error(songError.message);

  for (const entry of manifest.audio ?? []) {
    const originalBytes = await readZipEntry(zip, entry.originalFile?.file);
    const taggedBytes = await readZipEntry(zip, entry.taggedFile?.file);
    if (!originalBytes && !taggedBytes) continue;
    const originalMime = entry.originalFile?.mimeType || audioMime(entry.originalFile?.file, entry.mimeType);
    const taggedMime = entry.taggedFile?.mimeType || audioMime(entry.taggedFile?.file, entry.mimeType);
    const original = originalBytes ? await uploadImportedFile(supabase, userId, "audio", originalBytes, entry.originalFile?.fileName || entry.originalFileName || `audio-${entry.label || "original"}.mp3`, originalMime) : null;
    const tagged = taggedBytes ? await uploadImportedFile(supabase, userId, "audio", taggedBytes, entry.taggedFile?.fileName || `${entry.label || "tagged"}-tagged.mp3`, taggedMime) : null;
    const originalPath = original?.path ?? tagged?.path ?? null;
    const { error: versionError } = await supabase.from("sc_audio_versions").insert({
      user_id: userId,
      song_id: song.id,
      label: (textOrEmpty(entry.label) || "Verze").slice(0, 255),
      original_file_name: (textOrEmpty(entry.originalFileName) || "audio.mp3").slice(0, 255),
      storage_path: originalPath,
      original_storage_path: originalPath,
      tagged_storage_path: tagged?.path ?? null,
      mime_type: originalMime || "audio/mpeg",
      byte_size: original?.byteSize ?? tagged?.byteSize ?? 0,
      rating: Number(entry.rating) || 0,
      is_primary: Boolean(entry.isPrimary),
      is_final: Boolean(entry.isFinal),
      id3_title: nullableText(entry.id3Title),
      id3_artist: nullableText(entry.id3Artist),
      id3_album: nullableText(entry.id3Album),
      id3_track_number: nullableText(entry.id3TrackNumber),
      id3_year: nullableText(entry.id3Year),
      id3_genre: nullableText(entry.id3Genre),
      id3_comment: nullableText(entry.id3Comment),
    });
    if (versionError) throw new Error(versionError.message);
  }

  return { id: song.id, kind: "song", duplicate };
}