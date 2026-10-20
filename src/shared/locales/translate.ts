/** Minimal dependency-free translation dictionary shape (nested string tree). */
export type Dict = { [key: string]: string | Dict }

/**
 * Dot-path lookup (e.g. "auth.loginTitle") with {{param}} interpolation. Used directly by
 * main-process code, which has no react-i18next runtime. Falls back to the raw key if the
 * path doesn't resolve to a string (should only happen on a typo - both tr/en dicts are
 * typed to have identical shape).
 */
export function translate(
  dict: Dict,
  key: string,
  params?: Record<string, string | number>
): string {
  const parts = key.split('.')
  let node: string | Dict = dict
  for (const part of parts) {
    if (typeof node !== 'object' || node === null || !(part in node)) return key
    node = node[part]
  }
  if (typeof node !== 'string') return key
  if (!params) return node
  return node.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params[name] ?? ''))
}
