export function isTenantExportRoutePath(pathname: string) {
  return /^\/admin\/orgs\/[^/]+\/export(?:\/|$)/.test(pathname);
}
