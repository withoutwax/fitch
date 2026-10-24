import { LegalPage, Section } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = { title: `Privacy Policy — ${SITE.name}` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {SITE.name} is a practice site for natural deduction proofs. This policy explains what information we collect, why, and the choices you
        have. We collect only what we need to run the site and show you your progress.
      </p>

      <Section title="Using the site without an account">
        <p>
          You can solve problems without signing in. Your submissions, solved problems and proof drafts are then saved in your browser&apos;s local
          storage on your own device. They are not sent to us. Clearing your browser data deletes them, and they don&apos;t follow you to other
          browsers or devices.
        </p>
      </Section>

      <Section title="Information we collect when you sign in">
        <ul>
          <li>
            <strong>Account details:</strong> your email address and display name. If you sign in with Google, we receive your name and email
            address from Google. We never see your Google password.
          </li>
          <li>
            <strong>Learning activity:</strong> which problems you submit, whether each submission was accepted, the proofs you write, how many
            lines they have, and when you submitted them.
          </li>
          <li>
            <strong>Progress saved before signing in:</strong> when you sign in, anything saved in your browser is moved into your account and then
            removed from the browser.
          </li>
        </ul>
        <p>We don&apos;t collect payment information, precise location, or contacts, and we don&apos;t run advertising or third-party tracking.</p>
      </Section>

      <Section title="How we use it">
        <ul>
          <li>To sign you in and keep your account secure.</li>
          <li>To save your proofs and show your progress, history and activity on your profile.</li>
          <li>To keep the site working, fix problems, and improve the exercises.</li>
        </ul>
        <p>We don&apos;t sell your information or use it for advertising.</p>
      </Section>

      <Section title="Where it's stored">
        <p>
          Accounts and progress are stored with Google Firebase (Firebase Authentication and Cloud Firestore), which processes the data on our behalf
          under Google&apos;s terms. Data may be stored on servers outside your country. Security rules ensure each account can only read and write
          its own progress.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          We use browser storage only for things the site needs: keeping you signed in, saving proof drafts, and saving progress when you aren&apos;t
          signed in. We don&apos;t use advertising or analytics cookies.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          We don&apos;t share your personal information, except with service providers that run the site for us (such as Firebase), when required by
          law, or to protect the safety and security of the site and its users. If you use {SITE.name} through a class, your instructor may ask you to
          share your progress, and you choose whether to do so.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          We keep your account and progress for as long as your account exists. You can ask us to access, correct, export or delete your data at any
          time by emailing <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Deleting your account permanently removes your progress
          and history. Depending on where you live, you may have additional rights under laws such as the GDPR, and you can contact us to exercise
          them.
        </p>
      </Section>

      <Section title="Children and students">
        <p>
          {SITE.name} is meant for students. If you are under the age required to consent to online services where you live (13 in the United
          States), use the site only with permission from a parent, guardian or school. If you believe a child has given us personal information
          without permission, contact us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change this policy, we&apos;ll update the date at the top of this page. For significant changes, we&apos;ll give notice on the site.
        </p>
      </Section>
    </LegalPage>
  );
}
