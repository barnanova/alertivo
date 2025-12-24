console.log("🚀 Script started");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBhBbsDJVDAc35fQa4PnZvOIhVr_p5StPo",
  authDomain: "alertivo-new.firebaseapp.com",
  projectId: "alertivo-new",
  storageBucket: "alertivo-new.firebasestorage.app",
  messagingSenderId: "585465920059",
  appId: "1:585465920059:web:fe79975898a7e903423a1e",
};

// Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  // Load JSON file
  const dataPath = path.join(__dirname, "preload.json");
  console.log("📂 Loading file from:", dataPath);

  const fileData = fs.readFileSync(dataPath, "utf8");
  const responders = JSON.parse(fileData);
  console.log("✅ Found", responders.length, "responders");

  // Initialize Firebase + Firestore
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("⚙️ Uploading to Firestore...");

  for (const responder of responders) {
    const docRef = doc(collection(db, "responders"), responder.id);
    await setDoc(docRef, responder);
    console.log(`✅ Uploaded ${responder.id}`);
  }

  console.log("🎉 All responders uploaded successfully!");
} catch (err) {
  console.error("❌ Error:", err);
}

console.log("🏁 Script finished");
