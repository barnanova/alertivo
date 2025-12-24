// Import Firebase Core
import { initializeApp } from "firebase/app";

// Auth imports
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  getReactNativePersistence,
} from "firebase/auth";

// React Native platform detection + async storage
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firestore & Storage
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Functions
import { getFunctions } from "firebase/functions";

// Detect platform
const isReactNative = Platform.OS === "ios" || Platform.OS === "android";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBhBbsDJVDAc35fQa4PnZvOIhVr_p5StPo",
  authDomain: "alertivo-new.firebaseapp.com",
  projectId: "alertivo-new",
  storageBucket: "alertivo-new.firebasestorage.app",
  messagingSenderId: "585465920059",
  appId: "1:585465920059:web:fe79975898a7e903423a1e",
};

// Initialize App
export const app = initializeApp(firebaseConfig);

// AUTH PERSISTENCE FIX
let auth;

if (isReactNative) {
  // Mobile
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  // Web
  auth = getAuth(app);
  auth.setPersistence(browserLocalPersistence);
}

export { auth };

// Other services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

// No messaging export here — lazy load in screens only

export default app;
