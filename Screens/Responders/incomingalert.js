import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { auth, db } from "../../firebaseconfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import Background from "../../Components/background";

export default function IncomingEmergencyScreen({ navigation, route }) {
  const [alerts, setAlerts] = useState([]);
  const [singleAlert, setSingleAlert] = useState(null); // New: For override single alert
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const uid = auth.currentUser?.uid;

  // New: Handle single alert from params (override)
  useEffect(() => {
    const { alertId, alertData } = route.params || {};
    if (alertData) {
      setSingleAlert(alertData);
      setLoading(false);
      return; // Show single alert only
    } else if (alertId) {
      // Fetch single alert if ID passed
      const fetchSingleAlert = async () => {
        try {
          setLoading(true);
          const alertDoc = await getDoc(doc(db, "responders_alerts", alertId));
          if (alertDoc.exists()) {
            setSingleAlert({ id: alertId, ...alertDoc.data() });
          } else {
            Alert.alert("Error", "Alert not found.");
            navigation.goBack();
          }
        } catch (err) {
          console.error("Fetch single alert error:", err);
          Alert.alert("Error", "Failed to load alert.");
          navigation.goBack();
        } finally {
          setLoading(false);
        }
      };
      fetchSingleAlert();
      return; // Show single alert only
    }
  }, [route.params]);

  // Existing: Listener for list (only if no single alert)
  useEffect(() => {
    if (singleAlert || !uid) return; // Skip list if override/single mode

    const q = query(
      collection(db, "responders_alerts"),
      where("assignedResponder", "==", uid),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            setAlerts((prev) => [
              ...prev,
              { id: change.doc.id, ...change.doc.data() },
            ]);
          }
        });
        setLoading(false);
      },
      (error) => {
        console.error("❌ Error fetching alerts:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [singleAlert, uid]);

  const handleAccept = async (alertId) => {
    setProcessingId(alertId);
    try {
      const alertRef = doc(db, "responders_alerts", alertId);
      await updateDoc(alertRef, {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        responderUID: uid,
      });

      // Update responder status
      await updateDoc(doc(db, "responders", uid), {
        status: "busy",
        assignedEmergency: alertId,
      });

      Alert.alert("Accepted", "Emergency accepted. En route.");
      navigation.navigate("AlertDetails", { alertId });
    } catch (err) {
      console.error("❌ Accept error:", err);
      Alert.alert("Error", "Failed to accept alert.");
    } finally {
      setProcessingId(null);
      if (singleAlert) setSingleAlert(null); // Clear single mode
    }
  };

  const handleDecline = async (alertId) => {
    setProcessingId(alertId);
    try {
      const alertRef = doc(db, "responders_alerts", alertId);
      await updateDoc(alertRef, {
        status: "declined",
        declinedAt: serverTimestamp(),
      });
      Alert.alert("Declined", "Alert declined. Returning to dashboard.");
      navigation.goBack();
    } catch (err) {
      console.error("❌ Decline error:", err);
      Alert.alert("Error", "Failed to decline alert.");
    } finally {
      setProcessingId(null);
      if (singleAlert) setSingleAlert(null); // Clear single mode
    }
  };

  const handleCall = () => {
    // Integrate phone call (e.g., Linking.openURL('tel:123'))
    console.log("📞 Calling Dispatcher...");
    Alert.alert("Call", "Calling dispatcher... (Integrate tel: link)");
  };

  const renderAlert = (alert) => {
    const createdAt =
      alert.createdAt && alert.createdAt.toDate
        ? alert.createdAt.toDate().toLocaleString()
        : "N/A";

    return (
      <View key={alert.id} style={styles.detailsBox}>
        <Text style={styles.detailsTitle}>{alert.type || "Emergency"}</Text>
        <Text style={styles.detailsText}>
          <Text style={styles.bold}>Location:</Text>{" "}
          {alert.location?.readableAddress ||
            `Lat: ${alert.location?.lat}, Lng: ${alert.location?.lng}` ||
            "N/A"}
        </Text>
        <Text style={styles.detailsText}>
          <Text style={styles.bold}>Time:</Text> {createdAt}
        </Text>
        <Text style={styles.detailsText}>
          <Text style={styles.bold}>Details:</Text> {alert.details || "N/A"}
        </Text>

        {alert.additionalInfo && (
          <>
            <Text style={styles.detailsText}>
              <Text style={styles.bold}>Attacker Gender:</Text>{" "}
              {alert.additionalInfo.attackerGender || "N/A"}
            </Text>
            <Text style={styles.detailsText}>
              <Text style={styles.bold}>Clothing:</Text>{" "}
              {alert.additionalInfo.clothing || "N/A"}
            </Text>
            <Text style={styles.detailsText}>
              <Text style={styles.bold}>Weapon Visible:</Text>{" "}
              {alert.additionalInfo.weaponVisible || "N/A"}
            </Text>
            <Text style={styles.detailsText}>
              <Text style={styles.bold}>Urgency:</Text> {alert.urgency || "N/A"}
            </Text>
          </>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.btnWrapper}
            onPress={() => handleAccept(alert.id)}
            disabled={processingId === alert.id}
          >
            <LinearGradient
              colors={["#28a745", "#065f1a"]}
              style={styles.actionBtn}
            >
              {processingId === alert.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Accept</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnWrapper}
            onPress={() => handleDecline(alert.id)}
            disabled={processingId === alert.id}
          >
            <LinearGradient
              colors={["#E63946", "#8B0000"]}
              style={styles.actionBtn}
            >
              {processingId === alert.id ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Decline</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.callWrapper} onPress={handleCall}>
          <LinearGradient
            colors={["#E63946", "#8B0000"]}
            style={styles.callBtn}
          >
            <Text style={styles.callText}>📞 Call Dispatcher</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  // New: Render single alert (override mode)
  const renderSingleAlert = () => {
    if (!singleAlert) return null;
    return renderAlert(singleAlert);
  };

  return (
    <Background>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🚨 Incoming Emergency</Text>
          <Text style={styles.headerSubtitle}>
            {singleAlert
              ? "New alert assigned to you"
              : alerts.length
              ? "You have new alerts"
              : "Waiting for new emergency alerts..."}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#E63946" />
        ) : singleAlert ? (
          renderSingleAlert() // Override: Show single alert
        ) : alerts.length > 0 ? (
          alerts.map((alert) => renderAlert(alert)) // Fallback: List view
        ) : (
          <Text style={{ color: "#fff", textAlign: "center", marginTop: 50 }}>
            No incoming emergencies at the moment.
          </Text>
        )}
      </ScrollView>
    </Background>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "flex-start",
  },
  header: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#E63946",
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginTop: 6,
  },
  detailsBox: {
    marginBottom: 30,
    padding: 20,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#E63946",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  detailsTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 10,
  },
  detailsText: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 6,
  },
  bold: {
    fontWeight: "700",
    color: "#fff",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 15,
    marginBottom: 10,
  },
  btnWrapper: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  actionBtn: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  callWrapper: {
    alignItems: "center",
    marginTop: 10,
  },
  callBtn: {
    width: "70%",
    padding: 14,
    borderRadius: 25,
    alignItems: "center",
  },
  callText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
});
