import messages from "@/lib/i18n/en-US.json";

export default function MemberDetailLoading() {
  return <main className="mx-auto grid w-full max-w-5xl gap-4 p-6" data-testid="member_detail_loading">
    <h1 className="text-2xl font-bold text-text-primary">{messages.sprint1.members.detailTitle}</h1>
    <p className="rounded-md border border-border bg-surface p-5 text-text-secondary">{messages.sprint1.members.loadingDetail}</p>
  </main>;
}
