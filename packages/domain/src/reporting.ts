// Reporting domain — typed service boundary (DoR stub; operation
// bodies are dev-team work). Consumes @mi-banquito/contracts + @mi-banquito/db.
export interface ReportingService {
  readonly context: "reporting";
}

export const createReportingService = (): ReportingService => ({ context: "reporting" });
