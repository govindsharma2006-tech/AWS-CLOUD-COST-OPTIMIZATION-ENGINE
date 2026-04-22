const nodemailer = require("nodemailer");

/**
 * sendEmail({ to, subject, html })
 * Uses EMAIL_USER + EMAIL_PASS from .env (Gmail App Password)
 * Silently skips if credentials are not configured.
 */
const sendEmail = async ({ to, subject, html }) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log("[Email] Skipped — EMAIL_USER / EMAIL_PASS not set in .env");
        return { success: false, reason: "not_configured" };
    }
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,   // Gmail App Password (not your login password)
            },
        });

        await transporter.sendMail({
            from: `"CloudLens 🔔" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });

        console.log(`[Email] ✅ Sent to ${to} — "${subject}"`);
        return { success: true };
    } catch (error) {
        console.error("[Email] ❌ Error:", error.message);
        return { success: false, reason: error.message };
    }
};

module.exports = sendEmail;