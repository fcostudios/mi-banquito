// Alerts domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface AlertsService {
  readonly context: "alerts";
}

export const createAlertsService = (): AlertsService => ({ context: "alerts" });
