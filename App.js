import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";

import { auth } from "./firebaseconfig"; // keep for later navigation logic

// Screens
import SplashScreen from "./Screens/Shared/splash";
import Welcome from "./Screens/Shared/welcome";
import Login from "./Screens/Students/login";
import Signup from "./Screens/Students/Signup";
import LoginResponder from "./Screens/Responders/login";
import SignupResponder from "./Screens/Responders/signup";
import dashboard from "./Screens/Students/dashboard";
import ResponderDashboard from "./Screens/Responders/dashboard";
import ResetPassword from "./Screens/Students/resetpassword";
import ForgotPassword from "./Screens/Responders/forgotpassword";
import ProfileScreen from "./Screens/Students/profilescreen";
import EmergencyDetails from "./Screens/Students/securityform";
import EmergencyTracking from "./Screens/Students/Confirmation";
import MedicalEmergencyScreen from "./Screens/Students/medicalform";
import FireEmergencyScreen from "./Screens/Students/fireform";
import AlertDetailsScreen from "./Screens/Responders/alertdetails";
import IncomingEmergencyScreen from "./Screens/Responders/incomingalert";
import ResponderProfileScreen from "./Screens/Responders/profile";
import ComingSoon from "./Screens/Shared/comingsoon";

const Stack = createStackNavigator();

/* -----------------------------------------
   Notification display behavior
------------------------------------------ */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  useEffect(() => {
    const setupNotifications = async () => {
      if (!Device.isDevice) return;

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Push notification permission not granted");
        return;
      }
    };

    setupNotifications();

    // Handle notification taps (background / quit)
    const responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        if (data?.type === "emergency" && auth.currentUser) {
          console.log("Emergency notification tapped:", data);
          // Navigation will be wired when push routing is finalized
        }
      });

    return () => {
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Signup" component={Signup} />
      <Stack.Screen name="LoginResponder" component={LoginResponder} />
      <Stack.Screen name="SignupResponder" component={SignupResponder} />
      <Stack.Screen name="dashboard" component={dashboard} />
      <Stack.Screen name="ResponderDashboard" component={ResponderDashboard} />
      <Stack.Screen name="ResetPassword" component={ResetPassword} />
      <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
      <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
      <Stack.Screen name="EmergencyDetails" component={EmergencyDetails} />
      <Stack.Screen name="EmergencyTracking" component={EmergencyTracking} />
      <Stack.Screen
        name="MedicalEmergency"
        component={MedicalEmergencyScreen}
      />
      <Stack.Screen name="FireEmergency" component={FireEmergencyScreen} />
      <Stack.Screen name="AlertDetails" component={AlertDetailsScreen} />
      <Stack.Screen
        name="IncomingEmergency"
        component={IncomingEmergencyScreen}
      />
      <Stack.Screen
        name="ResponderProfile"
        component={ResponderProfileScreen}
      />
      <Stack.Screen name="ComingSoon" component={ComingSoon} />
    </Stack.Navigator>
  ); // ← THIS ) WAS MISSING!
}

export default function App() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
