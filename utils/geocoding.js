import Geocoder from "react-native-geocoding";
import { GOOGLE_MAPS_API_KEY } from "@env";

Geocoder.init(GOOGLE_MAPS_API_KEY, { language: "en" });

/**
 * Convert GPS coordinates to a readable address string.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} - Human-readable location
 */
export async function getReadableLocation(lat, lng) {
  try {
    const response = await Geocoder.from(lat, lng);
    if (
      response.results &&
      response.results.length > 0 &&
      response.results[0].formatted_address
    ) {
      return response.results[0].formatted_address;
    }
    return "Unknown location";
  } catch (error) {
    console.error("Geocoding error:", error);
    return "Unknown location";
  }
}
