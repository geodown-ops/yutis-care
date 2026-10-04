/* The organisation tree (法人 → 廠區 → 部門) as the flat lists the admin screens show. */

/*
 * What GET /api/admin/org returns (OrgController in apps/api). Written out here because the generated contract
 * merges the org SiteDto with the /api/me SiteDto of the same name and loses `address`, `departments` and DepartmentDto.
 */
export interface Department {
  id: string; code: string | null; name: string;
  managerName: string | null; managerEmail: string | null; managerPhone: string | null;
}
export interface Site { id: string; code: string; name: string; address: string | null; departments: Department[] }
export interface LegalEntity { id: string; code: string; name: string; sites: Site[] }

export interface SiteRow extends Site { legalEntity: { id: string; code: string; name: string } }
export interface DepartmentRow extends Department { site: { id: string; code: string; name: string } }

export const flattenSites = (tree: readonly LegalEntity[]): SiteRow[] =>
  tree.flatMap(le => le.sites.map(s => ({ ...s, legalEntity: { id: le.id, code: le.code, name: le.name } })));

export const flattenDepartments = (tree: readonly LegalEntity[]): DepartmentRow[] =>
  flattenSites(tree).flatMap(s => s.departments.map(d => ({ ...d, site: { id: s.id, code: s.code, name: s.name } })));

/** Sites grouped by legal entity, for a Select; a single legal entity needs no group headings. */
export function siteOptions(tree: readonly LegalEntity[]) {
  const withSites = tree.filter(le => le.sites.length > 0);
  const item = (s: Site) => ({ value: s.id, label: `${s.name}（${s.code}）` });
  if (withSites.length <= 1) return withSites.flatMap(le => le.sites.map(item));
  return withSites.map(le => ({ group: le.name, items: le.sites.map(item) }));
}

/** Site names for a list of ids, in the tree's order; unknown ids are skipped. */
export function siteNames(tree: readonly LegalEntity[], ids: readonly string[]): string[] {
  return flattenSites(tree).filter(s => ids.includes(s.id)).map(s => s.name);
}
