const CLAIM_NAMESPACE = "https://mi-banquito.app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimUser = Record<string, unknown>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getDbOrgIdFromUser(user: ClaimUser | null | undefined): string | undefined {
  if (!user) return undefined;

  const namespaced = user[`${CLAIM_NAMESPACE}/org_id`];
  if (typeof namespaced === "string" && UUID_RE.test(namespaced)) {
    return namespaced;
  }

  const legacy = user.org_id;
  if (typeof legacy === "string" && UUID_RE.test(legacy)) {
    return legacy;
  }

  return undefined;
}

export function getRolesFromUser(user: ClaimUser | null | undefined): string[] {
  if (!user) return [];

  const namespaced = asStringArray(user[`${CLAIM_NAMESPACE}/roles`]);
  if (namespaced.length > 0) return namespaced;

  return asStringArray(user.roles);
}
