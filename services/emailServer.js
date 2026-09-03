// /services/emailService.js

import nodemailer from "nodemailer";

// 1. Load and parse credentials from .env
const emailUsers = process.env.EMAIL_USERS.split(",");
const emailPasswords = process.env.EMAIL_PASSWORDS.split(",");

if (!process.env.EMAIL_USERS || !process.env.EMAIL_PASSWORDS) {
  console.error(
    "FATAL ERROR: EMAIL_USERS or EMAIL_PASSWORDS environment variables are not set."
  );
  // Exit the process to prevent the app from running in a broken state
  process.exit(1);
}

if (emailUsers.length !== emailPasswords.length) {
  console.error(
    "Email service error: The number of email users does not match the number of passwords."
  );
}

// 2. Create the pool of transporters
const transporters = emailUsers.map((user, index) => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user,
      pass: emailPasswords[index],
    },
  });
});

let currentTransporterIndex = 0;

const sendEmail = async (to, subject, html, attachments = []) => {
  // Rotate to the next transporter in the pool (round-robin)
  const transporter = transporters[currentTransporterIndex];
  const senderEmail = emailUsers[currentTransporterIndex];

  // Update the index for the next call
  currentTransporterIndex = (currentTransporterIndex + 1) % transporters.length;

  // 4. Define mail options with consistent display name and reply-to address
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME}"`, // e.g., "SDPJSS" <second.email@gmail.com>
    replyTo: process.env.EMAIL_REPLY_TO, // e.g., sdpjssmanpur@gmail.com
    to: to,
    subject: subject,
    html: html,
    attachments: attachments,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to} via ${senderEmail}`);
    return true;
  } catch (error) {
    console.error(`Email sending failed via ${senderEmail}:`, error);
    // OPTIONAL: Advanced - You could add logic here to retry with the next transporter
    return false;
  }
};

export default sendEmail;
