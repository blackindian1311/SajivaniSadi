// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCWtEEJJpoPTJtBU9ECpa1Ps2IOJyHZLSY",
  authDomain: "sanjiwanisari-2222e.firebaseapp.com",
  projectId: "sanjiwanisari-2222e",
  storageBucket: "sanjiwanisari-2222e.firebasestorage.app",
  messagingSenderId: "773050300354",
  appId: "1:773050300354:web:1e0133afa9fd6f2cf8885b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
