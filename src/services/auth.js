import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDeviceId } from '../utils/deviceAuth';

// Check if user's email is in the allowedEmails collection
export const isEmailAllowed = async (email) => {
  if (!email) return false;
  
  try {
    const emailDocRef = doc(db, 'allowedEmails', email);
    const emailDoc = await getDoc(emailDocRef);
    const exists = emailDoc.exists();
    return exists;
  } catch (error) {
    return false;
  }
};

// Automatically whitelist device UUID if user's email is allowed
export const autoWhitelistDevice = async (user) => {
  if (!user || !user.email) {
    return false;
  }
  
  try {
    const emailAllowed = await isEmailAllowed(user.email);
    if (!emailAllowed) {
      return false;
    }
    
    const deviceId = getDeviceId();
    await setDoc(doc(db, 'editorWhitelist', deviceId), {
      addedAt: new Date().toISOString(),
      deviceId: deviceId,
      email: user.email,
      userId: user.uid,
    });
    return true;
  } catch (error) {
    return false;
  }
};

// Sign in with email and password
export const signInWithEmail = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // Auto-whitelist device if email is allowed
    await autoWhitelistDevice(userCredential.user);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

// Sign in with Google
export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    // Auto-whitelist device if email is allowed
    await autoWhitelistDevice(userCredential.user);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

// Sign up with email and password
export const signUpWithEmail = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Auto-whitelist device if email is allowed
    await autoWhitelistDevice(userCredential.user);
    return { user: userCredential.user, error: null };
  } catch (error) {
    return { user: null, error: error.message };
  }
};

// Sign out
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

// Get current user
export const getCurrentUser = () => {
  return auth.currentUser;
};

// Subscribe to auth state changes
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

