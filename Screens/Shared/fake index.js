const { onCall } = require("firebase-functions/v2/https");
const { onInit } = require("firebase-functions/v2/core");
const admin = require("firebase-admin");

// Existing triggers
const {
  verifyResponder,
  signupResponder,
} = require("./triggers/respondertriggers");

// Lazy load OTP handlers
let sendOtp, verifyOtp;
const loadHandlers = () => {
  if (!sendOtp) {
    ({ sendOtp, verifyOtp } = require("./triggers/otptriggers"));
  }
  return { sendOtp, verifyOtp };
};

// Initialize Admin SDK
onInit(async () => {
  console.log("onInit: Starting admin initialization...");
  if (!admin.apps.length) {
    if (process.env.FUNCTIONS_EMULATOR) {
      admin.initializeApp({ projectId: "alertivo-new" });
      console.log(
        "onInit: Admin initialized for emulator with projectId: alertivo-new."
      );
    } else {
      admin.initializeApp();
      console.log("onInit: Admin initialized for production.");
    }
  } else {
    console.log("onInit: Admin already initialized.");
  }
});

// Firestore reference
const db = admin.firestore();

console.log("index.js: Exporting functions...");

// ========== Existing Functions ==========

// Send OTP - callable function
exports.sendOtp = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  (request) => loadHandlers().sendOtp(request)
);

// Verify OTP - callable function
exports.verifyOtp = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  (request) => loadHandlers().verifyOtp(request)
);

// Responder Verification & Signup
exports.verifyResponder = onCall({ region: "us-central1" }, (request) =>
  verifyResponder(request.data, request.context)
);

exports.signupResponder = onCall({ region: "us-central1" }, (request) =>
  signupResponder(request.data, request.context)
);

// ========== NEW: Emergency Report Function ==========

exports.createEmergencyReport = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request) => {
    try {
      const {
        type,
        location,
        details,
        urgency,
        contactMethod,
        additionalInfo,
        createdByUID,
        displayCode,
      } = request.data;

      // ✅ Basic validation
      if (!type || !location || !createdByUID) {
        throw new Error("Missing required emergency fields.");
      }

      // ✅ Construct Firestore document
      const newReport = {
        type,
        location,
        details: details || "",
        urgency: urgency || "medium",
        contactMethod: contactMethod || "chat",
        additionalInfo: additionalInfo || {},
        createdByUID,
        displayCode: displayCode || "ANON", // short code for responder display
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      };

      // ✅ Add to main 'emergencies' collection
      const reportRef = await db.collection("emergencies").add(newReport);

      // ✅ Route to relevant departments (Security, Medical, Fire)
      if (type === "security") {
        console.log("🛡️ Routing to responders...");
        await db
          .collection("responders_alerts")
          .doc(reportRef.id)
          .set({
            ...newReport,
            routedAt: new Date(),
          });
        console.log("📢 Placeholder: Notify nearby responders");
      }

      if (type === "medical") {
        console.log("🏥 Routing to clinic...");
        await db
          .collection("departments")
          .doc("clinic")
          .collection("emergencies")
          .doc(reportRef.id)
          .set({ ...newReport, routedAt: new Date() });
        console.log("📢 Placeholder: Notify clinic department");
      }

      if (type === "fire") {
        console.log("🔥 Routing to fire department...");
        await db
          .collection("departments")
          .doc("fireDept")
          .collection("emergencies")
          .doc(reportRef.id)
          .set({ ...newReport, routedAt: new Date() });
        console.log("📢 Placeholder: Notify fire department");
      }

      return { success: true, reportId: reportRef.id };
    } catch (err) {
      console.error("Error creating emergency report:", err);
      throw new Error(err.message);
    }
  }
);

console.log("index.js: All functions exported successfully.");
