import { useState, useEffect } from 'react';
import { useEditorMode } from '../hooks/useEditorMode';
import { signOutUser, getCurrentUser, onAuthStateChange } from '../services/auth';
import { refreshAuthStatus } from '../utils/deviceAuth';
import { LoginModal } from '../components/LoginModal';
import './EditorSetup.css';

export const EditorSetup = ({ onClose }) => {
  const { isEditor, deviceId } = useEditorMode();
  const [showLogin, setShowLogin] = useState(false);
  const [user, setUser] = useState(getCurrentUser());

  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      if (authUser) {
        // Refresh device whitelist status after login
        refreshAuthStatus();
      }
    });
    return unsubscribe;
  }, []);

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
                    {!isEditor && (
                      <p className="user-note">
                        Your email is not in the allowed list. 
                        Contact an administrator to add your email to the allowed emails list.
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
                  ) : (
                    <>
                      <h3>Device not whitelisted</h3>
                      <p className="note">
                        You're signed in, but your email is not in the allowed list. 
                        Once your email is added to the allowed emails, logging in will automatically whitelist this device.
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

