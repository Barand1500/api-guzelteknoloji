export type View = "dashboard" | "new" | "keys" | "manage" | "settings";
export type Category = { id: number; name: string; slug: string; tableName?: string; active: boolean; icon?: string };
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
export type LoginSettings = {
  quickLoginEnabled: boolean;
  imageUrl: string;
};
export const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  quickLoginEnabled: true,
  imageUrl: "/login-character.jpg",
};
