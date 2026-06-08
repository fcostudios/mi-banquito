// Audit domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface AuditService {
  readonly context: "audit";
}

export const createAuditService = (): AuditService => ({ context: "audit" });
