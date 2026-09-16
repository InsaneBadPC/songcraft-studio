import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

/**
 * Automaticky ukládá rozepsaný text editoru do AsyncStorage.
 * Chrání proti ztrátě dat při selhání uložení nebo obnovení stránky.
 */

export type DraftData = {
  title: string;
  albumId: string | null;
  stylePrompt: string;
  stylePrompts: string[];
  lyrics: string;
  notes: string;
  coverStorageKey: string | null;
  coverUrl: string | null;
  savedAt: number;
};

const PREFIX = "songcraft-draft-";
const MAX_AGE_MS = 86_400_000;

function draftKey(id: string | null) {
  return `${PREFIX}${id ?? "new"}`;
}

/** Načte draft z úložiště. Vrátí null pokud neexistuje nebo je starší než 24h. */
export async function loadDraft(id: string | null): Promise<DraftData | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    if (!draft || typeof draft !== "object" || typeof draft.savedAt !== "number") return null;
    if (Date.now() - draft.savedAt > MAX_AGE_MS) {
      await clearDraft(id);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Uloží draft do úložiště. */
export async function saveDraft(id: string | null, data: Omit<DraftData, "savedAt">): Promise<void> {
  try {
    const entry: DraftData = { ...data, savedAt: Date.now() };
    await AsyncStorage.setItem(draftKey(id), JSON.stringify(entry));
  } catch {
    // Tichá chyba - draft ochrana není kritická
  }
}

/** Smaže draft z úložiště (po úspěšném uložení na server). */
export async function clearDraft(id: string | null): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftKey(id));
  } catch {
    // tichá chyba
  }
}

type DraftForm = { title: string; albumId: string | null; stylePrompt?: string; stylePrompts?: string[]; lyrics: string; notes: string; coverStorageKey: string | null; coverUrl: string | null };

/**
 * Auto-ukládá rozepsaný formulář do AsyncStorage s debounce 1.5s.
 * Vrací null (připraven) nebo draftLoaded boolean - komponenta
 * sama zavolá loadDraft a aplikuje obnovený draft.
 */
export function useDraftStorage(form: DraftForm, id: string | null) {
  const formRef = useRef(form);
  formRef.current = form;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave s debounce 1.5s
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const f = formRef.current;
      void saveDraft(id, {
        title: f.title,
        albumId: f.albumId,
        stylePrompt: f.stylePrompt ?? "",
        stylePrompts: f.stylePrompts ?? [],
        lyrics: f.lyrics,
        notes: f.notes,
        coverStorageKey: f.coverStorageKey,
        coverUrl: f.coverUrl,
      });
    }, 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [form.title, form.albumId, form.stylePrompt, form.stylePrompts, form.lyrics, form.notes, form.coverStorageKey, form.coverUrl, id]);

  return null;
}