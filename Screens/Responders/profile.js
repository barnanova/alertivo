import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { auth } from "firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Background from "../../Components/background";
import app from "../../firebaseconfig";

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export default function ResponderProfileScreen({ navigation }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    name: "",
    phoneNumber: "",
    station: "",
    responderType: "",
    notifications: true,
    profileImage: null,
  });

  const currentUser = auth.currentUser;

  // 🔹 Fetch profile from Firestore
  useEffect(() => {
    const fetchProfile = async () => {
      if (!currentUser) return;
      try {
        const docRef = doc(db, "responders", currentUser.uid);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          setProfile({ ...profile, ...snap.data() });
        } else {
          // create initial profile if not found
          await setDoc(docRef, {
            uid: currentUser.uid,
            phoneNumber: currentUser.phoneNumber || "",
            name: currentUser.displayName || "",
            responderType: "medical",
            station: "",
            notifications: true,
            profileImage: null,
            createdAt: new Date(),
          });
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
        Alert.alert("Error", "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // 🔹 Pick profile image
  const pickImage = async () => {
    if (!isEditing) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setProfile({ ...profile, profileImage: result.assets[0].uri });
    }
  };

  // 🔹 Save changes to Firestore
  const saveChanges = async () => {
    if (!currentUser) return;
    try {
      let photoURL = profile.profileImage;

      // Upload new image to Firebase Storage if it’s local
      if (photoURL && !photoURL.startsWith("https")) {
        const response = await fetch(photoURL);
        const blob = await response.blob();
        const storageRef = ref(storage, `responders/${currentUser.uid}.jpg`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      }

      const docRef = doc(db, "responders", currentUser.uid);
      await updateDoc(docRef, {
        ...profile,
        profileImage: photoURL,
        updatedAt: new Date(),
      });

      setIsEditing(false);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (err) {
      console.error("Error saving profile:", err);
      Alert.alert("Error", "Failed to save profile");
    }
  };

  const toggleEdit = () => {
    if (isEditing) saveChanges();
    else setIsEditing(true);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      await AsyncStorage.removeItem("responderData"); // 🧹 Clear saved session
      navigation.replace("Welcome");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert("Error", "Failed to log out. Please try again.");
    }
  };

  if (loading) {
    return (
      <Background>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator color="#E63946" size="large" />
          <Text style={{ color: "white", marginTop: 10 }}>
            Loading profile...
          </Text>
        </View>
      </Background>
    );
  }

  return (
    <Background>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 18 }}>
        {/* Logo & Tagline */}
        <View style={{ alignItems: "center", marginBottom: 28, marginTop: 15 }}>
          <Text style={styles.logo}>ALERTIVO</Text>
          <Text style={styles.tagline}>Smart. Fast. Safe.</Text>
        </View>

        {/* Profile Form */}
        <View style={{ gap: 16 }}>
          {/* Profile Image */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity style={styles.profilePic} onPress={pickImage}>
              {profile.profileImage ? (
                <Image
                  source={{ uri: profile.profileImage }}
                  style={{ width: 64, height: 64, borderRadius: 32 }}
                />
              ) : (
                <Text style={{ fontSize: 28 }}>👤</Text>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={[styles.input, !isEditing && styles.readOnly]}
                value={profile.name}
                onChangeText={(text) => setProfile({ ...profile, name: text })}
                editable={isEditing}
                placeholder="Responder full name"
                placeholderTextColor="rgba(255,255,255,0.6)"
              />
            </View>
          </View>

          {/* Phone */}
          <View>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnly]}
              value={profile.phoneNumber}
              onChangeText={(text) =>
                setProfile({ ...profile, phoneNumber: text })
              }
              editable={isEditing}
              keyboardType="phone-pad"
              placeholder="+234..."
              placeholderTextColor="rgba(255,255,255,0.6)"
            />
          </View>

          {/* Station */}
          <View>
            <Text style={styles.label}>Station</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnly]}
              value={profile.station}
              onChangeText={(text) => setProfile({ ...profile, station: text })}
              editable={isEditing}
              placeholder="Responder station / base"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />
          </View>

          {/* Responder Type */}
          <View>
            <Text style={styles.label}>Responder Type</Text>
            <View style={styles.toggleRow}>
              {["medical", "security", "fire"].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleBtn,
                    profile.responderType === type && styles.toggleBtnActive,
                  ]}
                  onPress={() =>
                    isEditing && setProfile({ ...profile, responderType: type })
                  }
                  disabled={!isEditing}
                >
                  <Text style={{ color: "#fff" }}>
                    {type === "medical"
                      ? "🩺 Medical"
                      : type === "security"
                      ? "🛡️ Security"
                      : "🔥 Fire"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={{ marginTop: 20, gap: 10 }}>
          <TouchableOpacity onPress={toggleEdit}>
            <LinearGradient
              colors={["#E63946", "#8B0000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>
                {isEditing ? "Save Changes" : "Edit Profile"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogout}>
            <Text style={{ color: "rgba(255,255,255,0.6)" }}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Background>
  );
}

const styles = StyleSheet.create({
  logo: {
    fontSize: 20,
    color: "#E63946",
    fontWeight: "700",
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
  profilePic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    marginBottom: 6,
    fontSize: 15,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 15,
  },
  readOnly: {
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.3)",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  toggleBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: "#E63946",
  },
  primaryBtn: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  secondaryBtn: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
});
