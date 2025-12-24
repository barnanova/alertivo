// Screens/Responders/Dashboard.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";

import PremiumBackground from "../../Components/premiumbackground";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

import { auth, db, functions } from "../../firebaseconfig";
import {
  doc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

export default function ResponderDashboard({ navigation }) {
  const [isActive, setIsActive] = useState(false);
  const locationInterval = useRef(null);
  const lastLocation = useRef(null);
  const heartbeatInterval = useRef(null);

  /* -----------------------------------------
     SEND EXPO PUSH TOKEN (NOT FCM)
  ------------------------------------------ */
  const sendExpoPushToken = async () => {
    if (Platform.OS === "web") {
      console.log("Push token skipped on web");
      return;
    }

    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: "alertivo-new",
      });

      const uid = auth.currentUser?.uid;
      if (uid && token?.data) {
        await updateDoc(doc(db, "responders", uid), {
          expoPushToken: token.data,
          pushUpdatedAt: serverTimestamp(),
        });
        console.log("Expo push token saved:", token.data);
      }
    } catch (err) {
      console.log("Expo push token error:", err.message);
    }
  };

  /* -----------------------------------------
     HEARTBEAT
  ------------------------------------------ */
  const startHeartbeat = () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const updateHeartbeat = httpsCallable(
      functions,
      "updateResponderHeartbeat"
    );

    heartbeatInterval.current = setInterval(async () => {
      try {
        const location =
          lastLocation.current?.lat && lastLocation.current?.lng
            ? { ...lastLocation.current }
            : null;

        await updateHeartbeat({ responderUID: uid, location });
        console.log("Heartbeat sent", location ? "(with location)" : "");
      } catch (e) {
        console.log("Heartbeat error:", e.message);
      }
    }, 30000);
  };

  /* -----------------------------------------
     DISTANCE CALCULATION
  ------------------------------------------ */
  const getDistance = (loc1, loc2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(loc2.lat - loc1.lat);
    const dLon = toRad(loc2.lng - loc1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(loc1.lat)) *
        Math.cos(toRad(loc2.lat)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  /* -----------------------------------------
     START LOCATION TRACKING
  ------------------------------------------ */
  const startLiveLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Required",
          "Please enable location permission to go Active."
        );
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await updateDoc(doc(db, "responders", uid), {
        status: "active",
        lastActiveAt: serverTimestamp(),
      });

      locationInterval.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          const newLoc = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };

          if (
            !lastLocation.current ||
            getDistance(lastLocation.current, newLoc) > 15
          ) {
            lastLocation.current = newLoc;
            console.log("Live Location Updated:", newLoc);
          }
        } catch (err) {
          console.log("Location error:", err.message);
        }
      }, 60000);
    } catch (err) {
      console.log("Start tracking error:", err.message);
    }
  };

  const stopLiveLocationTracking = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (locationInterval.current) clearInterval(locationInterval.current);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);

      await updateDoc(doc(db, "responders", uid), {
        status: "inactive",
        lastInactiveAt: serverTimestamp(),
      });

      console.log("Live tracking stopped");
    } catch (err) {
      console.log("Stop tracking error:", err.message);
    }
  };

  /* -----------------------------------------
     TOGGLE ACTIVE STATE — NOW WITH sendExpoPushToken()
  ------------------------------------------ */
  const toggleActive = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (!isActive) {
      setIsActive(true);

      startLiveLocationTracking();
      startHeartbeat();
      await sendExpoPushToken(); // ← This saves the token when going active

      await updateDoc(doc(db, "responders", uid), {
        status: "active",
        lastActiveAt: serverTimestamp(),
      });
    } else {
      setIsActive(false);
      stopLiveLocationTracking();

      await updateDoc(doc(db, "responders", uid), {
        status: "inactive",
        lastInactiveAt: serverTimestamp(),
      });
    }
  };

  /* -----------------------------------------
     CLEANUP
  ------------------------------------------ */
  useEffect(() => {
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
    };
  }, []);

  /* -----------------------------------------
     REAL-TIME ALERT LISTENER
  ------------------------------------------ */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !isActive) return;

    const q = query(
      collection(db, "responders_alerts"),
      where("assignedResponder", "==", uid),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const alertDoc = snapshot.docs[0];
        const data = alertDoc.data();

        navigation.reset({
          index: 0,
          routes: [
            {
              name: "IncomingEmergency",
              params: {
                alertId: data.emergencyId || alertDoc.id,
                alertData: data,
              },
            },
          ],
        });

        if (Platform.OS !== "web") {
          Notifications.scheduleNotificationAsync({
            content: {
              title: "New Emergency Alert",
              body: `${data.type || "Emergency"} - ${
                data.location?.readableAddress || "Nearby"
              }`,
              data: { type: "emergency", alertId: data.emergencyId },
            },
            trigger: null,
          });
        }
      }
    });

    return () => unsubscribe();
  }, [isActive, navigation]);

  /* -----------------------------------------
     UI
  ------------------------------------------ */
  return (
    <PremiumBackground>
      <View style={styles.dashboard}>
        <View style={styles.header}>
          <Text style={styles.logo}>ALERTIVO</Text>
          <Text style={styles.tagline}>Smart. Fast. Safe.</Text>
        </View>

        <View style={styles.statusBar}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isActive ? "#06D6A0" : "red" },
            ]}
          />
          <Text style={styles.statusText}>
            {isActive ? "Active" : "Inactive"}
          </Text>
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, isActive && styles.toggleBtnActive]}
            onPress={toggleActive}
          >
            <Text style={styles.toggleText}>
              {isActive ? "On Duty" : "Go Active"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate("AlertDetails")}
          >
            <Text style={styles.gridText}>🚨 Alerts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate("ResponderProfile")}
          >
            <Text style={styles.gridText}>👤 Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate("IncomingEmergency")}
          >
            <Text style={styles.gridText}>📜 History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gridItem}>
            <Text style={styles.gridText}>⚙️ Settings</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Stay alert. Stay safe.</Text>
      </View>
    </PremiumBackground>
  );
}

/* -----------------------------------------
   STYLES
------------------------------------------ */
const styles = StyleSheet.create({
  header: { height: 120, justifyContent: "center", alignItems: "center" },
  logo: { fontSize: 32, fontWeight: "700", color: "#E63946", letterSpacing: 1 },
  tagline: { fontSize: 11, fontWeight: "600", color: "#F1FAEE", opacity: 0.85 },
  dashboard: { flex: 1, padding: 25, justifyContent: "space-between" },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 15,
  },
  dot: { width: 10, height: 10, borderRadius: 50, marginRight: 8 },
  statusText: { fontSize: 14, color: "#ccc" },
  toggleContainer: { alignItems: "center", marginVertical: 20 },
  toggleBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#8B0000",
    shadowColor: "#E63946",
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  toggleBtnActive: { backgroundColor: "#118C4F", shadowColor: "#06D6A0" },
  toggleText: { color: "white", fontSize: 18, fontWeight: "bold" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginVertical: 20,
  },
  gridItem: {
    width: "48%",
    padding: 25,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    marginBottom: 15,
  },
  gridText: { color: "white", fontSize: 16 },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: "#aaa",
    marginBottom: 10,
  },
});
