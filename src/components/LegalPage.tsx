import Link from "next/link";
import { SITE } from "@/lib/site";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Effective {SITE.legalEffectiveDate}</p>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_a]:font-medium [&_a]:text-accent [&_a:hover]:underline [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
        Questions? Email <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-accent hover:underline">{SITE.contactEmail}</a>. See also
        the <Link href="/privacy" className="font-medium text-accent hover:underline">Privacy Policy</Link> and{" "}
        <Link href="/terms" className="font-medium text-accent hover:underline">Terms of Service</Link>.
      </p>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
