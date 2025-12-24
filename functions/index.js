const { onCall } = require("firebase-functions/v2/https");
const { onInit } = require("firebase-functions/v2/core");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios"); // ← Added for Django sync

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

// ================== Helper: Distance Calculation ==================
const getDistance = (lat1, lng1, lat2, lng2) => {
  const toRad = (val) => (val * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ================== Helper: Assign Nearest Available Responder ==================
const assignNearestResponder = async (emergencyData) => {
  const respondersSnap = await db
    .collection("responders")
    .where("status", "==", "active")
    .get();

  if (respondersSnap.empty) return null;

  const { lat: eLat, lng: eLng } = emergencyData.location;
  let nearest = null;
  let minDistance = Infinity;

  respondersSnap.forEach((doc) => {
    const data = doc.data();
    const locationData = data.currentLocation || data.lastKnownLocation;
    if (!locationData) return;

    const dist = getDistance(eLat, eLng, locationData.lat, locationData.lng);

    if (dist < minDistance) {
      minDistance = dist;
      nearest = doc;
    }
  });

  if (nearest) {
    await nearest.ref.update({
      status: "busy",
      assignedEmergency: emergencyData.reportId,
    });
    return nearest.id;
  }
  return null;
};

// ================== Exported Functions ==================

// Send OTP
exports.sendOtp = onCall(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB" },
  (request) => loadHandlers().sendOtp(request)
);

// Verify OTP
exports.verifyOtp = onCall(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB" },
  (request) => loadHandlers().verifyOtp(request)
);

// Responder Verification & Signup
exports.verifyResponder = onCall({ region: "us-central1" }, (request) =>
  verifyResponder(request.data, request.context)
);

exports.signupResponder = onCall({ region: "us-central1" }, (request) =>
  signupResponder(request.data, request.context)
);

// ================== Emergency Report ==================
exports.createEmergencyReport = onCall(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB" },
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
        notes, // ← From medical form free text
      } = request.data;

      if (!type || !location || !createdByUID) {
        throw new Error("Missing required emergency fields.");
      }

      const newReport = {
        type,
        location,
        details: details || "",
        notes: notes || "", // ← Medical free text
        urgency: urgency || "medium",
        contactMethod: contactMethod || "chat",
        additionalInfo: additionalInfo || {},
        createdByUID,
        displayCode: displayCode || "ANON",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      };

      const reportRef = await db.collection("emergencies").add(newReport);
      const reportId = reportRef.id;

      if (type === "security") {
        console.log("🛡️ Assigning nearest active responder...");
        const assignedResponderUID = await assignNearestResponder({
          ...newReport,
          reportId,
        });

        await db
          .collection("responders_alerts")
          .doc(reportId)
          .set({
            emergencyId: reportId,
            type,
            details: details || "",
            urgency: urgency || "medium",
            createdByUID,
            displayCode: displayCode || "ANON",
            location: {
              lat: location.lat,
              lng: location.lng,
              readableAddress: location.readableAddress || "",
            },
            additionalInfo: additionalInfo || {},
            assignedResponder: assignedResponderUID || null,
            status: "pending",
            routedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

        console.log(
          `📢 Nearest responder assigned: ${
            assignedResponderUID || "None available"
          }`
        );

        // FCM Push for Security (already there)
        if (assignedResponderUID) {
          const responderSnap = await db
            .collection("responders")
            .doc(assignedResponderUID)
            .get();

          const expoPushToken = responderSnap.data()?.expoPushToken;

          if (expoPushToken) {
            const message = {
              notification: {
                title: "🚨 New Emergency Alert",
                body: `${type.toUpperCase()} - ${urgency} priority at ${
                  location.readableAddress || "Nearby"
                }`,
              },
              data: {
                type: "emergency",
                alertId: reportId,
              },
              token: expoPushToken,
            };

            try {
              const response = await admin.messaging().send(message);
              console.log("FCM push sent successfully:", response);
            } catch (err) {
              console.error("FCM push failed:", err.message || err);
            }
          }
        }
      }

      if (type === "medical") {
        await db
          .collection("departments")
          .doc("clinic")
          .collection("emergencies")
          .doc(reportId)
          .set({ ...newReport, routedAt: new Date() });

        // === SYNC MEDICAL EMERGENCY TO DJANGO ADMIN ===
        const djangoApiUrl =
          "https://alertivo-admin.onrender.com/api/receive-emergency/";

        const medicalSyncData = {
          reportId: reportId,
          type: "medical",
          location: location,
          details: details || {}, // {who, medType, numAffected, urgency}
          notes: notes || "", // Free text description
          urgency: urgency || "medium",
          contact_method: contactMethod || "both",
          created_by_uid: createdByUID || "",
          display_code: displayCode || "ANON",
        };

        try {
          await axios.post(djangoApiUrl, medicalSyncData);
          console.log("Medical emergency synced to Django admin panel");
        } catch (syncError) {
          console.error(
            "Failed to sync medical emergency to Django:",
            syncError.response?.data || syncError.message
          );
        }
        // === END SYNC ===
      }

      if (type === "fire") {
        await db
          .collection("departments")
          .doc("fireDept")
          .collection("emergencies")
          .doc(reportId)
          .set({ ...newReport, routedAt: new Date() });
      }

      return { success: true, reportId };
    } catch (err) {
      console.error("Error creating emergency report:", err);
      throw new Error(err.message);
    }
  }
);

// ================== Complete Emergency ==================
exports.completeEmergency = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      const { responderUID, emergencyId } = request.data;
      if (!responderUID || !emergencyId)
        throw new Error("Missing responderUID or emergencyId");

      await db.collection("responders").doc(responderUID).update({
        status: "active",
        assignedEmergency: admin.firestore.FieldValue.delete(),
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("emergencies").doc(emergencyId).update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `Responder ${responderUID} returned to active after completing emergency ${emergencyId}`
      );

      return { success: true };
    } catch (err) {
      console.error("Error completing emergency:", err);
      throw new Error(err.message);
    }
  }
);

// ================== Responder Heartbeat Update ==================
exports.updateResponderHeartbeat = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    try {
      const { responderUID, location } = request.data;

      if (!responderUID) {
        throw new Error("Missing responderUID");
      }

      const responderRef = db.collection("responders").doc(responderUID);
      const responderSnap = await responderRef.get();

      if (!responderSnap.exists) {
        throw new Error("Responder not found");
      }

      const updateData = {
        lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
        status: "active",
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (location && location.lat && location.lng) {
        updateData.currentLocation = {
          lat: location.lat,
          lng: location.lng,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
      }

      await responderRef.update(updateData);

      console.log(
        `Heartbeat updated for responder ${responderUID} ${
          location ? "(with location)" : ""
        }`
      );

      return { success: true };
    } catch (err) {
      console.error("Error updating responder heartbeat:", err);
      throw new Error(err.message);
    }
  }
);

// ================== HTTP CALLABLE FOR SCHEDULER ==================
exports.markInactiveResponders = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      const now = admin.firestore.Timestamp.now();
      const cutoff = new Date(now.toMillis() - 3 * 60 * 1000);

      const activeRespondersSnap = await db
        .collection("responders")
        .where("status", "==", "active")
        .get();

      let count = 0;

      for (const doc of activeRespondersSnap.docs) {
        const data = doc.data();
        const lastHeartbeat =
          data.lastHeartbeat?.toDate() || data.lastActiveAt?.toDate();
        if (!lastHeartbeat || lastHeartbeat < cutoff) {
          await doc.ref.update({
            status: "inactive",
            lastInactiveAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          count++;
          console.log(
            `Responder ${doc.id} marked inactive due to heartbeat timeout`
          );
        }
      }

      console.log(
        `✅ Auto-timeout check complete. ${count} responders updated.`
      );

      return { success: true, updatedCount: count };
    } catch (err) {
      console.error("Error in markInactiveResponders:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to mark inactive responders."
      );
    }
  }
);

console.log("index.js: All functions exported successfully.");
