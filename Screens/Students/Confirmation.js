// screens/EmergencyTracking.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  HMSSDK,
  HMSUpdateListenerActions,
  HMSConfig,
} from "@100mslive/react-native-hms"; // Correct imports
import Background from "../../Components/background";

export default function EmergencyTracking({ navigation, route }) {
  const {
    type = "security",
    reportId,
    contactMethod = "both",
  } = route.params || {};

  const [timeline, setTimeline] = useState(() => {
    if (type === "medical" || type === "fire") {
      return [
        { text: "Searching nearest responder…", status: "current" },
        { text: "Responder assigned and notified", status: "pending" },
      ];
    } else {
      return [
        { text: "Searching nearest responder…", status: "current" },
        { text: "Responder found: [Name/ID]", status: "pending" },
        { text: "Responder notified", status: "pending" },
        { text: "Responder is on the way", status: "pending" },
      ];
    }
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [inCall, setInCall] = useState(false);
  const [loadingCall, setLoadingCall] = useState(false);
  const [hmsInstance, setHmsInstance] = useState(null); // 100ms SDK instance

  // Simulate timeline
  useEffect(() => {
    if (stepIndex < timeline.length) {
      const timer = setTimeout(() => {
        setTimeline((prev) => {
          const newSteps = [...prev];
          newSteps[stepIndex].status = "done";
          if (stepIndex + 1 < newSteps.length) {
            newSteps[stepIndex + 1].status = "current";
          }
          return newSteps;
        });
        setStepIndex(stepIndex + 1);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [stepIndex]);

  // Student initiates the call with 100ms
  const startCall = async () => {
    if (!reportId) {
      Alert.alert("Error", "No emergency ID found");
      return;
    }

    setLoadingCall(true);
    try {
      // Fetch 100ms token from Django backend
      const res = await fetch(
        `https://alertivo-admin.onrender.com/api/hms-token/${reportId}/`
      );
      if (!res.ok) throw new Error("Failed to get token");
      const { token } = await res.json();

      // Correct way: new HMSSDK()
      const instance = new HMSSDK();

      const config = new HMSConfig({
        authToken: token,
        username: "Student",
      });

      await instance.join(config);

      // Listen for successful join
      instance.addEventListener(HMSUpdateListenerActions.ON_JOIN, () => {
        setInCall(true);
        Alert.alert("Call Started", "Waiting for clinic staff to join...");
      });

      setHmsInstance(instance);
    } catch (err) {
      console.error("100ms Call error:", err);
      Alert.alert("Call Failed", err.message || "Could not start call");
    } finally {
      setLoadingCall(false);
    }
  };

  // Cleanup when leaving screen
  useEffect(() => {
    return () => {
      if (hmsInstance) {
        hmsInstance.leave();
      }
    };
  }, [hmsInstance]);

  const getTitle = () => {
    switch (type) {
      case "medical":
        return "Medical Emergency Sent";
      case "fire":
        return "Fire Emergency Sent";
      default:
        return "Security Emergency Sent";
    }
  };

  const getSubtitle = () => {
    switch (type) {
      case "medical":
        return "We are alerting nearby medical responders.";
      case "fire":
        return "We are alerting nearby fire responders.";
      default:
        return "We are notifying security responders nearby.";
    }
  };

  return (
    <Background>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>
        </View>

        <Text style={styles.confirmationIcon}>✔️</Text>

        <View style={styles.timeline}>
          {timeline.map((step, idx) => (
            <View
              key={idx}
              style={[
                styles.timelineStep,
                step.status === "done" && styles.done,
                step.status === "current" && styles.current,
              ]}
            >
              <View
                style={[
                  styles.dot,
                  step.status === "done" && styles.dotDone,
                  step.status === "current" && styles.dotCurrent,
                ]}
              />
              <Text
                style={[
                  styles.timelineText,
                  step.status === "pending" && styles.pendingText,
                ]}
              >
                {step.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.mapPreview}>
          <Text style={styles.mapText}>Map tracking (coming soon)</Text>
        </View>

        {/* Student-Initiated Call Button */}
        {(contactMethod === "call" || contactMethod === "both") && (
          <TouchableOpacity
            onPress={startCall}
            disabled={loadingCall || inCall}
            style={[styles.btn, (loadingCall || inCall) && styles.btnDisabled]}
          >
            {loadingCall ? (
              <ActivityIndicator color="#fff" />
            ) : inCall ? (
              <Text style={styles.btnText}>On Call with Clinic...</Text>
            ) : (
              <Text style={styles.btnText}>📞 Start Call with Clinic</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Chat Button (placeholder — will add real chat later) */}
        {(contactMethod === "chat" || contactMethod === "both") && (
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]}>
            <Text style={styles.btnText}>💬 Open Chat with Clinic</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.btn, styles.cancelBtn]}
          onPress={() =>
            Alert.alert("Cancelled", "Emergency request cancelled.")
          }
        >
          <Text style={styles.cancelText}>Cancel Request</Text>
        </TouchableOpacity>

        <Text style={styles.safetyTip}>Stay calm. Help is on the way.</Text>
      </ScrollView>
    </Background>
  );
}

// Styles remain the same
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 18,
  },
  header: { alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.6)" },
  confirmationIcon: {
    fontSize: 80,
    color: "#E63946",
    marginVertical: 12,
  },
  timeline: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  timelineStep: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#888",
  },
  dotDone: { backgroundColor: "limegreen", borderColor: "limegreen" },
  dotCurrent: { borderColor: "#E63946" },
  timelineText: { fontSize: 14, color: "#fff" },
  pendingText: { color: "rgba(255,255,255,0.6)" },
  mapPreview: {
    width: "100%",
    height: 160,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mapText: { fontSize: 14, color: "rgba(255,255,255,0.6)" },
  btn: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#E63946",
    alignItems: "center",
  },
  btnSecondary: { backgroundColor: "#2A9D8F" },
  btnDisabled: { backgroundColor: "#888" },
  cancelBtn: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#888",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cancelText: { color: "#888", fontWeight: "600", fontSize: 14 },
  safetyTip: {
    marginTop: 12,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontStyle: "italic",
    textAlign: "center",
  },
  done: {},
  current: {},
});
