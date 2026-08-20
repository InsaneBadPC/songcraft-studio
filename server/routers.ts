import { Buffer } from "node:buffer";

import NodeID3 from "node-id3";
import { z } from "zod";

import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { storageGetSignedUrl, storagePut } from "./storage";
import { COOKIE_NAME } from "../shared/const.js";

const nullableText = (max: number) => z.string().max(max).nullable().optional();
const nullableId = z.number().int().positive().nullable().optional();
const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file";
const metadataSchema = z.object({
  label: z.string().trim().min(1).max(255),
  id3Title: nullableText(255),
  id3Artist: nullableText(255),
  id3Album: nullableText(255),
  id3TrackNumber: nullableText(32),
  id3Year: nullableText(8),
  id3Genre: nullableText(128),
  id3Comment: nullableText(5000),
  rating: z.number().int().min(0).max(5).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  studio: router({
    snapshot: protectedProcedure.query(({ ctx }) => db.getStudioSnapshot(ctx.user.id)),
    createAlbum: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(255), description: nullableText(5000), releaseYear: z.number().int().min(1900).max(2200).nullable().optional(), coverStorageKey: nullableText(512), coverUrl: nullableText(1024) }))
      .mutation(({ ctx, input }) => db.createAlbum({ ...input, userId: ctx.user.id })),
    updateAlbum: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(255).optional(), description: nullableText(5000), releaseYear: z.number().int().min(1900).max(2200).nullable().optional(), coverStorageKey: nullableText(512), coverUrl: nullableText(1024), sortOrder: z.number().int().optional() }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateAlbum(ctx.user.id, id, data);
      }),
    createDocument: protectedProcedure
      .input(z.object({ title: z.string().trim().min(1).max(255), albumId: nullableId, stylePrompt: nullableText(30000), lyrics: nullableText(100000), notes: nullableText(30000), coverStorageKey: nullableText(512), coverUrl: nullableText(1024) }))
      .mutation(({ ctx, input }) => db.createDocument({ ...input, userId: ctx.user.id })),
    updateDocument: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(255).optional(), albumId: nullableId, stylePrompt: nullableText(30000), lyrics: nullableText(100000), notes: nullableText(30000), coverStorageKey: nullableText(512), coverUrl: nullableText(1024) }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateDocument(ctx.user.id, id, data);
      }),
    completeDocument: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.completeDocument(ctx.user.id, input.id)),
    createSong: protectedProcedure
      .input(z.object({ title: z.string().trim().min(1).max(255), albumId: nullableId, stylePrompt: nullableText(30000), lyrics: nullableText(100000), notes: nullableText(30000), coverStorageKey: nullableText(512), coverUrl: nullableText(1024) }))
      .mutation(({ ctx, input }) => db.createSong({ ...input, userId: ctx.user.id, sourceDocumentId: null, completedAt: new Date() })),
    updateSong: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(255).optional(), albumId: nullableId, stylePrompt: nullableText(30000), lyrics: nullableText(100000), notes: nullableText(30000), coverStorageKey: nullableText(512), coverUrl: nullableText(1024) }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateSong(ctx.user.id, id, data);
      }),
    upload: protectedProcedure
      .input(z.object({ folder: z.enum(["covers", "audio"]), fileName: z.string().min(1).max(512), contentType: z.string().min(1).max(128), base64: z.string().min(1).refine((value) => Buffer.byteLength(value, "base64") <= 25 * 1024 * 1024, "Soubor je pro bezpečné nahrání příliš velký (maximum je 25 MB).") }))
      .mutation(async ({ ctx, input }) => {
        const isImage = input.contentType.startsWith("image/");
        const isMp3 = input.contentType === "audio/mpeg" || input.contentType === "audio/mp3" || input.fileName.toLowerCase().endsWith(".mp3");
        if ((input.folder === "covers" && !isImage) || (input.folder === "audio" && !isMp3)) throw new Error("Typ souboru neodpovídá zvolenému umístění.");
        const bytes = Buffer.from(input.base64, "base64");
        const fileName = safeFileName(input.fileName);
        const stored = await storagePut(`songcraft/${ctx.user.id}/${input.folder}/${fileName}`, bytes, input.contentType);
        return { ...stored, byteSize: bytes.byteLength, originalFileName: fileName, mimeType: input.contentType };
      }),
    createVersion: protectedProcedure
      .input(z.object({ songId: z.number().int().positive(), originalFileName: z.string().min(1).max(512), storageKey: z.string().min(1).max(512), storageUrl: z.string().min(1).max(1024), mimeType: z.string().min(1).max(128), byteSize: z.number().int().nonnegative(), isPrimary: z.boolean().optional(), ...metadataSchema.shape }))
      .mutation(({ ctx, input }) => db.createAudioVersion({ ...input, userId: ctx.user.id, rating: input.rating ?? 0, isPrimary: input.isPrimary ?? false, isFinal: false })),
    updateVersion: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), ...metadataSchema.shape }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateAudioVersion(ctx.user.id, id, data);
      }),
    setPrimaryVersion: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.markAudioVersionPrimary(ctx.user.id, input.id)),
    setFinalVersion: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.markAudioVersionFinal(ctx.user.id, input.id)),
    deleteVersion: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => db.deleteAudioVersion(ctx.user.id, input.id)),
    exportTaggedCopy: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getAudioVersion(ctx.user.id, input.id);
        if (!version) throw new Error("Zvuková verze nebyla nalezena.");
        const sourceUrl = await storageGetSignedUrl(version.storageKey);
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error("Originální MP3 se nepodařilo načíst pro export.");
        const source = Buffer.from(await response.arrayBuffer());
        const tagged = NodeID3.update({
          title: version.id3Title || undefined,
          artist: version.id3Artist || undefined,
          album: version.id3Album || undefined,
          trackNumber: version.id3TrackNumber || undefined,
          year: version.id3Year || undefined,
          genre: version.id3Genre || undefined,
          comment: version.id3Comment ? { language: "eng", text: version.id3Comment } : undefined,
        }, source);
        if (!(tagged instanceof Buffer)) throw new Error("ID3 tagy se nepodařilo vložit do nové kopie MP3.");
        const exportName = `${version.originalFileName.replace(/\.mp3$/i, "")}-tagged.mp3`;
        const stored = await storagePut(`songcraft/${ctx.user.id}/audio/export/${safeFileName(exportName)}`, tagged, "audio/mpeg");
        await db.updateAudioVersion(ctx.user.id, version.id, { taggedStorageKey: stored.key, taggedStorageUrl: stored.url });
        return { ...stored, fileName: exportName };
      }),
  }),
});

export type AppRouter = typeof appRouter;
