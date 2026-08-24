import { supabase } from "@/lib/supabase";
import { createAssistantRequest, type AssistantHistoryMessage } from "./assistant-chat-payload";

export type StudioAssistantMessage = AssistantHistoryMessage;
export { createAssistantRequest } from "./assistant-chat-payload";

export async function askStudioAssistant(message: string, history: StudioAssistantMessage[]) {
  const payload = createAssistantRequest(message, history);
  const { data, error } = await supabase.functions.invoke("songcraft-studio-assistant", { body: payload });
  if (error) throw new Error(error.message || "Asistent nyní není dostupný.");
  const answer = (data as { answer?: unknown } | null)?.answer;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("Asistent nevrátil odpověď.");
  return answer.trim();
}
