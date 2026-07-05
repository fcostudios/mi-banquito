// organism.pdf-statement-template — deterministic content sections for archived PDF payloads.
export type PdfStatementSection = {
  id: string;
  title: string;
  rows: Array<{
    label: string;
    value: string;
    href?: string | null;
  }>;
};

export interface PdfStatementTemplateProps {
  title?: string;
  sections?: PdfStatementSection[];
  items?: unknown[];
  className?: string;
}

export function PdfStatementTemplate({ title, sections = [], className }: PdfStatementTemplateProps) {
  return (
    <section
      className={["rounded-md bg-surface text-text-primary", className].filter(Boolean).join(" ")}
      data-organism="pdf-statement-template"
    >
      {title ? <h1 className="text-xl font-bold">{title}</h1> : null}
      <div className="grid gap-4">
        {sections.map((section) => (
          <section key={section.id} className="grid gap-2" data-section={section.id}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <dl className="grid gap-2">
              {section.rows.map((row) => (
                <div key={`${section.id}-${row.label}`} className="grid gap-1 border-b border-border py-2">
                  <dt className="text-sm text-text-secondary">{row.label}</dt>
                  <dd className="text-sm text-text-primary">
                    {row.href ? <a href={row.href}>{row.value}</a> : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}
