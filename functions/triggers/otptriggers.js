const functions = require("firebase-functions");
const { admin } = require("../config/firebaseAdmin");

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS_PER_HOUR = 3;
const LOCKOUT_MINUTES = 30;

async function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(email, otp) {
  let sgMail;
  try {
    sgMail = require("@sendgrid/mail");
    const apiKey =
      functions.config().sendgrid?.key || process.env.SENDGRID_API_KEY;
    const sender =
      functions.config().sendgrid?.sender || process.env.SENDGRID_SENDER;
    if (!apiKey || !sender) {
      throw new Error("Missing SendGrid config");
    }
    sgMail.setApiKey(apiKey);
    console.log("SendGrid initialized for email send.");
  } catch (error) {
    console.error("SendGrid init error:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to initialize email service."
    );
  }

  const msg = {
    to: email,
    from: sender,
    subject: "Your Alertivo OTP",
    text: `Your one-time code is ${otp}. Expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  };
  try {
    await sgMail.send(msg);
    console.log(`OTP sent to ${email}`);
  } catch (error) {
    console.error("SendGrid send error:", error);
    throw new functions.https.HttpsError("internal", "Failed to send OTP.");
  }
}

const sendOtpHandler = async (request) => {
  const db = admin.firestore(); // Lazy
  const { email } = request.data;
  if (!email || !email.endsWith("@students.unilorin.edu.ng")) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid student email."
    );
  }

  const now = db.Timestamp.now();
  const hourAgo = new Date(now.toDate().getTime() - 60 * 60 * 1000);

  // Rate limit
  const rateLimitRef = db.collection("rateLimits").doc(email);
  const rateDoc = await rateLimitRef.get();
  let attempts = 0;
  if (rateDoc.exists) {
    attempts = rateDoc.data().count;
    if (rateDoc.data().resetAt?.toDate() > hourAgo) {
      attempts++;
    } else {
      attempts = 1;
    }
  } else {
    attempts = 1;
  }

  if (attempts > MAX_ATTEMPTS_PER_HOUR) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many attempts. Try again in an hour."
    );
  }

  await rateLimitRef.set({
    count: attempts,
    resetAt: db.Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
  });

  // Lockout
  const failedRef = db.collection("failedAttempts").doc(email);
  const failedDoc = await failedRef.get();
  if (
    failedDoc.exists &&
    failedDoc.data().lockedUntil?.toDate() > now.toDate()
  ) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Account locked due to too many failed attempts."
    );
  }

  // Old OTP delete
  await db
    .collection("otps")
    .doc(email)
    .delete()
    .catch(() => {});

  const otp = await generateOTP();
  const expiresAt = db.Timestamp.fromDate(
    new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
  );

  await db
    .collection("otps")
    .doc(email)
    .set({
      otp,
      expiresAt,
      createdAt: now,
      ip: request.ip || "unknown",
    });

  await sendEmail(email, otp);

  // Audit
  await db.collection("auditLogs").add({
    action: "OTP_SENT",
    email,
    timestamp: now,
    details: { attempts },
  });

  return { success: true, message: "OTP sent!" };
};

const verifyOtpHandler = async (request) => {
  const db = admin.firestore(); // Lazy
  const auth = admin.auth();
  const { email, otp, password } = request.data; // Added password param
  if (!email || !otp) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Email and OTP required."
    );
  }

  const now = db.Timestamp.now();
  const otpRef = db.collection("otps").doc(email);
  const otpDoc = await otpRef.get();

  if (
    !otpDoc.exists ||
    otpDoc.data().otp !== otp ||
    otpDoc.data().expiresAt < now
  ) {
    // Fails
    const failedRef = db.collection("failedAttempts").doc(email);
    const failedDoc = await failedRef.get();
    let fails = failedDoc.exists ? failedDoc.data().count + 1 : 1;

    await failedRef.set({
      count: fails,
      lockedUntil:
        fails >= 5
          ? db.Timestamp.fromDate(
              new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            )
          : null,
    });

    // Audit
    await db.collection("auditLogs").add({
      action: "OTP_FAILED",
      email,
      timestamp: now,
      details: { fails },
    });

    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid or expired OTP."
    );
  }

  // Cleanup
  await otpRef.delete();
  await db
    .collection("rateLimits")
    .doc(email)
    .delete()
    .catch(() => {});
  await db
    .collection("failedAttempts")
    .doc(email)
    .delete()
    .catch(() => {});

  // User
  let user;
  try {
    user = await auth.createUser({ email, emailVerified: true });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      user = await auth.getUserByEmail(email);
    } else {
      throw err;
    }
  }

  // NEW: Set password if provided (securely via Admin SDK)
  if (password) {
    try {
      await auth.updateUser(user.uid, { password });
      console.log("Password set for user:", user.uid);
    } catch (err) {
      console.error("Password update error:", err);
      // Don't throw—user created, password can be reset later
    }
  }

  // Profile
  await db.collection("users").doc(user.uid).set({
    uid: user.uid,
    email,
    verified: true,
    createdAt: now,
    role: "student",
  });

  // Audit
  await db.collection("auditLogs").add({
    action: "USER_VERIFIED",
    email,
    timestamp: now,
    details: { uid: user.uid },
  });

  return { success: true, uid: user.uid };
};

module.exports = { sendOtp: sendOtpHandler, verifyOtp: verifyOtpHandler };
