export type View = "dashboard" | "new" | "keys" | "manage" | "statistics" | "playground" | "schema-keys" | "settings" | "appearance";
export type PanelPage = Exclude<View, "manage">;
export type PanelPreferences = { sidebarOrder: PanelPage[]; quickAccess: (PanelPage | null)[]; searchWidth: number; fontFamily: "inter" | "manrope" | "roboto-flex" | "ibm-plex-sans" };
export type CategoryFolder = { id: number; name: string; parentId: number | null };
export type Category = { id: number; name: string; slug: string; tableName?: string; active: boolean; icon?: string; folderId?: number | null; folderPath?: string };
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
  folderNames: string[];
};
export type UsageSummary = {
  from: string;
  to: string;
  totals: { requests: number; activeKeys: number; sites: number; lastRequest: string | null };
  daily: { day: string; requests: number }[];
  byCategory: { categoryId: number | null; name: string; requests: number }[];
  byProject: { keyId: string; projectName: string; requests: number }[];
};
export type UsageLogPage = { rows: { id: number; createdAt: string; originHost: string | null; projectName: string; categoryName: string | null }[]; page: number; pageSize: number; total: number };
export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; from: string; passwordConfigured: boolean; encryptionKeyConfigured: boolean };
export type SchemaOverviewCategory = Category & { columns: { id: number; name: string; sqlName: string; fieldType: Column["fieldType"]; referenceCategoryId: number | null; referenceCategoryName: string | null }[] };
export type LoginSettings = {
  quickLoginEnabled: boolean;
  imageUrl: string;
};
export const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  quickLoginEnabled: true,
  imageUrl: "/login-character.jpg",
};
