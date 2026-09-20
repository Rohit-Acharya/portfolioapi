const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const RECEIVER_EMAIL = process.env.RECEIVER_EMAIL || "rohitaharya051005@gmail.com";

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "20kb" }));

const contactAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const attempts = contactAttempts.get(ip) || [];
  const recentAttempts = attempts.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);

  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    contactAttempts.set(ip, recentAttempts);
    return true;
  }

  recentAttempts.push(now);
  contactAttempts.set(ip, recentAttempts);
  return false;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateContact(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const inquiryType = typeof body.inquiryType === "string" ? body.inquiryType.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 100) {
    return { error: "Please enter a valid name." };
  }

  if (!email || !isValidEmail(email) || email.length > 254) {
    return { error: "Please enter a valid email address." };
  }

  if (!message || message.length > 5000) {
    return { error: "Please enter a valid message." };
  }

  return {
    value: {
      name,
      email,
      inquiryType: inquiryType || "Not provided",
      subject: subject || "Portfolio contact form message",
      message,
    },
  };
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

app.post("/api/contact", async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  const validation = validateContact(req.body || {});
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { name, email, inquiryType, subject, message } = validation.value;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(500).json({ error: "Email service is not configured." });
  }

  try {
    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"Portfolio Contact" <${process.env.SMTP_USER}>`,
      to: RECEIVER_EMAIL,
      replyTo: email,
      subject: `Portfolio Contact: ${subject}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Inquiry Type: ${inquiryType}`,
        `Subject: ${subject}`,
        "",
        "Message:",
        message,
      ].join("\n"),
      html: `
        <h2>New Portfolio Contact Message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Inquiry Type:</strong> ${escapeHtml(inquiryType)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
      `,
    });

    return res.json({ ok: true, message: "Message sent successfully" });
  } catch (error) {
    console.error("Contact email failed:", error.message);
    return res.status(500).json({ error: "Failed to send message. Please try again later." });
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.listen(PORT, () => {
  console.log(`Contact API running on port ${PORT}`);
});
