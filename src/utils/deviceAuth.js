import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

// Generate or retrieve a unique device ID
export const getDeviceId = () => {
  const DEVICE_ID_KEY = 'overstimulata_device_id';
  
  // Check if device ID already exists
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate a new unique device ID
    deviceId = generateUniqueId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  // Log device ID to console for whitelist setup
  
  return deviceId;
};

// Generate a unique ID based on timestamp and random string
const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomStr}`;
};

// Cache keys
const CACHE_KEY = 'overstimulata_editor_auth_cache';
const CACHE_TIMESTAMP_KEY = 'overstimulata_editor_auth_cache_timestamp';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Get cached authorization status
const getCachedAuth = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < CACHE_DURATION) {
        return JSON.parse(cached);
      }
    }
  } catch (e) {
  }
  return null;
};

// Cache authorization status
const setCachedAuth = (deviceId, isAuthorized) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ deviceId, isAuthorized }));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
  }
};

// Fetch whitelist from Firestore
const fetchWhitelistFromFirestore = async () => {
  try {
    const whitelistRef = collection(db, 'editorWhitelist');
    const snapshot = await getDocs(whitelistRef);
    const whitelist = snapshot.docs.map(doc => doc.id); // Use document ID as device ID
    return whitelist;
  } catch (error) {
    return null;
  }
};

// Check if device is in Firestore whitelist
const checkFirestoreWhitelist = async (deviceId) => {
  try {
    const deviceDoc = await getDoc(doc(db, 'editorWhitelist', deviceId));
    return deviceDoc.exists();
  } catch (error) {
    return false;
  }
};

// Check if current device is authorized as editor
// Uses cache first, then checks Firestore, with fallback to hardcoded list
export const isEditorDevice = async () => {
  const deviceId = getDeviceId();
  
  // Check cache first
  const cached = getCachedAuth();
  if (cached && cached.deviceId === deviceId) {
    return cached.isAuthorized;
  }
  
  // Check Firestore
  const isAuthorized = await checkFirestoreWhitelist(deviceId);
  
  // Cache the result
  setCachedAuth(deviceId, isAuthorized);
  
  return isAuthorized;
};

// Synchronous version that uses cache (for initial render)
export const isEditorDeviceSync = () => {
  const deviceId = getDeviceId();
  const cached = getCachedAuth();
  
  if (cached && cached.deviceId === deviceId) {
    return cached.isAuthorized;
  }
  
  // Fallback to hardcoded list if no cache (for backwards compatibility during migration)
  const FALLBACK_WHITELIST = [
  'mgjxds3q-1rekdb1eb7y',
  'mi1jtuuj-9x6z4uj4kh',
  'mi37kcqh-j4cmiln4r1l',
  'mi38utyt-9colfarywk7',
  'mi3iteoy-2j8voox4ec6',
  'mi3jjwma-qsglzpy5daa',
  'mi4yemvc-xp6j3uu12x',
  'miiq366c-exsxgdbmp6m',
  'mj025jwg-sdmgx7121dc',
  'mj8ier44-uoqhx79db2n',
  'mihhv6f0-5rzg6xc3zbq',
    'mk753qdp-b3p5uladgdu',
    'mk8c3f8f-t993ymje23c'
  ];
  
  return FALLBACK_WHITELIST.includes(deviceId);
};

// Add a new device to Firestore whitelist
// SECURITY: This function will fail with client-side Firestore security rules
// Devices should only be added via Firebase Console or Admin SDK
// This function is kept for admin/internal use only
export const addDeviceToWhitelist = async (deviceId) => {
  try {
    await setDoc(doc(db, 'editorWhitelist', deviceId), {
      addedAt: new Date().toISOString(),
      deviceId: deviceId
    });
    
    // Update cache immediately
    setCachedAuth(deviceId, true);
    
    return true;
  } catch (error) {
    return false;
  }
};

// Refresh authorization status from Firestore
export const refreshAuthStatus = async () => {
  const deviceId = getDeviceId();
  const isAuthorized = await checkFirestoreWhitelist(deviceId);
  setCachedAuth(deviceId, isAuthorized);
  return isAuthorized;
};

