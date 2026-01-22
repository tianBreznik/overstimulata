import { useState, useEffect, useCallback } from 'react';
import { getDeviceId, isEditorDevice, isEditorDeviceSync, refreshAuthStatus } from '../utils/deviceAuth';
import { onAuthStateChange, getCurrentUser } from '../services/auth';

const OVERRIDE_KEY = 'overstimulata_reader_preview';

const sharedState = {
  deviceId: null,
  baseEditor: null,
  forceReaderPreview: false,
  subscribers: new Set(),
  authChecked: false,
};

let authListenerInitialized = false;

const ensureInitialised = () => {
  if (sharedState.deviceId !== null) return;

  const deviceId = getDeviceId();
  // Use sync version for initial render (uses cache or fallback)
  const baseEditor = isEditorDeviceSync();
  const stored = localStorage.getItem(OVERRIDE_KEY);
  const forceReaderPreview = baseEditor ? stored === 'reader' : false;

  sharedState.deviceId = deviceId;
  sharedState.baseEditor = baseEditor;
  sharedState.forceReaderPreview = forceReaderPreview;
  
  // Refresh from Firestore asynchronously (won't block initial render)
  refreshAuthStatus().then((isAuthorized) => {
    if (sharedState.baseEditor !== isAuthorized) {
      sharedState.baseEditor = isAuthorized;
      sharedState.authChecked = true;
      notify();
    }
  });

  // Set up auth state listener to refresh device whitelist on login (only once)
  if (!authListenerInitialized) {
    authListenerInitialized = true;
    onAuthStateChange(async (user) => {
      if (user) {
        // When user logs in, wait a bit for autoWhitelistDevice() to complete
        // Then refresh device whitelist status
        // Small delay ensures Firestore write from autoWhitelistDevice is visible
        setTimeout(async () => {
          const isAuthorized = await refreshAuthStatus();
          if (sharedState.baseEditor !== isAuthorized) {
            sharedState.baseEditor = isAuthorized;
            notify();
          }
        }, 500); // 500ms delay to allow Firestore write to propagate
      }
    });
  }
};

const computePreviewing = () =>
  sharedState.baseEditor ? sharedState.forceReaderPreview : true;

const computeIsEditor = () =>
  sharedState.baseEditor ? !sharedState.forceReaderPreview : false;

const notify = () => {
  const payload = {
    deviceId: sharedState.deviceId,
    baseEditor: sharedState.baseEditor,
    previewingAsReader: computePreviewing(),
    isEditor: computeIsEditor(),
  };
  sharedState.subscribers.forEach((cb) => cb(payload));
};

const setPreviewState = (forceReader) => {
  if (!sharedState.baseEditor) {
    sharedState.forceReaderPreview = false;
  } else {
    sharedState.forceReaderPreview = forceReader;
    if (forceReader) {
      localStorage.setItem(OVERRIDE_KEY, 'reader');
    } else {
      localStorage.removeItem(OVERRIDE_KEY);
    }
  }
  notify();
};

export const useEditorMode = () => {
  ensureInitialised();

  const [state, setState] = useState(() => ({
    deviceId: sharedState.deviceId,
    baseEditor: sharedState.baseEditor,
    previewingAsReader: computePreviewing(),
    isEditor: computeIsEditor(),
  }));

  useEffect(() => {
    const subscriber = (payload) => setState(payload);
    sharedState.subscribers.add(subscriber);
    // Sync immediately with current state
    subscriber({
      deviceId: sharedState.deviceId,
      baseEditor: sharedState.baseEditor,
      previewingAsReader: computePreviewing(),
      isEditor: computeIsEditor(),
    });
    return () => {
      sharedState.subscribers.delete(subscriber);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('reader-preview', state.previewingAsReader);
  }, [state.previewingAsReader]);

  const togglePreviewMode = useCallback(() => {
    if (!sharedState.baseEditor) return;
    setPreviewState(!sharedState.forceReaderPreview);
  }, []);

  return {
    isEditor: state.isEditor,
    deviceId: state.deviceId,
    canToggleEditorMode: state.baseEditor,
    previewingAsReader: state.previewingAsReader,
    togglePreviewMode,
  };
};

