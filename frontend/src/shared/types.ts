export type View = "dashboard" | "new" | "keys" | "media" | "manage" | "settings";
export type Category = { id: number; name: string; slug: string; active: boolean };
export type State = { enabled: boolean; categories: Category[] };
export type Column = { id: number; name: string; fieldType: string };
export type DataRow = { id: string; data: Record<string, string>; active: boolean };
export type Schema = { category: Category; columns: Column[]; rows: DataRow[] };
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
