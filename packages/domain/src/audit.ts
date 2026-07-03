// Audit domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface AuditService {
  readonly context: "audit";
}

export class AuditWriteFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteFailure";
  }
}

export type AuditWriter<Entry, Tx> = (input: { tx: Tx; entry: Entry }) => Promise<unknown>;

export interface WriteWithAuditInput<T> {
  write: () => Promise<T>;
  audit: (result: T) => Promise<unknown>;
}

export const createAuditService = (): AuditService => ({ context: "audit" });

export const createAuditFailure = (message: string): AuditWriteFailure => new AuditWriteFailure(message);

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error) {
    return error;
  }
  return "audit write failed";
};

export const writeWithAudit = async <T>({ write, audit }: WriteWithAuditInput<T>): Promise<T> => {
  const result = await write();
  try {
    await audit(result);
  } catch (error) {
    if (error instanceof AuditWriteFailure) {
      throw error;
    }
    throw createAuditFailure(errorMessage(error));
  }
  return result;
};
