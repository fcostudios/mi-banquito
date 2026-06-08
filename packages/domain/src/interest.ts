// Interest domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface InterestService {
  readonly context: "interest";
}

export const createInterestService = (): InterestService => ({ context: "interest" });
