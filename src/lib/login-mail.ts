import "server-only";

import nodemailer from "nodemailer";

import { LINK_MINUTES } from "./auth";

// Mail clients need literal inline values. The palette mirrors the app's design tokens.
const colors = {
  paper: "#f1efeb",
  white: "#fff",
  ink: "#0d0c14",
  muted: "#6b6874",
  line: "#e2dfd9",
  night: "#08081a",
  indigo: "#4b47f2",
  violet: "#8a4cf0",
  coral: "#f0564a",
  orange: "#f0663f",
  amber: "#ff8a3d",
  accent: "#f07a4a",
};

const emailTheme = {
  fontFamily: "Arial, Helvetica, sans-serif",
  title: "30px/34px",
  logo: "17px/22px",
  body: "16px/24px",
  footnote: "14px/21px",
  cardRadius: "14px",
  logoRadius: "5px",
  buttonRadius: "999px",
  logoSize: "18",
  width: "520px",
  small: "8px",
  base: "16px",
  large: "24px",
  section: "32px",
};

export function createLoginMailer() {
  const common = { connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 };
  if (process.env.CRM_MAIL_TRANSPORT === "mailpit") {
    return nodemailer.createTransport({
      ...common,
      host: "127.0.0.1",
      port: Number(process.env.CRM_MAILPIT_SMTP_PORT || 1025),
      ignoreTLS: true,
    });
  }
  if (process.env.CRM_MAIL_TRANSPORT === "resend" && process.env.RESEND_API_KEY) {
    return nodemailer.createTransport({
      ...common,
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: process.env.RESEND_API_KEY },
    });
  }
  throw new Error("Set CRM_MAIL_TRANSPORT and the corresponding SMTP settings");
}

export async function sendLoginMail(
  mailer: ReturnType<typeof createLoginMailer>,
  email: string,
  link: URL,
) {
  const appName = "Личная CRM";
  const subject = "Вход в Личную CRM";
  const action = "Войти";
  const deadline = `Ссылка действует ${LINK_MINUTES} минут.`;
  const unsolicited = "Если вы не запрашивали вход - просто проигнорируйте письмо";
  const href = link.href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const theme = emailTheme;
  const glow = `radial-gradient(ellipse at 85% 120%, ${colors.amber}, ${colors.coral} 15%, ${colors.violet} 30%, ${colors.night} 65%)`;
  const buttonGradient = `linear-gradient(90deg, ${colors.indigo}, ${colors.violet} 72%, ${colors.orange} 125%)`;
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;background-color:${colors.paper};color:${colors.ink};font-family:${theme.fontFamily}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${colors.paper}" style="background-color:${colors.paper}">
    <tr>
      <td align="center" style="padding:${theme.section} ${theme.base}">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${colors.white}" style="max-width:${theme.width};border-radius:${theme.cardRadius};background-color:${colors.white}">
          <tr>
            <td bgcolor="${colors.night}" style="padding:${theme.large};border-radius:${theme.cardRadius} ${theme.cardRadius} 0 0;background-color:${colors.night};background-image:${glow}">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td aria-hidden="true" width="${theme.logoSize}" height="${theme.logoSize}" bgcolor="${colors.indigo}" style="border-radius:${theme.logoRadius};background-color:${colors.indigo};background-image:linear-gradient(180deg, ${colors.indigo}, ${colors.accent});font-size:0">&nbsp;</td>
                  <td style="padding-left:${theme.small};color:${colors.white};font:600 ${theme.logo} ${theme.fontFamily}">${appName}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:${theme.section} ${theme.large}">
              <h1 style="margin:0 0 ${theme.small};color:${colors.ink};font:600 ${theme.title} ${theme.fontFamily}">${subject}</h1>
              <p style="margin:0 0 ${theme.large};color:${colors.muted};font:${theme.body} ${theme.fontFamily}">${deadline}</p>
              <a style="display:inline-block;padding:${theme.small} ${theme.section};border-radius:${theme.buttonRadius};background-color:${colors.indigo};background-image:${buttonGradient};color:${colors.white};font:600 ${theme.body} ${theme.fontFamily};text-decoration:none" href="${href}">${action}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:${theme.base} ${theme.large} ${theme.large};border-top:1px solid ${colors.line};border-radius:0 0 ${theme.cardRadius} ${theme.cardRadius};color:${colors.muted};font:${theme.footnote} ${theme.fontFamily}">${unsolicited}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await mailer.sendMail({
    from: { name: appName, address: "noreply@mail.crm.kropcrm.ru" },
    to: email,
    subject,
    text: `${action}\n${link.href}\n\n${deadline}\n${unsolicited}`,
    html,
  });
}
