// molecule.slip-uploader — molecule (IMP-251). TYPED DoR STUB (needs mock layout (spec signal: 'upload') — typed DoR stub). Real prop
// interface + token wiring; the dev team builds the interactive layout
// from the Step-7 mocks. NOT an empty placeholder.
export interface SlipUploaderProps {
  onAttach: (...args: unknown[]) => void;
  currentSlipPhotoId?: string;
}

export function SlipUploader(_props: SlipUploaderProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 text-text-secondary" data-molecule="slip-uploader" />
  );
}
