# Email-Based Device Whitelisting Setup

## Overview

Editor access uses a hybrid approach:
1. Users sign in with Firebase Authentication (email/password or Google)
2. When they log in, the system checks if their email is in the `allowedEmails` collection
3. If their email is allowed, their device UUID is automatically added to the `editorWhitelist` collection
4. Editor access is based on device UUID (existing system)

## Security Rules

Two collections are used:

### `allowedEmails` Collection
- **Read access**: Anyone can check if an email is allowed
- **Write access**: NO client-side writes - only via Firebase Console or Admin SDK

### `editorWhitelist` Collection
- **Read access**: Anyone can check if a device is whitelisted
- **Write access**: Authenticated users can write their device ID (auto-whitelisting)

### Setting Up Firestore Rules

1. Go to Firebase Console → Firestore Database → Rules
2. Copy the contents of `firestore.rules` 
3. Deploy the rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
   Or paste them directly in the Firebase Console

## Setting Up Firebase Authentication

1. **Enable Authentication Providers**:
   - Go to Firebase Console → Authentication → Sign-in method
   - Enable "Email/Password" provider
   - Enable "Google" provider (optional, but recommended)

2. **Create Allowed Emails Collection**:
   - Go to Firestore Database in Firebase Console
   - Create a collection named `allowedEmails`
   - For each authorized email, add a document with:
     - **Document ID**: The email address (e.g., `user@example.com`)
     - **Fields** (optional):
       - `addedAt`: Timestamp (ISO string)
       - `email`: The email address (for clarity)

3. **Editor Whitelist Collection** (auto-created):
   - The `editorWhitelist` collection will be automatically populated
   - When a user with an allowed email logs in, their device UUID is added
   - Document ID: Device UUID
   - Fields: `deviceId`, `email`, `userId`, `addedAt`

## Adding Allowed Emails

**Via Firebase Console (Recommended)**
1. Go to Firestore Database → `allowedEmails` collection
2. Add a new document with:
   - **Document ID**: The email address (e.g., `editor@example.com`)
   - **Fields** (optional):
     - `addedAt`: Current timestamp (ISO string)
     - `email`: The email address

**Via Admin SDK (for automated systems)**
```javascript
const email = 'editor@example.com';
await admin.firestore().collection('allowedEmails').doc(email).set({
  email: email,
  addedAt: new Date().toISOString()
});
```

## How It Works

1. User signs in with email/password or Google
2. System checks if their email exists in `allowedEmails` collection
3. If email is allowed, system automatically adds their device UUID to `editorWhitelist`
4. Editor access is granted based on device UUID whitelist (existing system)
5. Each device must log in separately to be whitelisted

## Removing Editor Access

**To remove access for a specific device:**
- Delete the device UUID document from `editorWhitelist` collection

**To remove access for an email:**
- Delete the email document from `allowedEmails` collection
- This prevents new devices from being auto-whitelisted
- Existing whitelisted devices will still have access until their documents are removed

## Benefits

- Users must authenticate (more secure than device-only)
- Email-based authorization (easy to manage)
- Automatic device whitelisting (no manual device ID entry)
- Device-based access (works offline, cached)
- Each device needs separate login (granular control)

