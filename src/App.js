// src/App.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  where,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db, waitForAuthReady } from "./firebase";

// =========================
// ENV / CONFIG
// =========================
const APP_ID = process.env.REACT_APP_APP_ID || "ahnstoppable-lite";
const ADMIN_PIN = process.env.REACT_APP_ADMIN_PIN || "";
const ADMIN_NAME = "Administrator";

const COURSES = [
  { id: "ADV 375-01", label: "ADV 375-01" },
  { id: "ADV 375-02", label: "ADV 375-02" },
  { id: "ADV 461", label: "ADV 461" },
];

const COURSE_STUDENTS = {
  "ADV 375-01": [
    "Aviv, Andie",
    "Chan, Natalie",
    "Chang, Michelle",
    "Cummins, Joseph",
    "Fiedler, Brendan",
    "Gillespie, Anna",
    "Helm, Lilliana",
    "Ho, Keira",
    "Hsu, Ling",
    "Humphreys, Collier",
    "Ketenci, Deniz Havva",
    "Korosy, Isaiah",
    "Lam, Steffanie",
    "Morris, Katelyn",
    "Ortiz-Mena, Sophie",
    "Park, Jessica",
    "Payne, Avery",
    "Rosso-Benitez, Monica",
    "Song, Joseph",
    "Tedesco, Cami",
    "Student, Test",
  ],
  "ADV 375-02": [
    "Area, Maddie",
    "Bespalov, Michael I (student)",
    "Burnam, Abby",
    "Caukin, Casynee",
    "Cho, Lauren",
    "Colmenares, Krista",
    "Garofano, Alliea",
    "George, Matthew",
    "Hsu, Ming",
    "Mason, Belle",
    "Monte, Ella",
    "Nilsen, Rowan",
    "Nola Karapetian, Sienna",
    "O'Neill, Charles",
    "Ocampo, Anette",
    "Pinal-Rivera, Oscar",
    "Rempel, Madelyn",
    "Sebastiani, Gabriella",
    "Sullivan, Kaylea",
    "Williams, Ella",
    "Student, Test",
  ],
  "ADV 461": [
    "Alius-Piedade, Jason",
    "Carroll, Everly",
    "de Bruyn, Taylor",
    "Gabelhausen, Ella",
    "Mady, Gabriella",
    "McArtor, Ava",
    "Monte, Ella",
    "Zong, Aidan",
    "Student, Test",
  ],
};

// =========================
// HELPERS
// =========================
function firstName(fullName) {
  if (!fullName) return "";
  if (fullName.includes(",")) return fullName.split(",")[1].trim();
  return fullName.split(" ")[0].trim();
}

function getPacificParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const dow = weekdayMap[map.weekday] ?? 0;
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  const mins = hour * 60 + minute;
  return { year, month, day, hour, minute, dow, mins, dateKey };
}

function getPacificDateKeyNow() {
  return getPacificParts(new Date()).dateKey;
}

function tsToMillis(tsLike) {
  if (!tsLike) return null;
  if (typeof tsLike.toMillis === "function") return tsLike.toMillis();
  if (typeof tsLike.seconds === "number") return tsLike.seconds * 1000;
  return null;
}

function formatTsPT(tsLike) {
  const ms = tsToMillis(tsLike);
  if (!ms) return "";
  const d = new Date(ms);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function toPTMinutes(tsLike) {
  const ms = tsToMillis(tsLike);
  if (!ms) return null;
  const d = new Date(ms);
  const parts = getPacificParts(d);
  return parts.mins;
}

function clampText(s, max = 1200) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) : t;
}

function minsToLabel(mins) {
  if (mins == null) return "";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// =========================
// UI: 2026 Calendar
// =========================
function Calendar2026({ valueDateKey, onPick, onClose }) {
  const months = useMemo(
    () => [
      { m: 0, name: "January" },
      { m: 1, name: "February" },
      { m: 2, name: "March" },
      { m: 3, name: "April" },
      { m: 4, name: "May" },
      { m: 5, name: "June" },
      { m: 6, name: "July" },
      { m: 7, name: "August" },
      { m: 8, name: "September" },
      { m: 9, name: "October" },
      { m: 10, name: "November" },
      { m: 11, name: "December" },
    ],
    []
  );

  const weekday = ["S", "M", "T", "W", "T", "F", "S"];

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }
  function firstDow(year, monthIndex) {
    return new Date(year, monthIndex, 1).getDay();
  }

  return (
    <div style={styles.calendarOverlay}>
      <div style={styles.calendarPanel}>
        <div style={styles.calendarHeader}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Pick a date (2026)</div>
          <button style={styles.smallBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={styles.calendarGrid12}>
          {months.map((mo) => {
            const year = 2026;
            const dim = daysInMonth(year, mo.m);
            const offset = firstDow(year, mo.m);

            const cells = [];
            for (let i = 0; i < offset; i++) cells.push(null);
            for (let d = 1; d <= dim; d++) cells.push(d);

            return (
              <div key={mo.m} style={styles.monthCard}>
                <div style={styles.monthTitle}>{mo.name}</div>

                <div style={styles.weekRow}>
                  {weekday.map((w) => (
                    <div key={w} style={styles.weekCell}>
                      {w}
                    </div>
                  ))}
                </div>

                <div style={styles.daysGrid}>
                  {cells.map((d, idx) => {
                    if (!d) return <div key={idx} style={styles.dayEmpty} />;
                    const dk = `${year}-${String(mo.m + 1).padStart(2, "0")}-${String(d).padStart(
                      2,
                      "0"
                    )}`;
                    const isSelected = dk === valueDateKey;

                    return (
                      <button
                        key={idx}
                        style={{
                          ...styles.dayBtn,
                          ...(isSelected ? styles.dayBtnSelected : {}),
                        }}
                        onClick={() => onPick(dk)}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =========================
// Student PIN Auth UI
// =========================
function StudentPinAuth({ selectedName, pinRegistered, authBusy, onLogin, onRegister, isAuthed }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  useEffect(() => {
    setPin("");
    setPin2("");
  }, [selectedName, pinRegistered, isAuthed]);

  if (isAuthed) return null;

  if (!selectedName) return <div style={{ opacity: 0.8, marginTop: 12 }}>Select your name first.</div>;

  if (pinRegistered) {
    return (
      <div style={styles.pinBox}>
        <div style={styles.pinTitle}>Enter your 4-digit PIN, {firstName(selectedName)}.</div>

        <input
          style={styles.pinInput}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="PIN"
          inputMode="numeric"
          maxLength={4}
          type="password"
        />

        <button
          disabled={authBusy}
          style={{ ...styles.btnGreen, ...(authBusy ? styles.btnDisabled : {}) }}
          onClick={() => onLogin(pin)}
        >
          {authBusy ? "Logging in..." : "Login"}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.pinBox}>
      <div style={styles.pinTitle}>First time? Create your 4-digit PIN.</div>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>(Tip: last 4 digits of your Student ID)</div>

      <input
        style={styles.pinInput}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        inputMode="numeric"
        maxLength={4}
        type="password"
      />
      <input
        style={styles.pinInput}
        value={pin2}
        onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        inputMode="numeric"
        maxLength={4}
        type="password"
      />

      <button
        disabled={authBusy}
        style={{ ...styles.btnOrange, ...(authBusy ? styles.btnDisabled : {}) }}
        onClick={() => onRegister(pin, pin2)}
      >
        {authBusy ? "Registering..." : "Register & Start"}
      </button>
    </div>
  );
}

// =========================
// Understanding Check UI (가로 정렬 + 이모지)
// =========================
function TrafficLightRow({ disabled, onTap }) {
  const items = [
    { key: "red", emoji: "😟", label: "Lost", bg: "#e74c3c" },
    { key: "yellow", emoji: "🤔", label: "So-so", bg: "#f1c40f" },
    { key: "green", emoji: "✅", label: "Got it", bg: "#2ecc71" },
  ];

  return (
    <div style={styles.trafficRow}>
      {items.map((it) => (
        <button
          key={it.key}
          disabled={disabled}
          onClick={() => onTap(it.key)}
          style={{ ...styles.trafficBtn, ...(disabled ? styles.btnDisabled : {}) }}
          title={it.label}
        >
          <div style={{ ...styles.trafficCircle, background: it.bg }}>
            <div style={styles.trafficEmoji}>{it.emoji}</div>
          </div>
          <div style={styles.trafficLabel}>{it.label}</div>
        </button>
      ))}
    </div>
  );
}

// =========================
// MAIN APP
// =========================
export default function App() {
  // Pre-login selections
  const [selectedCourse, setSelectedCourse] = useState("ADV 375-01");
  const [selectedDateKey, setSelectedDateKey] = useState(getPacificDateKeyNow());
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Admin mode + auth
  const [adminMode, setAdminMode] = useState(false);
  const [adminGatePin, setAdminGatePin] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [showAdminPin, setShowAdminPin] = useState(false);

  // Admin projection controls
  const [hideNames, setHideNames] = useState(true);
  const [showUnderstandingLog, setShowUnderstandingLog] = useState(false);

  // Firebase auth ready
  const [authReady, setAuthReady] = useState(false);

  // Student login
  const [studentName, setStudentName] = useState("");
  const [studentPinRegistered, setStudentPinRegistered] = useState(false);
  const [studentAuthed, setStudentAuthed] = useState(false);

  // Busy flags
  const [authBusy, setAuthBusy] = useState(false);

  // Data
  const [questions, setQuestions] = useState([]);
  const [ucSummary, setUcSummary] = useState([]); // 1 student -> current color doc
  const [ucEvents, setUcEvents] = useState([]); // history events (admin view)

  // Inputs
  const [questionText, setQuestionText] = useState("");

  // Admin reply UI
  const [replyTarget, setReplyTarget] = useState(null); // { id, actor }
  const [adminReplyText, setAdminReplyText] = useState("");

  // Student edit UI
  const [editTargetId, setEditTargetId] = useState(null);
  const [editText, setEditText] = useState("");

  // Class session window (Admin set)
  const [classSession, setClassSession] = useState(null); // {startMins,endMins}

  // time tick
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((x) => x + 1), 20 * 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => void nowTick, [nowTick]);

  // localStorage keys
  const studentAuthKey = useMemo(
    () => `auth:${APP_ID}:${selectedCourse}:student:${studentName}`,
    [selectedCourse, studentName]
  );
  const adminAuthKey = useMemo(() => `auth:${APP_ID}:${selectedCourse}:admin:${ADMIN_NAME}`, [
    selectedCourse,
  ]);

  // ============================
  // (4) 미래 날짜 제출 방지
  // ============================
  const todayPTKey = getPacificDateKeyNow();
  const isFutureDate = selectedDateKey > todayPTKey;

  // ============================================
  // 1) Auth Ready init
  // ============================================
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await waitForAuthReady();
        if (!mounted) return;
        setAuthReady(true);
      } catch (e) {
        console.error(e);
        alert("Firebase auth failed. Check .env values and Firebase project settings.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ============================================
  // 2) Restore auth flags
  // ============================================
  useEffect(() => {
    if (!studentName) {
      setStudentAuthed(false);
      return;
    }
    setStudentAuthed(localStorage.getItem(studentAuthKey) === "true");
  }, [studentAuthKey, studentName]);

  useEffect(() => {
    setAdminAuthed(localStorage.getItem(adminAuthKey) === "true");
  }, [adminAuthKey]);

  // ============================================
  // 3) Student PIN exists?
  // ============================================
  const checkStudentPinRegistered = useCallback(
    async (name) => {
      if (!authReady || !name) return false;
      const ref = doc(
        db,
        "artifacts",
        APP_ID,
        "public",
        "data",
        "studentPins",
        `student:${name}`
      );
      const snap = await getDoc(ref);
      return snap.exists();
    },
    [authReady]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return;

      if (!studentName) {
        setStudentPinRegistered(false);
        return;
      }

      try {
        const exists = await checkStudentPinRegistered(studentName);
        if (!cancelled) setStudentPinRegistered(exists);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, selectedCourse, studentName, checkStudentPinRegistered]);

  // ============================================
  // 4) Student PIN handlers
  // ============================================
  const studentLoginWithPin = useCallback(
    async (name, pin) => {
      if (!authReady) return;
      if (!name) return alert("Select your name first.");
      if (!pin || pin.length !== 4) return alert("PIN must be 4 digits.");

      setAuthBusy(true);
      const ref = doc(
        db,
        "artifacts",
        APP_ID,
        "public",
        "data",
        "studentPins",
        `student:${name}`
      );

      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) return alert("No PIN found. Please register first.");

        const savedPin = snap.data()?.pin;
        if (savedPin === pin) {
          setStudentAuthed(true);
          localStorage.setItem(studentAuthKey, "true");
        } else {
          alert("Incorrect PIN.");
        }
      } catch (e) {
        console.error(e);
        alert("Login error. (Firestore rules / config?)");
      } finally {
        setAuthBusy(false);
      }
    },
    [authReady, studentAuthKey]
  );

  const studentRegisterWithPin = useCallback(
    async (name, pin, pin2) => {
      if (!authReady) return;
      if (!name) return alert("Select your name first.");
      if (!pin || pin.length !== 4) return alert("PIN must be 4 digits.");
      if (pin !== pin2) return alert("PINs do not match.");

      setAuthBusy(true);
      const ref = doc(
        db,
        "artifacts",
        APP_ID,
        "public",
        "data",
        "studentPins",
        `student:${name}`
      );

      try {
        await setDoc(ref, { pin, createdAt: serverTimestamp() }, { merge: true });

        setStudentPinRegistered(true);
        setStudentAuthed(true);
        localStorage.setItem(studentAuthKey, "true");
      } catch (e) {
        console.error(e);
        alert("Register failed. (Likely Firestore rules / config.)");
      } finally {
        setAuthBusy(false);
      }
    },
    [authReady, studentAuthKey]
  );

  const logoutStudent = useCallback(() => {
    if (!studentName) return;
    localStorage.removeItem(studentAuthKey);
    setStudentAuthed(false);
  }, [studentAuthKey, studentName]);

  // ============================================
  // 5) Admin gate (PIN 마스킹)
  // ============================================
  const adminLogin = useCallback(() => {
    if (!ADMIN_PIN) return alert("Missing REACT_APP_ADMIN_PIN in .env");
    if (adminGatePin !== ADMIN_PIN) return alert("Wrong admin PIN");

    setAdminAuthed(true);
    localStorage.setItem(adminAuthKey, "true");
    setAdminGatePin("");
  }, [adminGatePin, adminAuthKey]);

  const logoutAdmin = useCallback(() => {
    localStorage.removeItem(adminAuthKey);
    setAdminAuthed(false);
  }, [adminAuthKey]);

  // ============================================
  // 6) Visibility rules
  // ============================================
  const logViewerAuthed = studentAuthed || adminAuthed;

  // 제출 가능 조건 (4번: 미래 날짜는 제출 불가)
  const studentCanSubmit = studentAuthed && !isFutureDate;
  const adminCanSubmit = adminAuthed && !isFutureDate;

  // ============================================
  // 7) Class session window doc (Admin만 구독)
  // ============================================
  useEffect(() => {
    if (!authReady) return;
    if (!adminAuthed) {
      setClassSession(null);
      return;
    }

    const sessionId = `${APP_ID}_${selectedCourse}_${selectedDateKey}`;
    const ref = doc(db, "lite_class_sessions", sessionId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setClassSession(null);
          return;
        }
        setClassSession(snap.data());
      },
      (err) => console.error(err)
    );

    return () => unsub();
  }, [authReady, adminAuthed, selectedCourse, selectedDateKey]);

  const setSessionStartNow = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    const sessionId = `${APP_ID}_${selectedCourse}_${selectedDateKey}`;
    const ref = doc(db, "lite_class_sessions", sessionId);
    const now = getPacificParts(new Date());
    await setDoc(
      ref,
      { appId: APP_ID, course: selectedCourse, dateKey: selectedDateKey, startMins: now.mins, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }, [adminAuthed, selectedCourse, selectedDateKey]);

  const setSessionEndNow = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    const sessionId = `${APP_ID}_${selectedCourse}_${selectedDateKey}`;
    const ref = doc(db, "lite_class_sessions", sessionId);
    const now = getPacificParts(new Date());
    await setDoc(
      ref,
      { appId: APP_ID, course: selectedCourse, dateKey: selectedDateKey, endMins: now.mins, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }, [adminAuthed, selectedCourse, selectedDateKey]);

  const clearSessionWindow = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    const sessionId = `${APP_ID}_${selectedCourse}_${selectedDateKey}`;
    const ref = doc(db, "lite_class_sessions", sessionId);
    await setDoc(
      ref,
      { appId: APP_ID, course: selectedCourse, dateKey: selectedDateKey, startMins: null, endMins: null, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }, [adminAuthed, selectedCourse, selectedDateKey]);

  // ============================================
  // 8) Firestore subscribe (로그인한 사람만!)
  // ============================================
  useEffect(() => {
    if (!authReady) return;
    if (!logViewerAuthed) {
      setQuestions([]);
      setUcSummary([]);
      setUcEvents([]);
      return;
    }

    const qQuestions = query(
      collection(db, "lite_questions"),
      where("appId", "==", APP_ID),
      where("course", "==", selectedCourse),
      where("dateKey", "==", selectedDateKey)
    );

    const qUcSummary = query(
      collection(db, "lite_understanding"),
      where("appId", "==", APP_ID),
      where("course", "==", selectedCourse),
      where("dateKey", "==", selectedDateKey)
    );

    const unsub1 = onSnapshot(
      qQuestions,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        setQuestions(arr);
      },
      (err) => console.error(err)
    );

    const unsub2 = onSnapshot(
      qUcSummary,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.updatedAt?.seconds ?? 0) - (b.updatedAt?.seconds ?? 0));
        setUcSummary(arr);
      },
      (err) => console.error(err)
    );

    // ✅ (1) 히스토리 이벤트는 Admin이 "Show Tap Log"를 켰을 때만 구독
    let unsub3 = null;
    if (adminAuthed && showUnderstandingLog) {
      const qEvents = query(
        collection(db, "lite_understanding_events"),
        where("appId", "==", APP_ID),
        where("course", "==", selectedCourse),
        where("dateKey", "==", selectedDateKey)
      );
      unsub3 = onSnapshot(
        qEvents,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          arr.sort((a, b) => (a.at?.seconds ?? 0) - (b.at?.seconds ?? 0));
          setUcEvents(arr);
        },
        (err) => console.error(err)
      );
    } else {
      setUcEvents([]);
    }

    return () => {
      unsub1();
      unsub2();
      if (unsub3) unsub3();
    };
  }, [authReady, logViewerAuthed, selectedCourse, selectedDateKey, adminAuthed, showUnderstandingLog]);

  // ============================================
  // 9) Anonymous mapping (Admin용)
  // ============================================
  const anonNameMap = useMemo(() => {
    const names = new Set();
    for (const q of questions) if (q.role === "student" && q.actor) names.add(q.actor);
    for (const t of ucSummary) if (t.role === "student" && t.actor) names.add(t.actor);

    const sorted = Array.from(names).sort((a, b) => String(a).localeCompare(String(b)));
    const map = {};
    sorted.forEach((n, i) => (map[n] = `Student ${i + 1}`));
    return map;
  }, [questions, ucSummary]);

  const displayActor = useCallback(
    (actor, role) => {
      if (!adminAuthed) {
        if (role === "admin") return "Professor’s reply";
        if (role === "student") {
          if (actor && actor === studentName) return "You";
          return "Anonymous";
        }
        return "Anonymous";
      }
      if (role === "admin") return "Professor";
      if (!actor) return "Student";
      if (hideNames) return anonNameMap[actor] || "Student";
      return actor;
    },
    [adminAuthed, hideNames, anonNameMap, studentName]
  );

  // ============================================
  // (1) Understanding: Summary + Event history
  // ============================================
  const submitUnderstanding = useCallback(
    async (color) => {
      if (!logViewerAuthed) return alert("Please login first.");
      if (!authReady) return;
      if (isFutureDate) return alert("Future class dates: submissions are disabled.");

      const actor = adminCanSubmit ? ADMIN_NAME : studentName;
      const role = adminCanSubmit ? "admin" : "student";
      if (!actor) return alert("Select your name first.");

      // ✅ summary doc: 1인 1표(현재 상태)
      const tapId = `tap_${APP_ID}_${selectedCourse}_${selectedDateKey}_${actor}`;
      const summaryRef = doc(db, "lite_understanding", tapId);

      try {
        // 이전 색 가져와서 이벤트에 fromColor 기록
        let prevColor = null;
        const prevSnap = await getDoc(summaryRef);
        if (prevSnap.exists()) prevColor = prevSnap.data()?.color ?? null;

        await setDoc(
          summaryRef,
          {
            appId: APP_ID,
            course: selectedCourse,
            dateKey: selectedDateKey,
            color,
            actor,
            role,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // ✅ history event: 누를 때마다 addDoc (변경 히스토리)
        await addDoc(collection(db, "lite_understanding_events"), {
          appId: APP_ID,
          course: selectedCourse,
          dateKey: selectedDateKey,
          actor,
          role,
          fromColor: prevColor,
          toColor: color,
          at: serverTimestamp(),
        });
      } catch (e) {
        console.error(e);
        alert("Failed to submit understanding check. (Rules/config?)");
      }
    },
    [
      authReady,
      logViewerAuthed,
      adminCanSubmit,
      studentName,
      selectedCourse,
      selectedDateKey,
      isFutureDate,
    ]
  );

  // ============================================
  // Submit Question / Admin Reply
  // ============================================
  const submitQuestion = useCallback(async () => {
    if (!logViewerAuthed) return alert("Please login first.");
    if (!questionText.trim()) return;
    if (!authReady) return;
    if (isFutureDate) return alert("Future class dates: submissions are disabled.");

    const can = studentCanSubmit || adminCanSubmit;
    if (!can) return;

    const actor = adminCanSubmit ? ADMIN_NAME : studentName;
    const role = adminCanSubmit ? "admin" : "student";

    try {
      await addDoc(collection(db, "lite_questions"), {
        appId: APP_ID,
        course: selectedCourse,
        dateKey: selectedDateKey,
        text: clampText(questionText.trim()),
        actor,
        role,
        replyToId: null,
        createdAt: serverTimestamp(),
      });
      setQuestionText("");
    } catch (e) {
      console.error(e);
      alert("Failed to post. (Rules/config?)");
    }
  }, [
    authReady,
    logViewerAuthed,
    questionText,
    studentCanSubmit,
    adminCanSubmit,
    studentName,
    selectedCourse,
    selectedDateKey,
    isFutureDate,
  ]);

  const submitAdminReply = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    if (!replyTarget?.id) return;
    if (!adminReplyText.trim()) return;
    if (!authReady) return;
    if (isFutureDate) return alert("Future class dates: submissions are disabled.");

    try {
      await addDoc(collection(db, "lite_questions"), {
        appId: APP_ID,
        course: selectedCourse,
        dateKey: selectedDateKey,
        text: clampText(adminReplyText.trim()),
        actor: ADMIN_NAME,
        role: "admin",
        replyToId: replyTarget.id,
        createdAt: serverTimestamp(),
      });
      setAdminReplyText("");
      setReplyTarget(null);
    } catch (e) {
      console.error(e);
      alert("Reply failed. (Firestore rules / config?)");
    }
  }, [authReady, adminAuthed, adminReplyText, replyTarget, selectedCourse, selectedDateKey, isFutureDate]);

  // ============================================
  // (2) 학생 글 수정/삭제
  // ============================================
  const beginEdit = useCallback((q) => {
    setEditTargetId(q.id);
    setEditText(q.text || "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditTargetId(null);
    setEditText("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editTargetId) return;
    if (!studentAuthed) return alert("Student login required.");
    const newText = clampText(editText.trim());
    if (!newText) return alert("Text cannot be empty.");

    try {
      await updateDoc(doc(db, "lite_questions", editTargetId), {
        text: newText,
        editedAt: serverTimestamp(),
      });
      cancelEdit();
    } catch (e) {
      console.error(e);
      alert("Edit failed. (Rules/config?)");
    }
  }, [editTargetId, editText, studentAuthed, cancelEdit]);

  const deleteMyPost = useCallback(async (q) => {
    if (!studentAuthed) return alert("Student login required.");
    const ok = window.confirm("Delete this post?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "lite_questions", q.id));
    } catch (e) {
      console.error(e);
      alert("Delete failed. (Rules/config?)");
    }
  }, [studentAuthed]);

  // ============================================
  // Counts + Missing list (summary 기준이라 안정적)
  // ============================================
  const ucCounts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const t of ucSummary) {
      if (t.color === "red") c.red++;
      if (t.color === "yellow") c.yellow++;
      if (t.color === "green") c.green++;
    }
    return c;
  }, [ucSummary]);

  const ucTotal = ucCounts.red + ucCounts.yellow + ucCounts.green;

  const tappedStudentSet = useMemo(() => {
    const s = new Set();
    for (const t of ucSummary) {
      if (t.role === "student" && t.actor) s.add(t.actor);
    }
    return s;
  }, [ucSummary]);

  const missingStudents = useMemo(() => {
    const roster = COURSE_STUDENTS[selectedCourse] || [];
    return roster.filter((n) => n && !tappedStudentSet.has(n));
  }, [selectedCourse, tappedStudentSet]);

  // ============================================
  // Threaded questions
  // ============================================
  const threads = useMemo(() => {
    const roots = [];
    const repliesByParent = {};
    for (const q of questions) {
      const parentId = q.replyToId || null;
      if (!parentId) roots.push(q);
      else {
        if (!repliesByParent[parentId]) repliesByParent[parentId] = [];
        repliesByParent[parentId].push(q);
      }
    }
    for (const k of Object.keys(repliesByParent)) {
      repliesByParent[k].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    }
    return { roots, repliesByParent };
  }, [questions]);

  // ============================================
  // (5) Out-of-class activity (Admin)
  // ============================================
  const sessionStart = classSession?.startMins ?? null;
  const sessionEnd = classSession?.endMins ?? null;
  const hasSessionWindow = sessionStart != null && sessionEnd != null && sessionEnd >= sessionStart;

  const isOutOfClass = useCallback(
    (tsLike) => {
      if (!hasSessionWindow) return false;
      const m = toPTMinutes(tsLike);
      if (m == null) return false;
      return m < sessionStart || m > sessionEnd;
    },
    [hasSessionWindow, sessionStart, sessionEnd]
  );

  const outOfClassPosts = useMemo(() => {
    if (!adminAuthed || !hasSessionWindow) return [];
    return questions
      .filter((q) => isOutOfClass(q.createdAt))
      .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  }, [adminAuthed, hasSessionWindow, questions, isOutOfClass]);

  const outOfClassUCEvents = useMemo(() => {
    if (!adminAuthed || !hasSessionWindow) return [];
    return ucEvents
      .filter((e) => isOutOfClass(e.at))
      .sort((a, b) => (a.at?.seconds ?? 0) - (b.at?.seconds ?? 0));
  }, [adminAuthed, hasSessionWindow, ucEvents, isOutOfClass]);

  // ============================================
  // UI Flow
  // ============================================
  const isLoggedIn = logViewerAuthed;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* (3) 색상/폰트 */}
        <div style={styles.titleOrange}>"Ahn"stoppable Learning:</div>
        <div style={styles.subtitleGreen}>Freely Ask, Freely Learn</div>

        {/* PRE-LOGIN */}
        {!isLoggedIn && (
          <>
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Course</div>
              <select
                style={styles.select}
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                disabled={!authReady}
              >
                {COURSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.card}>
              <div style={styles.sectionTitle}>View Logs for Date</div>
              <button
                style={styles.dateBtn}
                onClick={() => setCalendarOpen(true)}
                disabled={!authReady}
              >
                {selectedDateKey} ▼
              </button>
              {calendarOpen && (
                <Calendar2026
                  valueDateKey={selectedDateKey}
                  onPick={(dk) => {
                    setSelectedDateKey(dk);
                    setCalendarOpen(false);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}
              {isFutureDate && (
                <div style={{ marginTop: 10, color: "#fbbf24", fontWeight: 900 }}>
                  Future date selected. Submissions are disabled.
                </div>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.sectionTitle}>Student Login</div>

              {!authReady && (
                <div style={{ opacity: 0.85, marginTop: 10 }}>
                  Connecting to Firebase... (please wait)
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <div style={{ opacity: 0.85, marginBottom: 8 }}>Select your name</div>
                <select
                  style={styles.select}
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  disabled={!authReady}
                >
                  <option value="">-- Select --</option>
                  {(COURSE_STUDENTS[selectedCourse] || []).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <StudentPinAuth
                selectedName={studentName}
                pinRegistered={studentPinRegistered}
                authBusy={authBusy}
                isAuthed={studentAuthed}
                onLogin={(pin) => studentLoginWithPin(studentName, pin)}
                onRegister={(p1, p2) => studentRegisterWithPin(studentName, p1, p2)}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <button style={styles.tinyAdminBtn} onClick={() => setAdminMode((v) => !v)}>
                {adminMode ? "Hide Admin" : "Admin"}
              </button>
            </div>

            {adminMode && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>Administrator</div>

                {!adminAuthed ? (
                  <div style={styles.pinBox}>
                    <div style={styles.pinTitle}>Enter your 4-digit PIN, Administrator.</div>

                    <input
                      style={styles.pinInput}
                      value={adminGatePin}
                      onChange={(e) => setAdminGatePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="PIN"
                      inputMode="numeric"
                      maxLength={4}
                      type={showAdminPin ? "text" : "password"}
                    />

                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button style={styles.smallBtn} onClick={() => setShowAdminPin((v) => !v)}>
                        {showAdminPin ? "Hide" : "Show"}
                      </button>
                      <button style={styles.btnGreen} onClick={adminLogin}>
                        Login as Admin
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <div style={{ color: "#9ae6b4", fontWeight: 900, fontSize: 18 }}>
                      Admin logged in
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* MAIN (after login) */}
        {isLoggedIn && (
          <>
            <div style={styles.topMiniBar}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button style={styles.smallBtn} onClick={() => setCalendarOpen(true)}>
                  Date: {selectedDateKey} ▼
                </button>
                <select
                  style={{ ...styles.select, width: 180, padding: "10px 10px", fontSize: 14 }}
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                >
                  {COURSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {studentAuthed && (
                  <button style={styles.smallBtn} onClick={logoutStudent}>
                    Log out (Student)
                  </button>
                )}
                {adminAuthed && (
                  <button style={styles.smallBtn} onClick={logoutAdmin}>
                    Log out (Admin)
                  </button>
                )}

                <button style={styles.tinyAdminBtn} onClick={() => setAdminMode((v) => !v)}>
                  {adminMode ? "Hide Admin" : "Admin"}
                </button>
              </div>

              {calendarOpen && (
                <Calendar2026
                  valueDateKey={selectedDateKey}
                  onPick={(dk) => {
                    setSelectedDateKey(dk);
                    setCalendarOpen(false);
                  }}
                  onClose={() => setCalendarOpen(false)}
                />
              )}

              {isFutureDate && (
                <div style={{ marginTop: 10, color: "#fbbf24", fontWeight: 900 }}>
                  Future date selected. Submissions are disabled.
                </div>
              )}
            </div>

            {/* Understanding */}
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Understanding Check</div>

              <TrafficLightRow
                disabled={!authReady || (!studentCanSubmit && !adminCanSubmit)}
                onTap={submitUnderstanding}
              />

              <div style={styles.summaryRow}>
                <div style={styles.summaryBox}>😟 RED {ucCounts.red}</div>
                <div style={styles.summaryBox}>🤔 YELLOW {ucCounts.yellow}</div>
                <div style={styles.summaryBox}>✅ GREEN {ucCounts.green}</div>
                <div style={styles.summaryBox}>TOTAL {ucTotal}</div>
              </div>

              {/* Admin-only controls */}
              {adminAuthed && (
                <div style={{ marginTop: 16, textAlign: "left" }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Admin Controls</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button style={styles.smallBtn} onClick={() => setHideNames((v) => !v)}>
                      {hideNames ? "Show Student Names" : "Hide Student Names"}
                    </button>

                    <button
                      style={styles.smallBtn}
                      onClick={() => setShowUnderstandingLog((v) => !v)}
                    >
                      {showUnderstandingLog ? "Hide Tap History" : "Show Tap History"}
                    </button>
                  </div>

                  {/* (5) Session window */}
                  <div style={{ marginTop: 14, fontWeight: 900 }}>Class Session Window (PT)</div>
                  <div style={{ marginTop: 6, opacity: 0.9 }}>
                    Start: <b>{sessionStart != null ? minsToLabel(sessionStart) : "—"}</b> · End:{" "}
                    <b>{sessionEnd != null ? minsToLabel(sessionEnd) : "—"}</b>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <button style={styles.smallBtn} onClick={setSessionStartNow}>
                      Start Session Now
                    </button>
                    <button style={styles.smallBtn} onClick={setSessionEndNow}>
                      End Session Now
                    </button>
                    <button style={styles.smallBtn} onClick={clearSessionWindow}>
                      Clear Window
                    </button>
                  </div>

                  <div style={{ marginTop: 14, fontWeight: 900 }}>
                    Students who did NOT tap (for {selectedDateKey})
                  </div>
                  {missingStudents.length === 0 ? (
                    <div style={{ opacity: 0.85, marginTop: 6 }}>Everyone tapped ✅</div>
                  ) : (
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {missingStudents.map((n) => (
                        <div key={n} style={styles.logItem}>
                          {n}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* (1) Tap history + (5) Out-of-class */}
                  {showUnderstandingLog && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Tap History (changes)</div>

                      {ucEvents.length === 0 ? (
                        <div style={{ opacity: 0.8 }}>No history yet.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                          {ucEvents.map((e) => (
                            <div key={e.id} style={styles.logItem}>
                              <div style={{ fontWeight: 900 }}>
                                {displayActor(e.actor, e.role)} · {String(e.fromColor || "—")} →{" "}
                                {String(e.toColor || "—")}
                              </div>
                              <div style={{ opacity: 0.85, marginTop: 4 }}>
                                {formatTsPT(e.at)} (PT)
                                {hasSessionWindow && isOutOfClass(e.at) ? " · Out-of-class" : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {hasSessionWindow && (outOfClassUCEvents.length > 0 || outOfClassPosts.length > 0) && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontWeight: 900, marginBottom: 8 }}>
                            Out-of-class Activity (outside session window)
                          </div>

                          {outOfClassUCEvents.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontWeight: 900, marginBottom: 6 }}>Understanding taps</div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {outOfClassUCEvents.map((e) => (
                                  <div key={e.id} style={styles.replyItem}>
                                    <div style={{ fontWeight: 900 }}>
                                      {displayActor(e.actor, e.role)} · {String(e.fromColor || "—")} →{" "}
                                      {String(e.toColor || "—")}
                                    </div>
                                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                                      {formatTsPT(e.at)} (PT)
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {outOfClassPosts.length > 0 && (
                            <div>
                              <div style={{ fontWeight: 900, marginBottom: 6 }}>Posts</div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {outOfClassPosts.map((q) => (
                                  <div key={q.id} style={styles.replyItem}>
                                    <div style={{ fontWeight: 900 }}>
                                      {displayActor(q.actor, q.role)}
                                    </div>
                                    <div style={{ opacity: 0.85, marginTop: 4 }}>
                                      {formatTsPT(q.createdAt)} (PT)
                                    </div>
                                    <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{q.text}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Questions */}
            <div style={styles.card}>
              <div style={styles.sectionTitle}>Questions</div>

              <textarea
                style={styles.textarea}
                placeholder={
                  !authReady
                    ? "Connecting to Firebase..."
                    : isFutureDate
                    ? "Future class date: posting disabled."
                    : studentCanSubmit || adminCanSubmit
                    ? "Post a question/comment..."
                    : "Login required to post."
                }
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                disabled={!authReady || (!studentCanSubmit && !adminCanSubmit)}
              />

              <button
                style={{
                  ...styles.btnOrange,
                  marginTop: 10,
                  ...((!authReady || (!studentCanSubmit && !adminCanSubmit)) ? styles.btnDisabled : {}),
                }}
                disabled={!authReady || (!studentCanSubmit && !adminCanSubmit)}
                onClick={submitQuestion}
              >
                Add
              </button>

              <div style={{ marginTop: 18, textAlign: "left" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Logs</div>

                {threads.roots.length === 0 && (
                  <div style={{ opacity: 0.85 }}>
                    No posts for {selectedCourse} on {selectedDateKey}.
                  </div>
                )}

                {threads.roots.map((q) => {
                  const replies = threads.repliesByParent[q.id] || [];
                  const isStudentPost = q.role === "student";
                  const isMine = studentAuthed && q.role === "student" && q.actor === studentName;

                  return (
                    <div key={q.id} style={styles.logThread}>
                      <div style={styles.logItem}>
                        <div style={{ fontWeight: 900 }}>
                          {displayActor(q.actor, q.role)}
                          {q.editedAt ? <span style={{ opacity: 0.7, marginLeft: 8 }}>(edited)</span> : null}
                        </div>

                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          {formatTsPT(q.createdAt)} (PT)
                        </div>

                        {/* (2) Edit mode */}
                        {editTargetId === q.id ? (
                          <>
                            <textarea
                              style={{ ...styles.textarea, marginTop: 10 }}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                              <button style={styles.btnGreen} onClick={saveEdit}>
                                Save
                              </button>
                              <button style={styles.smallBtn2} onClick={cancelEdit}>
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{q.text}</div>
                        )}

                        {/* Student edit/delete buttons */}
                        {isMine && editTargetId !== q.id && (
                          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button style={styles.smallBtn} onClick={() => beginEdit(q)}>
                              Edit
                            </button>
                            <button style={styles.smallBtn} onClick={() => deleteMyPost(q)}>
                              Delete
                            </button>
                          </div>
                        )}

                        {/* Admin reply */}
                        {adminAuthed && isStudentPost && (
                          <div style={{ marginTop: 10 }}>
                            <button
                              style={styles.smallBtn}
                              onClick={() => {
                                setReplyTarget({ id: q.id, actor: q.actor || "" });
                                setAdminReplyText("");
                              }}
                            >
                              Reply
                            </button>
                          </div>
                        )}
                      </div>

                      {replies.length > 0 && (
                        <div style={styles.replyWrap}>
                          {replies.map((r) => (
                            <div key={r.id} style={styles.replyItem}>
                              <div style={{ fontWeight: 900 }}>{displayActor(r.actor, r.role)}</div>
                              <div style={{ opacity: 0.85, marginTop: 4 }}>
                                {formatTsPT(r.createdAt)} (PT)
                              </div>
                              <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{r.text}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Admin reply composer */}
              {adminAuthed && replyTarget?.id && (
                <div style={{ marginTop: 16, textAlign: "left" }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Replying to:{" "}
                    <span style={{ opacity: 0.9 }}>
                      {hideNames ? "Student" : replyTarget.actor || "Student"}
                    </span>
                  </div>

                  <textarea
                    style={styles.textarea}
                    placeholder="Write your reply..."
                    value={adminReplyText}
                    onChange={(e) => setAdminReplyText(e.target.value)}
                    disabled={!adminCanSubmit}
                  />

                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                    <button style={{ ...styles.btnGreen, ...(adminCanSubmit ? {} : styles.btnDisabled) }} onClick={submitAdminReply} disabled={!adminCanSubmit}>
                      Post Reply
                    </button>
                    <button
                      style={styles.smallBtn2}
                      onClick={() => {
                        setReplyTarget(null);
                        setAdminReplyText("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Admin panel toggle */}
            {adminMode && (
              <div style={styles.card}>
                <div style={styles.sectionTitle}>Administrator</div>
                {!adminAuthed ? (
                  <div style={styles.pinBox}>
                    <div style={styles.pinTitle}>Enter your 4-digit PIN, Administrator.</div>
                    <input
                      style={styles.pinInput}
                      value={adminGatePin}
                      onChange={(e) => setAdminGatePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="PIN"
                      inputMode="numeric"
                      maxLength={4}
                      type={showAdminPin ? "text" : "password"}
                    />
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button style={styles.smallBtn} onClick={() => setShowAdminPin((v) => !v)}>
                        {showAdminPin ? "Hide" : "Show"}
                      </button>
                      <button style={styles.btnGreen} onClick={adminLogin}>
                        Login as Admin
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <div style={{ color: "#9ae6b4", fontWeight: 900, fontSize: 18 }}>
                      Admin logged in
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    display: "flex",
    justifyContent: "center",
    padding: "24px 12px",
    color: "#e5e7eb",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
  },
  container: { width: "min(880px, 100%)" },

  // (3) Title colors/sizes
  titleOrange: { fontSize: 36, fontWeight: 900, marginTop: 10, color: "#ff7a18" },
  subtitleGreen: { marginTop: 10, marginBottom: 18, fontSize: 26, fontWeight: 900, color: "#22c55e" },

  topMiniBar: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  card: {
    background: "#0f1b2e",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 18,
    marginTop: 14,
    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
  },
  sectionTitle: { fontSize: 20, fontWeight: 900, marginBottom: 10 },
  select: {
    width: "min(520px, 100%)",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#172841",
    color: "#e5e7eb",
    outline: "none",
    fontSize: 16,
    textAlignLast: "center",
  },
  dateBtn: {
    width: "min(520px, 100%)",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#172841",
    color: "#e5e7eb",
    outline: "none",
    fontSize: 16,
    cursor: "pointer",
    fontWeight: 800,
  },
  pinBox: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  pinTitle: { fontWeight: 900, fontSize: 18, marginBottom: 10 },
  pinInput: {
    width: "min(420px, 100%)",
    padding: "14px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b1220",
    color: "#e5e7eb",
    outline: "none",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  textarea: {
    width: "min(720px, 100%)",
    minHeight: 90,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b1220",
    color: "#e5e7eb",
    outline: "none",
    fontSize: 16,
    display: "block",
    margin: "0 auto",
  },
  btnOrange: {
    width: "min(520px, 100%)",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#ff7a18",
    color: "#fff",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
    display: "block",
    margin: "0 auto",
  },
  btnGreen: {
    width: "min(520px, 100%)",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "#16a34a",
    color: "#fff",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
    display: "block",
    margin: "0 auto",
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },
  smallBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#172841",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 900,
  },
  smallBtn2: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#172841",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 900,
    display: "inline-block",
  },

  trafficRow: {
    display: "flex",
    justifyContent: "center",
    gap: 14,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 8,
  },
  trafficBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
    display: "grid",
    justifyItems: "center",
    gap: 8,
    minWidth: 110,
  },
  trafficCircle: {
    width: 64,
    height: 64,
    borderRadius: "999px",
    boxShadow: "inset 0 0 0 5px rgba(255,255,255,0.15), 0 8px 20px rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
  },
  trafficEmoji: { fontSize: 26, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" },
  trafficLabel: { fontWeight: 900, opacity: 0.95 },

  logThread: { marginBottom: 10 },
  logItem: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  replyWrap: {
    marginTop: 8,
    marginLeft: 14,
    paddingLeft: 12,
    borderLeft: "3px solid rgba(255,255,255,0.10)",
    display: "grid",
    gap: 8,
  },
  replyItem: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(22,163,74,0.08)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  summaryRow: {
    marginTop: 14,
    display: "flex",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  summaryBox: {
    padding: "8px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontWeight: 900,
    minWidth: 150,
  },

  calendarOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 14,
    zIndex: 9999,
  },
  calendarPanel: {
    width: "min(1200px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    background: "#0f1b2e",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    padding: 14,
  },
  calendarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  calendarGrid12: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  monthCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    padding: 10,
  },
  monthTitle: { fontWeight: 900, marginBottom: 8, fontSize: 16 },
  weekRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
    marginBottom: 6,
  },
  weekCell: { fontSize: 12, opacity: 0.7, fontWeight: 900 },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
  },
  dayEmpty: { height: 32 },
  dayBtn: {
    height: 32,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#172841",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 900,
  },
  dayBtnSelected: {
    background: "#ff7a18",
    border: "1px solid rgba(255,255,255,0.25)",
  },

  tinyAdminBtn: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.03)",
    color: "#e5e7eb",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },
};
