/** Şablon değişken yardımcıları (kalıcı veri MySQL). */

export type TemplateChannel = "email" | "sms";

export function parseVariableKeys(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function channelLabel(type: TemplateChannel): string {
  return type === "sms" ? "SMS" : "E-Posta";
}
