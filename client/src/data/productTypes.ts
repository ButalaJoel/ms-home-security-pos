/**
 * Product types per category, with the standard specification names for each.
 * Used by the "Website details" part of the product form: picking a type and
 * pressing "Use standard specs" fills in the spec names, so every product of
 * the same type is described the same way on the website.
 */

export type ProductType = { name: string; specs: string[] };

const CAMERA = ["Resolution", "Lens", "Night vision range", "Shape", "Indoor / outdoor", "Weatherproof rating", "Power", "Audio", "Smart detection", "Storage on camera"];

export const PRODUCT_TYPES: Record<string, ProductType[]> = {
  "CCTV Cameras": [
    { name: "Network cameras (IP)", specs: CAMERA },
    { name: "Turbo HD cameras (analogue)", specs: CAMERA.filter((label) => label !== "Storage on camera") },
    { name: "PTZ cameras", specs: [...CAMERA, "Optical zoom", "Pan and tilt range"] },
    { name: "Wi-Fi cameras", specs: [...CAMERA, "Wi-Fi"] },
    { name: "Solar cameras", specs: [...CAMERA, "Solar panel", "Battery", "Connectivity (4G / Wi-Fi)"] },
    { name: "NVRs (network recorders)", specs: ["Channels", "Max camera resolution", "Hard-drive bays", "Max hard-drive size", "PoE ports", "Video output", "Remote viewing app"] },
    { name: "DVRs (Turbo HD recorders)", specs: ["Channels", "Max camera resolution", "Hard-drive bays", "Max hard-drive size", "Video output", "Remote viewing app"] },
    { name: "Hard drives", specs: ["Capacity", "Type", "Made for", "Warranty"] },
    { name: "Kits", specs: ["Cameras included", "Recorder", "Hard drive", "Cables and accessories", "Resolution"] },
    { name: "Accessories", specs: ["Type", "Fits", "Material"] },
  ],
  "Alarms & Sensors": [
    { name: "Alarm panels", specs: ["Zones", "Wireless sensors supported", "Communication", "Siren", "Backup battery", "App"] },
    { name: "Sensors and detectors", specs: ["Detection type", "Range", "Wired / wireless", "Battery", "Indoor / outdoor"] },
    { name: "Beam sensors", specs: ["Number of beams", "Range", "Indoor / outdoor", "Power"] },
    { name: "Sirens", specs: ["Volume", "Indoor / outdoor", "Wired / wireless", "Power"] },
  ],
  "Access Control & Attendance": [
    { name: "Face and fingerprint terminals", specs: ["Verification methods", "User capacity", "Face capacity", "Fingerprint capacity", "Card capacity", "Record capacity", "Communication", "Power", "Software"] },
    { name: "Card readers and keypads", specs: ["Verification methods", "Card type", "Communication", "Indoor / outdoor", "Power"] },
    { name: "Video intercom", specs: ["Screen size", "Camera resolution", "Door release", "Wired / IP / Wi-Fi", "App"] },
    { name: "Locks and door accessories", specs: ["Type", "Holding force", "Power", "Fits door type"] },
  ],
  "Smart Locks": [
    { name: "Home smart locks", specs: ["Unlock methods", "Fingerprint capacity", "Door thickness", "Door type", "Material", "Battery", "Emergency power", "App"] },
    { name: "Hotel locks", specs: ["Card type", "Door thickness", "Material", "Battery", "Management software"] },
    { name: "Glass and aluminium door locks", specs: ["Unlock methods", "Fits door type", "Material", "Battery"] },
  ],
  "Metal Detectors": [
    { name: "Handheld detectors", specs: ["Detection", "Alert modes", "Sensitivity adjustment", "Battery", "Battery life", "Weight"] },
    { name: "Walk-through detectors", specs: ["Detection zones", "Sensitivity levels", "Display", "Alarm", "Power", "Dimensions"] },
    { name: "Ground search and gold detectors", specs: ["Search depth", "Target ID", "Search coil", "Battery", "Weight"] },
  ],
  "Walkie-Talkies & Radios": [
    { name: "Two-way radios", specs: ["Frequency band", "Channels", "Power output", "Typical range", "Battery", "Battery life", "Waterproof rating"] },
    { name: "Repeaters and base stations", specs: ["Frequency band", "Power output", "Coverage", "Power"] },
    { name: "Radio accessories", specs: ["Type", "Fits models"] },
  ],
  "Convex Mirrors": [
    { name: "Indoor mirrors", specs: ["Diameter", "Material", "Viewing angle", "Mounting"] },
    { name: "Outdoor and traffic mirrors", specs: ["Diameter", "Material", "Viewing angle", "Pole size", "Weather resistance"] },
  ],
  "Parking, Traffic & Queue Systems": [
    { name: "Boom barriers", specs: ["Boom length", "Opening time", "Motor", "Remote control", "Duty", "Power"] },
    { name: "Turnstiles", specs: ["Type", "Material", "People per minute", "Access integration", "Power"] },
    { name: "Parking systems", specs: ["Entry method", "Payment", "Number-plate recognition", "Display", "Software"] },
    { name: "Queue management", specs: ["Ticket printing", "Counters supported", "Display", "Voice calling", "Software"] },
  ],
};

export function typesFor(category: string): ProductType[] {
  return PRODUCT_TYPES[category] ?? [];
}

export function specLabelsFor(category: string, type: string): string[] {
  return typesFor(category).find((item) => item.name === type)?.specs ?? [];
}
