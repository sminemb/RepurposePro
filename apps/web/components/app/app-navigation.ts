export function isNavigationItemActive(
  pathname: string,
  activePath: string,
  matchDescendants = false,
): boolean {
  return pathname === activePath || (matchDescendants && pathname.startsWith(`${activePath}/`));
}
