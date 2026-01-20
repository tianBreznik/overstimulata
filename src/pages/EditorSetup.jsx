import { useState, useEffect } from 'react';
import { useEditorMode } from '../hooks/useEditorMode';
import { signOutUser, getCurrentUser, onAuthStateChange, isEmailAllowed } from '../services/auth';
import { refreshAuthStatus } from '../utils/deviceAuth';
import { LoginModal } from '../components/LoginModal';
import './EditorSetup.css';

export const EditorSetup = ({ onClose }) => {
  const { isEditor, deviceId } = useEditorMode();
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(getCurrentUser());
  const [emailAllowed, setEmailAllowed] = useState(null); // null = checking, true/false = result

  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      if (authUser) {
        // Check if email is allowed
        checkEmailStatus(authUser.email);
        // Refresh device whitelist status after login
        refreshAuthStatus();
      } else {
        setEmailAllowed(null);
      }
    });
    return unsubscribe;
  }, []);

  // Check email status when user changes
  useEffect(() => {
    if (user?.email) {
      checkEmailStatus(user.email);
    } else {
      setEmailAllowed(null);
    }
  }, [user]);

  const checkEmailStatus = async (email) => {
    if (!email) {
      setEmailAllowed(null);
      return;
    }
    setEmailAllowed(null); // Set to checking
    try {
      const allowed = await isEmailAllowed(email);
      setEmailAllowed(allowed);

    } catch (error) {

      setEmailAllowed(false);
    }
  };

  const handleLoginSuccess = async () => {
    setShowLogin(false);
    // Refresh device whitelist status after login
    await refreshAuthStatus();
  };

  const handleLogout = async () => {
    await signOutUser();
  };

  return (
    <>
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    <div className="setup-overlay" onClick={onClose}>
      <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="setup-header">
          <h2>Editor Setup</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="setup-content">
          <div className="status-section">
            <p className="label">Current Status:</p>
            <p className={`status ${isEditor ? 'editor' : 'reader'}`}>
              {isEditor ? '✓ Editor Mode Active' : '✗ Reader Mode'}
            </p>
          </div>

            {user ? (
              <>
                <div className="user-section">
                  <p className="label">Signed in as:</p>
                  <div className="user-info">
                    <p className="user-email">{user.email}</p>
                    {emailAllowed === false && (
                      <p className="user-note">
                        Your email is not in the allowed list. 
                        Contact an administrator to add your email to the allowed emails list.
                      </p>
                    )}
                    {emailAllowed === true && !isEditor && (
                      <p className="user-note" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1' }}>
                        Your email is allowed, but this device hasn't been whitelisted yet. 
                        Try signing out and signing back in to whitelist this device.
                      </p>
                    )}
            </div>
          </div>

          <div className="instructions">
                  {isEditor ? (
                    <>
                      <h3>You have editor access!</h3>
                      <p className="note">
                        Your device has been whitelisted for editor access. 
                        You can edit chapters, add content, and manage the book. 
                        Use the toggle in the bottom bar to switch between editor and reader preview.
                      </p>
                    </>
                  ) : emailAllowed === true ? (
                    <>
                      <h3>Email allowed, device not whitelisted</h3>
                      <p className="note">
                        Your email is in the allowed list, but this device hasn't been whitelisted yet. 
                        Try signing out and signing back in to automatically whitelist this device.
                      </p>
                    </>
                  ) : emailAllowed === false ? (
                    <>
                      <h3>Email not in allowed list</h3>
                      <p className="note">
                        Your email is not in the allowed list. 
                        Once your email is added to the allowed emails, logging in will automatically whitelist this device.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>Checking email status...</h3>
                      <p className="note">
                        Verifying if your email is in the allowed list...
                      </p>
                    </>
                  )}
                </div>

                <button onClick={handleLogout} className="logout-btn">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <div className="instructions">
                  <h3>Sign in to enable editor mode</h3>
            <p className="note">
                    Sign in with an allowed email address. If your email is in the allowed list, 
                    this device will be automatically whitelisted for editor access.
            </p>
                </div>
            
                <button onClick={() => setShowLogin(true)} className="login-btn">
                  Sign In
              </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

