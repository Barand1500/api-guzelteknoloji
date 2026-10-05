import type { RowDataPacket } from "mysql2";
import { InputError, publicData } from "./categories.js";
import { initDatabase, pool, type CategoryFolderRow, type CategoryRow } from "./database.js";

interface BundleFolderRow extends CategoryFolderRow { parent_id: number | null }

export async function folderBundle(folderId: number, apiKey: string, baseUrl = "") {
  if (!Number.isSafeInteger(folderId) || folderId < 1) throw new InputError("Klasör geçersiz");
  await initDatabase();
  const [found] = await pool.query<CategoryFolderRow[]>(
    "SELECT * FROM api_category_folders WHERE id=? LIMIT 1", [folderId],
  );
  const root = found[0];
  if (!root) throw new InputError("Klasör bulunamadı", 404);
  if (!apiKey || apiKey.length > 96) throw new InputError("Geçerli bir X-API-Key gerekli", 401);
  const [keys] = await pool.query<RowDataPacket[]>(`SELECT k.id FROM api_keys k
    JOIN api_key_folders grant_folder ON grant_folder.api_key_id=k.id
    JOIN api_category_folder_closure scope
      ON scope.ancestor_id=grant_folder.folder_id AND scope.descendant_id=?
    WHERE k.api_key=? AND k.active=1 LIMIT 1`, [folderId, apiKey]);
  if (!keys[0]) throw new InputError("Bu klasöre erişim için yetkili bir X-API-Key gerekli", 401);

  const [[folders], [categories]] = await Promise.all([
    pool.query<BundleFolderRow[]>(`SELECT f.* FROM api_category_folders f
      JOIN api_category_folder_closure scope ON scope.descendant_id=f.id
      WHERE scope.ancestor_id=? ORDER BY f.name,f.id`, [folderId]),
    pool.query<CategoryRow[]>(`SELECT c.* FROM api_categories c
      JOIN api_category_folder_closure scope ON scope.descendant_id=c.folder_id
      WHERE scope.ancestor_id=? AND c.active=1 ORDER BY c.name,c.id`, [folderId]),
  ]);
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const pathFor = (folder: BundleFolderRow) => {
    const parts: string[] = [];
    const visited = new Set<number>();
    let current: BundleFolderRow | undefined = folder;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      parts.unshift(current.name);
      if (current.id === root.id) break;
      current = current.parent_id === null ? undefined : byId.get(current.parent_id);
    }
    return parts.join(" / ");
  };
  const groups = await Promise.all(folders.map(async folder => ({
    folder: { id: folder.id, name: folder.name, path: pathFor(folder) },
    categories: await Promise.all(categories.filter(category => category.folder_id === folder.id).map(async category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      data: await publicData(category, baseUrl),
    }))),
  })));
  groups.sort((a, b) => a.folder.path.localeCompare(b.folder.path, "tr"));
  return {
    keyId: String(keys[0].id),
    response: {
      success: true,
      folder: { id: root.id, name: root.name },
      groups,
    },
  };
}

export async function recordFolderUsage(keyId: string, folderId: number, originHost: string) {
  await pool.query(
    "INSERT INTO api_usage_logs(api_key_id,folder_id,origin_host) VALUES(?,?,?)",
    [keyId, folderId, originHost.slice(0, 255)],
  );
}
