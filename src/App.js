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
} from "firebase/firestore";
import { db, waitForAuthReady } from "./firebase";

/**
 * ✅ UPDATED REQUESTS APPLIED
 * 1) Admin reply 실제 저장/표시되도록 수정 (reply doc도 같은 query로 잡히게 정리)
 * 2) 로그인한 학생/관리자만 질문 + UC 기록을 "볼 수 있게" UI 차단 (로그인 전엔 구독도 안 함)
 * 3) 수업시간 밖이어도 특정 날짜로 들어가면 학생도 로그 열람 가능:
 *    - 본인 글/탭: 본인 이름 표시
 *    - 다른 학생: 익명(Student 1, Student 2…)
 *    - 교수 글: "Professor’s reply"
 * 4) 수업시간 외에도 로그인 후 제출 가능(이미 허용) + Admin은 시간/이름 모두 확인 가능(이미 유지)
 * 5) Admin PIN 입력 시 화면에 숫자 노출 방지(type=password)
 */

// =========================
// ENV / CONFIG
// =========================
const APP_ID = process.env.REACT_APP_APP_ID || "ahnstoppable-lite";
const ADMIN_PIN = process.env.REACT_APP_ADMIN_PIN || "";
const ADMIN_NAME = "Administrator";
const APP_VERSION = "2026-02-10-secureLogs-replyFix-v2";

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
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

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

function formatTsPT(tsLike) {
  if (!tsLike) return "";
  const ms =
    typeof tsLike.toMillis === "function"
      ? tsLike.toMillis()
      : typeof tsLike.seconds === "number"
      ? tsLike.seconds * 1000
      : null;

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

function clampText(s, max = 1200) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) : t;
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
function StudentPinAuth({
  selectedName,
  pinRegistered,
  authBusy,
  onLogin,
  onRegister,
  isAuthed,
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  useEffect(() => {
    setPin("");
    setPin2("");
  }, [selectedName, pinRegistered, isAuthed]);

  if (isAuthed) return null;

  if (!selectedName) {
    return <div style={{ opacity: 0.8, marginTop: 12 }}>Select a name first.</div>;
  }

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
          autoComplete="off"
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
        autoComplete="off"
      />
      <input
        style={styles.pinInput}
        value={pin2}
        onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        inputMode="numeric"
        maxLength={4}
        type="password"
        autoComplete="off"
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
// Understanding Check UI
// =========================
function TrafficLight({ disabled, onTap }) {
  return (
    <div style={styles.trafficShell}>
      <button
        disabled={disabled}
        onClick={() => onTap("red")}
        style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}
        title="Red"
      >
        <div style={{ ...styles.lightCircle, background: "#e74c3c" }} />
      </button>

      <button
        disabled={disabled}
        onClick={() => onTap("yellow")}
        style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}
        title="Yellow"
      >
        <div style={{ ...styles.lightCircle, background: "#f1c40f" }} />
      </button>

      <button
        disabled={disabled}
        onClick={() => onTap("green")}
        style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}
        title="Green"
      >
        <div style={{ ...styles.lightCircle, background: "#2ecc71" }} />
      </button>
    </div>
  );
}

// =========================
// MAIN APP
// =========================
export default function App() {
  // UI state
  const [selectedCourse, setSelectedCourse] = useState("ADV 375-01");
  const [selectedDateKey, setSelectedDateKey] = useState(getPacificDateKeyNow());
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Admin mode + auth
  const [adminMode, setAdminMode] = useState(false);
  const [adminGatePin, setAdminGatePin] = useState("");
  const [adminAuthed, setAdminAuthed] = useState(false);

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
  const [ucTaps, setUcTaps] = useState([]);

  // Inputs
  const [questionText, setQuestionText] = useState("");

  // Admin reply UI
  const [replyTarget, setReplyTarget] = useState(null); // { id, actor }
  const [adminReplyText, setAdminReplyText] = useState("");

  // time tick
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((x) => x + 1), 20 * 1000);
    return () => clearInterval(id);
  }, []);
  const [ptNow, setPtNow] = useState(() => getPacificParts(new Date()));
  useEffect(() => {
    setPtNow(getPacificParts(new Date()));
  }, [nowTick]);

  // localStorage keys
  const studentAuthKey = useMemo(
    () => `auth:${APP_ID}:${selectedCourse}:student:${studentName}`,
    [selectedCourse, studentName]
  );
  const adminAuthKey = useMemo(
    () => `auth:${APP_ID}:${selectedCourse}:admin:${ADMIN_NAME}`,
    [selectedCourse]
  );

  // ✅ viewer gate (요청 #2: 로그인한 학생+admin만 기록 열람)
  const logViewerAuthed = studentAuthed || adminAuthed;

  // ✅ students can submit ANYTIME (요청 #4)
  const studentCanSubmit = studentAuthed;
  const adminCanSubmit = adminAuthed;

  // =========================
  // Firebase init (anonymous auth 준비)
  // =========================
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await waitForAuthReady();
        if (!mounted) return;
        setAuthReady(true);
      } catch (e) {
        console.error(e);
        alert("Firebase auth failed. Check firebase config (.env) and authorized domains.");
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // -------------------------
  // Load auth flags from localStorage
  // -------------------------
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

  // -------------------------
  // Check if student PIN exists
  // -------------------------
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

  // -------------------------
  // Student PIN handlers
  // -------------------------
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

  // -------------------------
  // Admin gate
  // -------------------------
  const adminLogin = useCallback(() => {
    if (!ADMIN_PIN) {
      alert("Missing REACT_APP_ADMIN_PIN in .env");
      return;
    }
    if (adminGatePin !== ADMIN_PIN) {
      alert("Wrong admin PIN");
      return;
    }
    setAdminAuthed(true);
    localStorage.setItem(adminAuthKey, "true");
    setAdminGatePin("");
  }, [adminGatePin, adminAuthKey]);

  const logoutAdmin = useCallback(() => {
    localStorage.removeItem(adminAuthKey);
    setAdminAuthed(false);
  }, [adminAuthKey]);

  // -------------------------
  // ✅ Firestore: subscribe logs
  // 요청 #2: 로그인한 사용자만 "볼 수 있게" + (중요) 로그인 전에는 구독 자체를 하지 않음
  // -------------------------
  useEffect(() => {
    if (!authReady) return;
    if (!logViewerAuthed) {
      // 로그인 풀리면 데이터도 화면에서 사라지게
      setQuestions([]);
      setUcTaps([]);
      return;
    }

    const qQuestions = query(
      collection(db, "lite_questions"),
      where("appId", "==", APP_ID),
      where("course", "==", selectedCourse),
      where("dateKey", "==", selectedDateKey)
    );

    const qUc = query(
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
      qUc,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arr.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        setUcTaps(arr);
      },
      (err) => console.error(err)
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [authReady, logViewerAuthed, selectedCourse, selectedDateKey]);

  // -------------------------
  // Anonymous mapping
  // - Admin: hideNames 옵션으로 익명 처리
  // - Student view: 본인만 실명 / 타인은 익명 Student 1,2...
  // -------------------------
  const studentAnonMap = useMemo(() => {
    const names = new Set();
    for (const q of questions) if (q.role === "student" && q.actor) names.add(q.actor);
    for (const t of ucTaps) if (t.role === "student" && t.actor) names.add(t.actor);

    // 본인 제외하고 익명 번호 부여
    const sorted = Array.from(names)
      .filter((n) => n && n !== studentName)
      .sort((a, b) => String(a).localeCompare(String(b)));

    const map = {};
    sorted.forEach((n, i) => {
      map[n] = `Student ${i + 1}`;
    });
    return map;
  }, [questions, ucTaps, studentName]);

  const adminAnonMap = useMemo(() => {
    const names = new Set();
    for (const q of questions) if (q.role === "student" && q.actor) names.add(q.actor);
    for (const t of ucTaps) if (t.role === "student" && t.actor) names.add(t.actor);

    const sorted = Array.from(names).sort((a, b) => String(a).localeCompare(String(b)));
    const map = {};
    sorted.forEach((n, i) => {
      map[n] = `Student ${i + 1}`;
    });
    return map;
  }, [questions, ucTaps]);

  const displayActor = useCallback(
    (actor, role) => {
      if (role === "admin") {
        // 학생 화면에서는 교수 답변 라벨로 보이게 (요청 #3)
        return adminAuthed ? "Admin" : "Professor’s reply";
      }

      // student role
      if (!actor) return "Student";

      // Admin 화면
      if (adminAuthed) {
        if (hideNames) return adminAnonMap[actor] || "Student";
        return actor;
      }

      // Student 화면
      if (studentAuthed && actor === studentName) return actor; // 본인만 실명
      return studentAnonMap[actor] || "Student";
    },
    [adminAuthed, hideNames, adminAnonMap, studentAuthed, studentName, studentAnonMap]
  );

  // -------------------------
  // Submit actions (요청 #4 이미 허용 유지)
  // -------------------------
  const submitUnderstanding = useCallback(
    async (color) => {
      if (!logViewerAuthed) return alert("Please login first.");
      if (!studentCanSubmit && !adminCanSubmit) return;
      if (!authReady) return;

      const actor = adminCanSubmit ? ADMIN_NAME : studentName;
      const role = adminCanSubmit ? "admin" : "student";

      try {
        await addDoc(collection(db, "lite_understanding"), {
          appId: APP_ID,
          course: selectedCourse,
          dateKey: selectedDateKey,
          color,
          actor,
          role,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.error(e);
        alert(`Failed to submit. ${e?.code || ""}`);
      }
    },
    [
      authReady,
      logViewerAuthed,
      studentCanSubmit,
      adminCanSubmit,
      studentName,
      selectedCourse,
      selectedDateKey,
    ]
  );

  const submitQuestion = useCallback(async () => {
    if (!logViewerAuthed) return alert("Please login first.");
    if (!questionText.trim()) return;
    if (!authReady) return;

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
      alert(`Failed to post. ${e?.code || ""}`);
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
  ]);

  // ✅ (요청 #1) Admin reply 저장이 안 되던 케이스를 방지:
  // - adminAuthed + authReady + replyTarget.id 체크
  // - addDoc 성공하면 UI 초기화
  const submitAdminReply = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    if (!replyTarget?.id) return;
    if (!adminReplyText.trim()) return;
    if (!authReady) return;

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

      // ✅ 성공 시 UI 정리
      setAdminReplyText("");
      setReplyTarget(null);
    } catch (e) {
      console.error(e);
      alert(`Failed to reply. ${e?.code || ""}`);
    }
  }, [authReady, adminAuthed, adminReplyText, replyTarget, selectedCourse, selectedDateKey]);

  // -------------------------
  // Understanding counts + rate
  // -------------------------
  const ucCounts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const t of ucTaps) {
      if (t.color === "red") c.red++;
      if (t.color === "yellow") c.yellow++;
      if (t.color === "green") c.green++;
    }
    return c;
  }, [ucTaps]);

  const ucTotal = ucCounts.red + ucCounts.yellow + ucCounts.green;
  const ucRate = useMemo(() => {
    if (!ucTotal) return { red: 0, yellow: 0, green: 0 };
    return {
      red: Math.round((ucCounts.red / ucTotal) * 100),
      yellow: Math.round((ucCounts.yellow / ucTotal) * 100),
      green: Math.round((ucCounts.green / ucTotal) * 100),
    };
  }, [ucCounts, ucTotal]);

  // Admin per-student breakdown
  const perStudentCounts = useMemo(() => {
    const map = {};
    for (const t of ucTaps) {
      const k = t.actor || "Unknown";
      if (!map[k]) map[k] = { red: 0, yellow: 0, green: 0 };
      if (t.color === "red") map[k].red++;
      if (t.color === "yellow") map[k].yellow++;
      if (t.color === "green") map[k].green++;
    }
    return map;
  }, [ucTaps]);

  // -------------------------
  // Threaded display for questions
  // -------------------------
  const threads = useMemo(() => {
    const roots = [];
    const repliesByParent = {};

    for (const q of questions) {
      const parentId = q.replyToId || null;
      if (!parentId) {
        roots.push(q);
      } else {
        if (!repliesByParent[parentId]) repliesByParent[parentId] = [];
        repliesByParent[parentId].push(q);
      }
    }

    for (const k of Object.keys(repliesByParent)) {
      repliesByParent[k].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
    }

    return { roots, repliesByParent };
  }, [questions]);

  // -------------------------
  // ✅ 로그인 전에는 "기록 관련 섹션 자체"를 숨김 (요청 #2)
  // -------------------------
  const gatedMessage = (
    <div style={{ opacity: 0.85, marginTop: 10 }}>
      Login required to view logs.
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.title}>"Ahn"stoppable Learning:</div>
        <div style={styles.subtitle}>
          Freely Ask, Freely Learn <span style={{ opacity: 0.9 }}>(Lite)</span>
        </div>

        <div style={{ opacity: 0.6, fontSize: 12, marginBottom: 6 }}>
          {APP_VERSION} · PT now: {ptNow.dateKey}{" "}
          {String(ptNow.hour).padStart(2, "0")}:{String(ptNow.minute).padStart(2, "0")} ·{" "}
          Auth: {authReady ? "ready" : "starting..."}
        </div>

        {/* Course */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Course</div>
          <select
            style={styles.select}
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            {COURSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* View Logs for Date */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>View Logs for Date</div>

          <button style={styles.dateBtn} onClick={() => setCalendarOpen(true)}>
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

          {/* ✅ 로그인 전 안내 */}
          {!logViewerAuthed && gatedMessage}
        </div>

        {/* Student Login */}
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

          {studentAuthed && studentName && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <div style={{ color: "#9ae6b4", fontWeight: 900, fontSize: 20 }}>
                Logged in as {studentName}
              </div>
              <button style={styles.smallBtn2} onClick={logoutStudent}>
                Log out
              </button>
            </div>
          )}
        </div>

        {/* Understanding Check */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Understanding Check</div>

          {!logViewerAuthed ? (
            gatedMessage
          ) : (
            <>
              <div style={{ opacity: 0.85, marginBottom: 12 }}>
                Tap a color (you can tap anytime after login).
              </div>

              <TrafficLight
                disabled={!authReady || (!studentCanSubmit && !adminCanSubmit)}
                onTap={submitUnderstanding}
              />

              <div style={styles.summaryRow}>
                <div style={styles.summaryBox}>
                  RED {ucCounts.red} <span style={{ opacity: 0.75 }}>({ucRate.red}%)</span>
                </div>
                <div style={styles.summaryBox}>
                  YELLOW {ucCounts.yellow} <span style={{ opacity: 0.75 }}>({ucRate.yellow}%)</span>
                </div>
                <div style={styles.summaryBox}>
                  GREEN {ucCounts.green} <span style={{ opacity: 0.75 }}>({ucRate.green}%)</span>
                </div>
              </div>

              {/* Admin-only controls */}
              {adminAuthed && (
                <div style={{ marginTop: 14, textAlign: "left" }}>
                  <div style={{ fontWeight: 900, marginBottom: 10 }}>Admin View Controls</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button style={{ ...styles.smallBtn }} onClick={() => setHideNames((v) => !v)}>
                      {hideNames ? "Show Student Names" : "Hide Student Names"}
                    </button>

                    <button
                      style={{ ...styles.smallBtn }}
                      onClick={() => setShowUnderstandingLog((v) => !v)}
                    >
                      {showUnderstandingLog ? "Hide Tap Log" : "Show Tap Log (with time)"}
                    </button>
                  </div>

                  {/* Per-student totals */}
                  <div style={{ marginTop: 14, fontWeight: 900 }}>Per-student totals</div>
                  {Object.keys(perStudentCounts).length === 0 ? (
                    <div style={{ opacity: 0.8, marginTop: 6 }}>No taps yet for this date.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      {Object.entries(perStudentCounts).map(([name, c]) => (
                        <div key={name} style={styles.perStudentRow}>
                          <div style={{ fontWeight: 900 }}>{displayActor(name, "student")}</div>
                          <div style={{ opacity: 0.95 }}>
                            RED {c.red} · YELLOW {c.yellow} · GREEN {c.green}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tap log with timestamps */}
                  {showUnderstandingLog && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Tap Log (PT time)</div>
                      {ucTaps.length === 0 ? (
                        <div style={{ opacity: 0.8 }}>No taps yet.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                          {ucTaps.map((t) => (
                            <div key={t.id} style={styles.logItem}>
                              <div style={{ fontWeight: 900 }}>
                                {displayActor(t.actor, t.role)} · {String(t.color).toUpperCase()}
                              </div>
                              <div style={{ opacity: 0.85, marginTop: 4 }}>
                                {formatTsPT(t.createdAt)} (PT)
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Questions */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Questions</div>

          {!logViewerAuthed ? (
            gatedMessage
          ) : (
            <>
              <textarea
                style={styles.textarea}
                placeholder={
                  !authReady
                    ? "Connecting to Firebase..."
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

                  return (
                    <div key={q.id} style={styles.logThread}>
                      <div style={styles.logItem}>
                        <div style={{ fontWeight: 900 }}>
                          {/* role label */}
                          {q.role === "admin" ? (adminAuthed ? "Admin" : "Professor") : "Student"} ·{" "}
                          <span style={{ opacity: 0.92 }}>{displayActor(q.actor, q.role)}</span>
                        </div>

                        <div style={{ opacity: 0.85, marginTop: 4 }}>
                          {formatTsPT(q.createdAt)} (PT)
                        </div>

                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{q.text}</div>

                        {/* ✅ admin reply icon/button */}
                        {adminAuthed && isStudentPost && (
                          <div style={{ marginTop: 10 }}>
                            <button
                              style={styles.smallBtn}
                              onClick={() => {
                                setReplyTarget({ id: q.id, actor: q.actor || "" });
                                setAdminReplyText("");
                              }}
                              title="Reply to this student post"
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
                              <div style={{ fontWeight: 900 }}>
                                {adminAuthed ? "Admin" : "Professor"} ·{" "}
                                <span style={{ opacity: 0.92 }}>{displayActor(r.actor, r.role)}</span>
                              </div>
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

              {/* ✅ reply composer */}
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
                  />

                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                    <button style={styles.btnGreen} onClick={submitAdminReply}>
                      Post Reply
                    </button>
                    <button
                      style={{ ...styles.smallBtn2 }}
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
            </>
          )}
        </div>

        {/* Admin panel */}
        {adminMode && (
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Administrator</div>

            {!adminAuthed ? (
              <div style={styles.pinBox}>
                <div style={styles.pinTitle}>Enter your 4-digit PIN, Administrator.</div>

                {/* ✅ 요청 #5: PIN 노출 방지 */}
                <input
                  style={styles.pinInput}
                  value={adminGatePin}
                  onChange={(e) => setAdminGatePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="PIN"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  autoComplete="off"
                />

                <button style={styles.btnGreen} onClick={adminLogin}>
                  Login as Admin
                </button>

                <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                  (This admin box is professor-only. Students should not use it.)
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    textAlign: "center",
                    color: "#9ae6b4",
                    fontWeight: 900,
                    fontSize: 18,
                  }}
                >
                  Admin logged in
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button style={styles.smallBtn2} onClick={logoutAdmin}>
                    Log out
                  </button>
                </div>

                <div style={{ marginTop: 14, opacity: 0.8, fontSize: 12 }}>
                  Tip: Turn ON “Hide Student Names” before projecting.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ opacity: 0.65, marginTop: 12, fontSize: 12 }}>App ID: {APP_ID}</div>

        {/* tiny admin toggle */}
        <div style={{ marginTop: 12 }}>
          <button
            style={styles.tinyAdminBtn}
            onClick={() => setAdminMode((v) => !v)}
            title="Professor-only admin toggle"
          >
            {adminMode ? "Hide Admin" : "Admin"}
          </button>
        </div>
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
  title: { fontSize: 34, fontWeight: 900, marginTop: 10 },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 18,
    fontWeight: 800,
    color: "#ff7a18",
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
  perStudentRow: {
    padding: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
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
    minWidth: 160,
  },
  trafficShell: {
    width: 110,
    margin: "0 auto",
    padding: 14,
    borderRadius: 18,
    background: "#0b1220",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  lightBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  },
  lightCircle: {
    width: 52,
    height: 52,
    borderRadius: "999px",
    boxShadow: "inset 0 0 0 5px rgba(255,255,255,0.15), 0 8px 20px rgba(0,0,0,0.35)",
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
