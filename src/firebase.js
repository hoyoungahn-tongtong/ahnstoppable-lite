// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// 익명 로그인 "완료"까지 기다리는 Promise
let _authReadyPromise = null;

export function waitForAuthReady() {
  if (_authReadyPromise) return _authReadyPromise;

  _authReadyPromise = new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (user) {
            unsub();
            resolve(user);
            return;
          }
          // 아직 user가 없으면 익명 로그인 시도
          await signInAnonymously(auth);
          // signIn 후 onAuthStateChanged가 다시 호출되며 resolve됨
        } catch (e) {
          unsub();
          reject(e);
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });

  return _authReadyPromise;
}

export default app;
