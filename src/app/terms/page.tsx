import Link from "next/link";
import { LegalPage, Section } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = { title: `Terms of Service — ${SITE.name}` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of {SITE.name}, a site run by {SITE.operator} for practising natural deduction proofs. By using the site, you agree
        to them. If you don&apos;t agree, please don&apos;t use the site.
      </p>

      <Section title="Using the site">
        <p>
          {SITE.name} is an educational tool. You may use it to learn and practise logic, on your own or as part of a course. You can use it without an
          account, in which case your progress is saved only in your browser.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>Give accurate information when you create an account, and keep your password secure.</li>
          <li>You&apos;re responsible for activity on your account. Tell us if you think someone else has used it.</li>
          <li>If you&apos;re under the age required to consent to online services where you live, you need permission from a parent, guardian or school.</li>
        </ul>
      </Section>

      <Section title="Acceptable use">
        <p>Please don&apos;t:</p>
        <ul>
          <li>Interfere with the site, try to access other people&apos;s accounts or data, or get around its security.</li>
          <li>Use automated tools to submit answers in bulk or to scrape the site.</li>
          <li>Tamper with your recorded progress, or misrepresent it to an instructor.</li>
          <li>Use the site in a way that breaks the law or your school&apos;s academic integrity rules.</li>
        </ul>
      </Section>

      <Section title="Your work and our content">
        <p>
          The proofs you write are yours. You give us permission to store and display them to you so the site can work. The problems, explanations,
          software and design of {SITE.name} belong to {SITE.operator}. You may use them for personal and classroom learning, but not republish or resell
          them without permission.
        </p>
      </Section>

      <Section title="Grades and accuracy">
        <p>
          We work hard to make the proof checker correct, but it may contain mistakes. {SITE.name} is a practice aid, and a result on this site
          isn&apos;t an official grade unless your instructor says otherwise. Progress saved only in your browser can be lost if you clear your browser
          data.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          We may change, add or remove features and problems, and the site may sometimes be unavailable. We may suspend or close accounts that break
          these terms. You can stop using the site at any time and ask us to delete your account.
        </p>
      </Section>

      <Section title="Disclaimer and limitation of liability">
        <p>
          The site is provided &quot;as is&quot; without warranties of any kind. To the fullest extent allowed by law, {SITE.operator} are not liable for
          indirect or consequential losses, or for loss of data or progress, arising from your use of the site.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Our <Link href="/privacy">Privacy Policy</Link> explains what we collect and how we use it.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          If we update these terms, we&apos;ll change the date at the top of this page. Continuing to use the site after a change means you accept the
          updated terms.
        </p>
      </Section>
    </LegalPage>
  );
}
