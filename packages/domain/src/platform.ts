// Platform domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface PlatformService {
  readonly context: "platform";
}

export const createPlatformService = (): PlatformService => ({ context: "platform" });
