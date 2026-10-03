export type View = "dashboard" | "new" | "keys" | "media" | "manage" | "settings";
export type Category = { id: number; name: string; slug: string; tableName?: string; active: boolean };
export type State = { enabled: boolean; categories: Category[] };
export type Column = { id: number; name: string; sqlName?: string; fieldType: "text" | "number" | "boolean" | "date" | "relation"; referenceCategoryId?: number | null };
export type DataRow = { id: string; data: Record<string, string>; active: boolean; createdAt?: string; updatedAt?: string };
export type Schema = { category: Category; columns: Column[]; rows: DataRow[]; relationOptions: Record<number, { id: string; label: string }[]> };
export type ApiKey = {
  id: string;
  projectName: string;
  apiKey: string;
  active: boolean;
  usageCount: number;
  siteCount: number;
  categoryNames: string[];
  categoryIds: number[];
};
export type Media = { id: string; name: string; url: string; mimeType: string };
export type LoginSettings = {
  theme: "light" | "dark";
  quickLoginEnabled: boolean;
  imageUrl: string;
};
export const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  theme: "light",
  quickLoginEnabled: true,
  imageUrl: "/login-character.jpg",
};
