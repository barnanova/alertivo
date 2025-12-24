console.log("🔥 Test script started");

const axios = require("axios");

// Test email
const testEmail = "olanrewajupelumi606@gmail.com";

// Cloud Function URL
const functionUrl =
  "https://us-central1-alertivo-new.cloudfunctions.net/sendOtp";

async function testSendOtp() {
  console.log("🚀 Sending OTP to:", testEmail);

  try {
    const response = await axios.post(functionUrl, {
      data: { email: testEmail },
    });

    console.log("✅ Response:", response.data);
  } catch (error) {
    console.log("❌ Error occurred");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    } else {
      console.log(error.message);
    }
  }
}

testSendOtp();

console.log("⚡ Script executed (waiting for response...)");
