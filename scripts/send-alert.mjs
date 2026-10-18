// Emails an alert to the owner through Gmail (or any SMTP server).
// Needs repository secrets SMTP_USER, SMTP_PASSWORD (a Gmail app password) and ALERT_EMAIL.
// Without them it prints a notice and exits cleanly, so a missing setup never hides the real error.
//   node scripts/send-alert.mjs "<subject>" <body-file>
import { readFileSync, existsSync } from "node:fs";

const [subject, bodyFile] = process.argv.slice(2);
const { SMTP_USER, SMTP_PASSWORD, ALERT_EMAIL, SMTP_HOST = "smtp.gmail.com", SMTP_PORT = "465" } = process.env;

if (!SMTP_USER || !SMTP_PASSWORD || !ALERT_EMAIL) {
  console.log("::warning::Email alert not sent: add the SMTP_USER, SMTP_PASSWORD and ALERT_EMAIL repository secrets.");
  process.exit(0);
}

const body = bodyFile && existsSync(bodyFile) ? readFileSync(bodyFile, "utf8") : "";
const { default: nodemailer } = await import("nodemailer");
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
});
await transport.sendMail({ from: `MLBB Draft Coach <${SMTP_USER}>`, to: ALERT_EMAIL, subject, text: body });
console.log("Alert email sent.");
