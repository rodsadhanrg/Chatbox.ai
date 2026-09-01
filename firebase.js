/* ============================================================
   firebase.js — Firebase project wiring for ChatFlow AI
   ------------------------------------------------------------
   Replace the values below with your own Firebase project
   credentials (Project settings → General → Your apps → SDK
   config). This file must load BEFORE app.js on every page.

   Required Firebase products (enable in the console):
     - Authentication → Sign-in method → Google
     - Realtime Database → create in "locked mode", rules below
     - Storage → for chatbox logos / avatars

   Realtime Database rules starting point (tighten for prod):
   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())",
           ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())"
         }
       },
       "websites": {
         ".read": "auth != null",
         "$id": { ".write": "auth != null && (!data.exists() || data.child('ownerUid').val() === auth.uid || root.child('admins').child(auth.uid).exists())" }
       },
       "admins": { ".read": "auth != null", ".write": false },
       "plans": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
       "coupons": { ".read": "auth != null", ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
       "payments": { ".read": "auth != null", ".write": "auth != null" },
       "notifications": { ".read": "auth != null", ".write": "auth != null && root.child('admins').child(auth.uid).exists()" }
     }
   }
   ============================================================ */

const firebaseConfig = {
    apiKey: "AIzaSyDr9f4GNVcXzVEJzTMFLL2oGy5vSUhUpg0",
    authDomain: "chatflow-ce87e.firebaseapp.com",
    projectId: "chatflow-ce87e",
    storageBucket: "chatflow-ce87e.firebasestorage.app",
    messagingSenderId: "806512717419",
    appId: "1:806512717419:web:5940c3490915a87a07cb2e",
    measurementId: "G-P2CFXV0GXM"
  };

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Set to true while wiring up a Razorpay account; false runs a
// simulated "test mode" checkout so the flow can be demoed without
// real keys. See plans.html / app.js `startCheckout()`.
const RAZORPAY_TEST_MODE = true;
const RAZORPAY_KEY_ID = "rzp_test_YOUR_KEY_ID";