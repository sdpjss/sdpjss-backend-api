import express from "express";
import {
  getAllAdvertisementsWithUserNames,
  getAllJobOpeningsWithUserNames,
  getAllStaffRequirementsWithUserNames,
  listUserFeatures,
} from "../controllers/userController.js";
import nodemailer from "nodemailer";
import { getNoticeList } from "../controllers/adminController.js";
import { getTeamMembers } from "../controllers/teamController.js";

const commonRouter = express.Router();

commonRouter.get("/get-staffs", getAllStaffRequirementsWithUserNames);
commonRouter.get("/get-advertisements", getAllAdvertisementsWithUserNames);
commonRouter.get("/get-jobs", getAllJobOpeningsWithUserNames);
// ---------------------------
// Notice routes
commonRouter.get("/notice-list", getNoticeList);
commonRouter.get("/get-team-members", getTeamMembers);
commonRouter.get("/public-features", listUserFeatures);

// --- Nodemailer Transport Configuration ---
// This is the core part that sends the email.
// You MUST replace the placeholder credentials with your actual email service provider's details.
// For Gmail, you may need to use an "App Password".
// See Nodemailer docs for more info: https://nodemailer.com/
const transporter = nodemailer.createTransport({
  service: "gmail", // e.g., 'gmail', 'yahoo', or use SMTP details
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify transporter configuration
transporter.verify(function (error) {
  if (error) {
    console.log("Error with email transporter config:", error);
  } else {
    console.log("Email transporter is configured and ready to send emails.");
  }
});

// --- API Route and Controller Logic ---
// This defines the endpoint that your React form will send data to.
commonRouter.post("/contact", (req, res) => {
  // Extract data from the request body
  const { name, email, message } = req.body;

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Define the email options
  const mailOptions = {
    from: `"SDPJSS Website" <${process.env.EMAIL_FROM_NAME}>`, // Sender's name and email
    to: process.env.EMAIL_REPLY_TO, // <-- This is where the emails will be sent.
    replyTo: `"${name}" <${email}>`, // So you can reply directly to the user's email
    subject: `New Contact Form Message from ${name}`,
    html: `
      <h1>New Message from Contact Form</h1>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <hr>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
    `,
  };

  // Send the email using the transporter
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      // Send an error response back to the client
      return res.status(500).json({ message: "Failed to send the email." });
    }

    console.log("Email sent: " + info.response);
    // Send a success response back to the client
    res.status(200).json({ message: "Email sent successfully!" });
  });
});

export default commonRouter;
