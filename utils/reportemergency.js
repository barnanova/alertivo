// utils/reportEmergency.js
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebaseconfig"; // ensure path is correct

const functions = getFunctions(app);

/**
 * Send emergency data to the backend Cloud Function.
 * @param {Object} reportData - The complete emergency report details.
 * @returns {Promise<Object>} - Response from the Cloud Function.
 */
export const reportEmergency = async (reportData) => {
  try {
    // ✅ Validate required fields before sending
    const requiredFields = ["type", "location", "createdByUID"];
    const missing = requiredFields.filter((key) => !reportData[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }

    // ✅ Ensure optional defaults (in case front-end misses them)
    const preparedData = {
      details: "",
      urgency: "medium",
      contactMethod: "chat",
      additionalInfo: {},
      displayCode: "ANON",
      ...reportData, // overrides defaults with actual data
    };

    const createEmergency = httpsCallable(functions, "createEmergencyReport");
    const result = await createEmergency(preparedData);

    console.log("✅ Emergency created successfully:", result.data);
    return result.data;
  } catch (error) {
    console.error("❌ Error creating emergency:", error.message);
    throw error;
  }
};
