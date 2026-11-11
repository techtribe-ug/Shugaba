import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms · Shugaba" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="11 November 2026">
      <p>
        These terms cover using Shugaba. This deployment is a hackathon demo on the PayPal sandbox: the accounts and dollars
        are test ones and nothing here is a real financial service.
      </p>
      <Section heading="How a circle works">
        <p>
          Everyone in a circle agrees the contribution, the schedule and the payout order before it starts. Each round, every
          member pays in through PayPal and one member receives the pot. The order, amounts and dates are recorded and
          signed so nobody can change them quietly.
        </p>
      </Section>
      <Section heading="Paying in">
        <p>
          By joining you allow Shugaba to collect your agreed contribution through PayPal on each due date, plus the
          protection fee shown before you join. You can pay early from My money. If a payment fails we tell you, try again,
          and may offer a payment plan.
        </p>
      </Section>
      <Section heading="Protection">
        <p>
          The protection fee goes into a pool that can cover a missed contribution so the member whose turn it is still gets
          paid on time. A member whose round was covered owes that amount back and may be sent a PayPal invoice for it.
        </p>
      </Section>
      <Section heading="Payouts">
        <p>
          Payouts are sent with PayPal Payouts to the PayPal account on your profile. PayPal&apos;s own rules, limits and
          country restrictions apply.
        </p>
      </Section>
      <Section heading="Fair use">
        <p>
          Don&apos;t join a circle you can&apos;t pay into, use someone else&apos;s PayPal account, or try to change the
          ledger. We can pause an account that does.
        </p>
      </Section>
    </LegalPage>
  );
}
