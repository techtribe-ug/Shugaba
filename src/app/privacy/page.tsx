import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy · Shugaba" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="11 November 2026">
      <p>
        Shugaba runs savings circles (ajo, esusu, adashe) on top of PayPal. This page says what we keep about you, why, and
        who else sees it. This deployment is a hackathon demo on the PayPal sandbox: no real money moves.
      </p>
      <Section heading="What we keep">
        <ul className="list-disc pl-5">
          <li>Your name, email and the email of your PayPal account.</li>
          <li>If you log in with PayPal: the name, email and PayPal account ID PayPal shares with us after you agree on PayPal&apos;s screen.</li>
          <li>The circles you join, your place in the rotation, and every contribution, payout and recovery, with the references PayPal issued.</li>
          <li>Your WhatsApp number, only if you turn WhatsApp alerts on in Settings.</li>
          <li>Your Circle Score, worked out from how you have paid in past rounds.</li>
        </ul>
      </Section>
      <Section heading="What we never keep">
        <p>
          Card numbers, bank details and PayPal passwords. You type those into PayPal, not into Shugaba. We hold a PayPal
          payment token that lets us collect your agreed contribution on the agreed date, and you can cancel it from your PayPal account
          at any time.
        </p>
      </Section>
      <Section heading="Who sees it">
        <ul className="list-disc pl-5">
          <li>The other members of your circle see your name, your turn and whether each round is paid. They never see your email or PayPal details.</li>
          <li>PayPal processes every payment and payout under its own privacy statement.</li>
          <li>Meta delivers WhatsApp alerts if you opt in.</li>
          <li>Our AI helper (Google Gemini) reads circle facts to answer your questions. It never receives payment credentials.</li>
        </ul>
      </Section>
      <Section heading="Your choices">
        <p>
          You can turn WhatsApp alerts off or leave a circle from Settings. Ask us to delete your
          account and we will, except for payment records we must keep so every member&apos;s history stays correct.
        </p>
      </Section>
    </LegalPage>
  );
}
