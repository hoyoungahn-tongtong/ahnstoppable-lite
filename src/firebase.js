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

// ✅ 한번만 실행되도록 promise 캐시
let _authReadyPromise = null;

/**
 * waitForAuthReady:
 * - 익명 로그인(signInAnonymously) 보장
 * - onAuthStateChanged로 auth 객체 준비/사용자 확보 완료까지 대기
 */
export function waitForAuthReady() {
  if (_authReadyPromise) return _authReadyPromise;

  _authReadyPromise = new Promise(async (resolve, reject) => {
    try {
      // 이미 로그인되어 있으면 즉시 resolve
      if (auth.currentUser) {
        resolve(auth.currentUser);
        return;
      }

      // 익명 로그인 시도
      await signInAnonymously(auth);

      // 상태 안정화 대기
      const unsub = onAuthStateChanged(
        auth,
        (user) => {
          unsub();
          resolve(user);
        },
        (err) => {
          reject(err);
        }
      );
    } catch (e) {
      reject(e);
    }
  });

  return _authReadyPromise;
}
