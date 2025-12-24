import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import Checkbox from "expo-checkbox";
import { LinearGradient } from "expo-linear-gradient";
import Background from "../../Components/background";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseconfig"; // Adjust path if needed (e.g., "../../../src/firebaseConfig")

export default function SignupScreen({ navigation }) {
  const [isChecked, setIsChecked] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [matric, setMatric] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  // 🔹 Send OTP (Real callable)
  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Enter your email first.");
      return;
    }
    try {
      setLoading(true);
      const sendOtp = httpsCallable(functions, "sendOtp");
      const res = await sendOtp({ email: email.trim() });

      if (res.data.success) {
        setOtpSent(true);
        Alert.alert("✅ OTP Sent", "Check your email inbox for the code.");
      } else {
        Alert.alert("Error", res.data.message || "Failed to send OTP.");
      }
    } catch (err) {
      console.error("Send OTP error:", err.code, err.message);
      let errorMsg = "Failed to send OTP. Check your connection and try again.";
      if (err.code === "unavailable")
        errorMsg = "Service unavailable. Try later.";
      if (err.code === "internal") errorMsg = "Server error. Contact support.";
      if (err.code === "permission-denied")
        errorMsg = "Invalid email domain. Use @students.unilorin.edu.ng.";
      Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Verify OTP and Sign Up (Real callable—pass password for backend set)
  const handleVerifyAndSignup = async () => {
    if (!matric.trim() || !email.trim() || !password || !otp.trim()) {
      Alert.alert("Error", "Fill in all fields.");
      return;
    }
    if (!isChecked) {
      Alert.alert("Error", "You must agree to Terms & Conditions.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      const verifyOtp = httpsCallable(functions, "verifyOtp");
      const otpRes = await verifyOtp({
        email: email.trim(),
        otp: otp.trim(),
        password: password, // Pass to backend for admin.auth().updateUser()
      });

      if (otpRes.data.success) {
        Alert.alert(
          "🎉 Success",
          "Account created & verified! You can now log in.",
          [{ text: "OK", onPress: () => navigation.navigate("Login") }]
        );
      } else {
        Alert.alert("Error", otpRes.data.message || "OTP verification failed.");
      }
    } catch (err) {
      console.error("Signup error:", err.code, err.message);
      let msg = "Signup failed. Try again.";
      if (err.code === "auth/email-already-in-use")
        msg = "Email already registered.";
      if (err.code === "auth/weak-password")
        msg = "Password must be at least 6 characters.";
      if (err.code === "auth/invalid-email") msg = "Invalid email format.";
      if (err.code === "functions/unavailable")
        msg = "Service unavailable. Check connection.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Background>
      <ScrollView contentContainerStyle={styles.formWrapper}>
        <View style={styles.form}>
          <Text style={styles.title}>Sign Up</Text>

          {/* Matric */}
          <TextInput
            style={styles.input}
            placeholder="Matric Number"
            placeholderTextColor="#aaa"
            value={matric}
            onChangeText={setMatric}
          />

          {/* Email */}
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            placeholderTextColor="#aaa"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />

          {/* OTP */}
          <View style={styles.verificationGroup}>
            <View style={{ flex: 2 }}>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="Verification Code"
                placeholderTextColor="#aaa"
                value={otp}
                onChangeText={setOtp}
                editable={otpSent}
              />
            </View>

            <LinearGradient
              colors={["#E63946", "#8B0000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientSendBtn}
            >
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { opacity: loading || otpSent ? 0.7 : 1 },
                ]}
                onPress={handleSendOtp}
                disabled={loading || otpSent}
              >
                <Text
                  style={{
                    color: "white",
                    fontWeight: "bold",
                    fontSize: 14,
                  }}
                >
                  {loading ? "Sending..." : otpSent ? "Sent" : "Send"}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Password */}
          <View style={{ position: "relative" }}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#aaa"
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={styles.togglePassword}
              onPress={() => setPasswordVisible(!passwordVisible)}
            >
              <Text style={{ color: "#ccc", fontSize: 16 }}>
                {passwordVisible ? "👁️" : "🙈"}
              </Text>
            </Pressable>
          </View>

          {/* Terms */}
          <View style={styles.terms}>
            <Checkbox
              value={isChecked}
              onValueChange={setIsChecked}
              color={isChecked ? "#E63946" : undefined}
            />
            <Text style={[styles.checkboxText, { color: "white" }]}>
              I agree to <Text style={styles.link}>Terms & Conditions</Text>
            </Text>
          </View>

          {/* Sign Up */}
          <TouchableOpacity
            style={styles.signupBtn}
            onPress={handleVerifyAndSignup}
            disabled={loading}
          >
            <LinearGradient
              colors={["#E63946", "#8B0000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientBtn}
            >
              <Text style={styles.signupText}>
                {loading ? "Creating..." : "Sign Up"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Background>
  );
}

const styles = StyleSheet.create({
  formWrapper: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  form: {
    width: 320,
    padding: 25,
    borderRadius: 15,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#E63946",
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 20,
    color: "#E63946",
    fontSize: 22,
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    padding: 12,
    marginBottom: 15,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "white",
    fontSize: 14,
  },
  togglePassword: {
    position: "absolute",
    top: "38%",
    right: 15,
    transform: [{ translateY: -12 }],
  },
  verificationGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 10,
  },
  otpInput: {
    marginBottom: 0,
  },
  gradientSendBtn: {
    borderRadius: 25,
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sendBtn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  terms: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  checkboxText: { marginLeft: 8 },
  link: { color: "#E63946", textDecorationLine: "underline" },
  signupBtn: { width: "100%", borderRadius: 25, overflow: "hidden" },
  gradientBtn: { padding: 12, alignItems: "center", justifyContent: "center" },
  signupText: { color: "white", fontWeight: "bold", fontSize: 16 },
});
