// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  // 아래 3개는 없어도 동작하지만, 있으면 더 안전합니다
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
};console.log("API KEY =", process.env.REACT_APP_FIREBASE_API_KEY);
console.log("AUTH DOMAIN =", process.env.REACT_APP_FIREBASE_AUTH_DOMAIN);
console.log("PROJECT ID =", process.env.REACT_APP_FIREBASE_PROJECT_ID);


function assertEnv(name, v) {
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`[ENV MISSING] ${name} is empty. Check .env and restart npm start.`);
  }
}

assertEnv("REACT_APP_FIREBASE_API_KEY", firebaseConfig.apiKey);
assertEnv("REACT_APP_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain);
assertEnv("REACT_APP_FIREBASE_PROJECT_ID", firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export { signInAnonymously };
console.log("API KEY =", process.env.REACT_APP_FIREBASE_API_KEY);
console.log("AUTH DOMAIN =", process.env.REACT_APP_FIREBASE_AUTH_DOMAIN);
console.log("PROJECT ID =", process.env.REACT_APP_FIREBASE_PROJECT_ID);
