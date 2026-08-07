// Minimal transactional email sender — a raw fetch against Resend's HTTP
// API rather than pulling in their SDK for three call sites. Falls back to
// logging the content (never silently dropping it) when RESEND_API_KEY
// isn't set, so local dev and CI don't need a real email account to test
// signup/verification/password-reset flows end to end.

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@porphyra.example";

  if (!apiKey) {
    console.log(`[DEV email — no RESEND_API_KEY set] To: ${to} | Subject: ${subject}\n${text}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Never throw the raw response into a caller that might log it
    // somewhere less controlled — this whole error path already only
    // contains an HTTP status and Resend's own error body, no user secrets.
    throw new Error(`Failed to send email via Resend (${response.status}): ${body}`);
  }
}
