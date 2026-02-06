// src/App.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  where,
} from "firebase/firestore";
import { auth, db, signInAnonymously } from "./firebase";

// =========================
// CONFIG
// =========================
const APP_ID = process.env.REACT_APP_APP_ID || "ahnstoppable-lite";

const COURSES = [
  { id: "ADV 375-01", label: "ADV 375-01" },
  { id: "ADV 375-02", label: "ADV 375-02" },
  { id: "ADV 461", label: "ADV 461" },
];

// ✅ roster (요청대로)
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

// 2026 수업 기간
const COURSE_DATE_RANGE = {
  "ADV 375-01": { start: "2026-01-01", end: "2026-05-08" },
  "ADV 375-02": { start: "2026-01-01", end: "2026-05-08" },
  "ADV 461": { start: "2026-01-01", end: "2026-05-08" },
};

function formatDateKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isClassActiveNow(courseId, now = new Date()) {
  const range = COURSE_DATE_RANGE[courseId];
  if (!range) return false;

  const todayKey = formatDateKey(now);
  if (todayKey < range.start || todayKey > range.end) return false;

  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  if (courseId === "ADV 375-01") {
    if (!(day === 2 || day === 5)) return false;
    return mins >= 8 * 60 && mins < 10 * 60;
  }
  if (courseId === "ADV 375-02") {
    if (!(day === 2 || day === 5)) return false;
    return mins >= 12 * 60 && mins < 14 * 60;
  }
  if (courseId === "ADV 461") {
    if (day !== 3) return false;
    return mins >= 12 * 60 && mins < 16 * 60;
  }
  return false;
}

function firstName(fullName) {
  if (!fullName) return "";
  if (fullName.includes(",")) return fullName.split(",")[1].trim();
  return fullName.split(" ")[0].trim();
}

// ✅ 문서 ID에 쓸 안전한 키
function safeKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_()-]/g, "");
}

// ✅ PIN 저장/조회는 딱 한 곳만 사용
function pinDocId(courseId, name) {
  return `${safeKey(courseId)}__${safeKey(name)}`;
}

function PinAuth({
  selectedName,
  pinRegistered,
  authBusy,
  isAuthed,
  onLogin,
  onRegister,
  errorText,
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  useEffect(() => {
    setPin("");
    setPin2("");
  }, [selectedName, pinRegistered]);

  if (isAuthed) return null;

  if (!selectedName) {
    return <div style={{ opacity: 0.8, marginTop: 12 }}>Select a name first.</div>;
  }

  if (errorText) {
    return (
      <div style={styles.pinBox}>
        <div style={{ color: "#ffb4b4", fontWeight: 900, marginBottom: 8 }}>
          {errorText}
        </div>
        <div style={{ opacity: 0.85 }}>
          (This usually means Firestore rules block read/write, or project config is wrong.)
        </div>
      </div>
    );
  }

  if (pinRegistered) {
    return (
      <div style={styles.pinBox}>
        <div style={styles.pinTitle}>
          Enter your 4-digit PIN, {firstName(selectedName)}.
        </div>

        <input
          style={styles.pinInput}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="PIN"
          inputMode="numeric"
          maxLength={4}
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

      <input
        style={styles.pinInput}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        inputMode="numeric"
        maxLength={4}
      />
      <input
        style={styles.pinInput}
        value={pin2}
        onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="••••"
        inputMode="numeric"
        maxLength={4}
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

function TrafficLight({ disabled, onTap }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center" }}>
      <button disabled={disabled} onClick={() => onTap("red")} style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}>
        <div style={{ ...styles.lightCircle, background: "#e74c3c" }}>
          <span style={{ fontSize: 24 }}>😟</span>
        </div>
      </button>
      <button disabled={disabled} onClick={() => onTap("yellow")} style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}>
        <div style={{ ...styles.lightCircle, background: "#f1c40f" }}>
          <span style={{ fontSize: 24 }}>🤔</span>
        </div>
      </button>
      <button disabled={disabled} onClick={() => onTap("green")} style={{ ...styles.lightBtn, ...(disabled ? styles.btnDisabled : {}) }}>
        <div style={{ ...styles.lightCircle, background: "#2ecc71" }}>
          <span style={{ fontSize: 24 }}>✅</span>
        </div>
      </button>
    </div>
  );
}

export default function App() {
  const [selectedCourse, setSelectedCourse] = useState("ADV 375-01");
  const [selectedDateKey, setSelectedDateKey] = useState("2026-01-27");

  const [fbReady, setFbReady] = useState(false);

  // Student auth
  const [studentName, setStudentName] = useState("");
  const [studentPinRegistered, setStudentPinRegistered] = useState(false);
  const [studentAuthed, setStudentAuthed] = useState(false);

  // Admin auth (고정 계정)
  const adminName = "Administrator";
  const [adminPinRegistered, setAdminPinRegistered] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);

  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState("");

  const [questions, setQuestions] = useState([]);
  const [ucTaps, setUcTaps] = useState([]);
  const [questionText, setQuestionText] = useState("");
  const [adminComment, setAdminComment] = useState("");

  const classActiveNow = useMemo(() => isClassActiveNow(selectedCourse, new Date()), [selectedCourse]);
  const studentCanSubmit = classActiveNow && studentAuthed;
  const adminCanSubmit = adminAuthed;
  const logViewerAuthed = studentAuthed || adminAuthed;

  // localStorage auth flags
  const studentAuthKey = useMemo(
    () => `auth:${APP_ID}:${selectedCourse}:student:${studentName}`,
    [selectedCourse, studentName]
  );
  const adminAuthKey = useMemo(
    () => `auth:${APP_ID}:${selectedCourse}:admin:${adminName}`,
    [selectedCourse]
  );

  // 1) Firebase anonymous sign-in
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await signInAnonymously(auth);
        if (!cancelled) setFbReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) setAuthErr(String(e?.message || e));
        alert("Firebase auth failed. Check firebase config.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Restore local authed
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

  // ✅ 3) Check pin registered (student/admin) — 단일 경로 lite_pins
  const checkPinRegistered = useCallback(async (courseId, name) => {
    if (!fbReady) return { exists: false, error: "" };
    try {
      const ref = doc(db, "lite_pins", pinDocId(courseId, name));
      const snap = await getDoc(ref);
      return { exists: snap.exists(), error: "" };
    } catch (e) {
      console.error(e);
      return { exists: false, error: String(e?.message || e) };
    }
  }, [fbReady]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!fbReady) return;

      // Student
      if (studentName) {
        const r = await checkPinRegistered(selectedCourse, studentName);
        if (!cancelled) {
          setStudentPinRegistered(r.exists);
          setAuthErr(r.error || "");
        }
      } else {
        setStudentPinRegistered(false);
      }

      // Admin (항상 같은 course에 묶어서 1개만 쓰고 싶으면 selectedCourse 대신 "GLOBAL" 같은 값으로 고정해도 됨)
      const a = await checkPinRegistered("ADMIN", adminName);
      if (!cancelled) {
        setAdminPinRegistered(a.exists);
        if (a.error) setAuthErr(a.error);
      }
    })();

    return () => { cancelled = true; };
  }, [fbReady, selectedCourse, studentName, adminName, checkPinRegistered]);

  const loginWithPin = useCallback(async (role, courseId, name, pin) => {
    if (!fbReady) return;
    if (!pin || pin.length !== 4) return alert("PIN must be 4 digits.");

    setAuthBusy(true);
    setAuthErr("");

    try {
      const ref = doc(db, "lite_pins", pinDocId(courseId, name));
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        alert("No PIN found. Please register first.");
        return;
      }

      const savedPin = snap.data()?.pin;
      if (savedPin !== pin) {
        alert("Incorrect PIN.");
        return;
      }

      if (role === "student") {
        setStudentAuthed(true);
        localStorage.setItem(studentAuthKey, "true");
      } else {
        setAdminAuthed(true);
        localStorage.setItem(adminAuthKey, "true");
      }
    } catch (e) {
      console.error(e);
      setAuthErr(String(e?.message || e));
      alert("Login error. See console.");
    } finally {
      setAuthBusy(false);
    }
  }, [fbReady, studentAuthKey, adminAuthKey]);

  const registerWithPin = useCallback(async (role, courseId, name, pin, pin2) => {
    if (!fbReady) return;
    if (!pin || pin.length !== 4) return alert("PIN must be 4 digits.");
    if (pin !== pin2) return alert("PINs do not match.");

    setAuthBusy(true);
    setAuthErr("");

    try {
      // ✅ 이미 있으면 덮어쓰기 방지(학생이 admin을 덮어쓰는 문제 같은 것 예방)
      const ref = doc(db, "lite_pins", pinDocId(courseId, name));
      const existing = await getDoc(ref);
      if (existing.exists()) {
        // 이미 등록된 경우: register 대신 login 유도
        if (role === "student") setStudentPinRegistered(true);
        else setAdminPinRegistered(true);
        alert("PIN already exists for this name. Please Login instead.");
        return;
      }

      await setDoc(ref, {
        appId: APP_ID,
        role,
        courseId,
        name,
        pin,
        createdAt: serverTimestamp(),
      });

      // ✅ 등록 직후 바로 authed
      if (role === "student") {
        setStudentPinRegistered(true);
        setStudentAuthed(true);
        localStorage.setItem(studentAuthKey, "true");
      } else {
        setAdminPinRegistered(true);
        setAdminAuthed(true);
        localStorage.setItem(adminAuthKey, "true");
      }
    } catch (e) {
      console.error(e);
      setAuthErr(String(e?.message || e));
      alert("Register failed (likely Firestore rules). See console.");
    } finally {
      setAuthBusy(false);
    }
  }, [fbReady, studentAuthKey, adminAuthKey]);

  const logoutStudent = useCallback(() => {
    if (!studentName) return;
    localStorage.removeItem(studentAuthKey);
    setStudentAuthed(false);
  }, [studentAuthKey, studentName]);

  const logoutAdmin = useCallback(() => {
    localStorage.removeItem(adminAuthKey);
    setAdminAuthed(false);
  }, [adminAuthKey]);

  // Firestore logs
  useEffect(() => {
    if (!fbReady) return;

    const qQuestions = query(
      collection(db, "lite_questions"),
      where("appId", "==", APP_ID),
      where("course", "==", selectedCourse),
      where("dateKey", "==", selectedDateKey),
      orderBy("createdAt", "asc")
    );

    const qUc = query(
      collection(db, "lite_understanding"),
      where("appId", "==", APP_ID),
      where("course", "==", selectedCourse),
      where("dateKey", "==", selectedDateKey),
      orderBy("createdAt", "asc")
    );

    const unsub1 = onSnapshot(qQuestions, (snap) => {
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsub2 = onSnapshot(qUc, (snap) => {
      setUcTaps(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [fbReady, selectedCourse, selectedDateKey]);

  const submitUnderstanding = useCallback(async (color) => {
    if (!logViewerAuthed) return alert("Please login first.");
    if (!studentCanSubmit && !adminCanSubmit) return;

    const actor = adminCanSubmit ? adminName : studentName;
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
      alert("Failed to submit.");
    }
  }, [logViewerAuthed, studentCanSubmit, adminCanSubmit, adminName, studentName, selectedCourse, selectedDateKey]);

  const submitQuestion = useCallback(async () => {
    if (!logViewerAuthed) return alert("Please login first.");
    if (!questionText.trim()) return;

    const can = studentCanSubmit || adminCanSubmit;
    if (!can) return;

    const actor = adminCanSubmit ? adminName : studentName;
    const role = adminCanSubmit ? "admin" : "student";

    try {
      await addDoc(collection(db, "lite_questions"), {
        appId: APP_ID,
        course: selectedCourse,
        dateKey: selectedDateKey,
        text: questionText.trim(),
        actor,
        role,
        createdAt: serverTimestamp(),
      });
      setQuestionText("");
    } catch (e) {
      console.error(e);
      alert("Failed to post.");
    }
  }, [logViewerAuthed, questionText, studentCanSubmit, adminCanSubmit, adminName, studentName, selectedCourse, selectedDateKey]);

  const submitAdminComment = useCallback(async () => {
    if (!adminAuthed) return alert("Admin login required.");
    if (!adminComment.trim()) return;

    try {
      await addDoc(collection(db, "lite_questions"), {
        appId: APP_ID,
        course: selectedCourse,
        dateKey: selectedDateKey,
        text: `🧑‍🏫 Admin: ${adminComment.trim()}`,
        actor: adminName,
        role: "admin",
        createdAt: serverTimestamp(),
      });
      setAdminComment("");
    } catch (e) {
      console.error(e);
      alert("Failed to comment.");
    }
  }, [adminAuthed, adminComment, selectedCourse, selectedDateKey, adminName]);

  const ucCounts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    for (const t of ucTaps) {
      if (t.color === "red") c.red++;
      if (t.color === "yellow") c.yellow++;
      if (t.color === "green") c.green++;
    }
    return c;
  }, [ucTaps]);

  const statusText = useMemo(() => {
    if (classActiveNow) return "Class is active now — submissions are open.";
    return "Class is NOT active now — you can still view past logs, but student submissions are locked.";
  }, [classActiveNow]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.title}>"Ahn"stoppable Learning:</div>
        <div style={styles.subtitle}>
          Freely Ask, Freely Learn <span style={{ opacity: 0.9 }}>(Lite)</span>
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Course</div>
          <select style={styles.select} value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
            {COURSES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div style={{ marginTop: 12, color: classActiveNow ? "#9ae6b4" : "#ffb4b4", fontWeight: 700 }}>
            {statusText}
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>View Logs for Date</div>
          <div style={{ opacity: 0.85, marginBottom: 8 }}>
            (For now, type date in code or keep default)
          </div>
          <button style={styles.dateBtn} onClick={() => setSelectedDateKey(formatDateKey(new Date()))}>
            {selectedDateKey} (click = today)
          </button>
        </div>

        {/* Student Login */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Student Login</div>

          <div style={{ marginTop: 10 }}>
            <div style={{ opacity: 0.85, marginBottom: 8 }}>Select your name</div>
            <select style={styles.select} value={studentName} onChange={(e) => setStudentName(e.target.value)}>
              <option value="">-- Select --</option>
              {(COURSE_STUDENTS[selectedCourse] || []).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <PinAuth
            selectedName={studentName}
            pinRegistered={studentPinRegistered}
            authBusy={authBusy}
            isAuthed={studentAuthed}
            errorText={authErr}
            onLogin={(pin) => loginWithPin("student", selectedCourse, studentName, pin)}
            onRegister={(p1, p2) => registerWithPin("student", selectedCourse, studentName, p1, p2)}
          />

          {studentAuthed && studentName && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <div style={{ color: "#9ae6b4", fontWeight: 800, fontSize: 20 }}>
                Logged in as {studentName}
              </div>
              <button style={styles.smallBtn2} onClick={logoutStudent}>Log out</button>
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Understanding Check</div>
          <div style={{ opacity: 0.85, marginBottom: 12 }}>Tap a color (you can tap multiple times during class).</div>
          <TrafficLight disabled={!studentCanSubmit && !adminCanSubmit} onTap={submitUnderstanding} />
          {!classActiveNow && <div style={{ marginTop: 12, opacity: 0.8 }}>View-only right now (outside class time).</div>}
          <div style={styles.summaryRow}>
            <div style={styles.summaryBox}>😟 {ucCounts.red}</div>
            <div style={styles.summaryBox}>🤔 {ucCounts.yellow}</div>
            <div style={styles.summaryBox}>✅ {ucCounts.green}</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.sectionTitle}>Anonymous Questions</div>

          <textarea
            style={styles.textarea}
            placeholder={
              studentCanSubmit || adminCanSubmit
                ? "Post a question/comment..."
                : "Submissions are locked right now (outside class time)."
            }
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            disabled={!studentCanSubmit && !adminCanSubmit}
          />

          <button
            style={{ ...styles.btnOrange, marginTop: 10, ...((!studentCanSubmit && !adminCanSubmit) ? styles.btnDisabled : {}) }}
            disabled={!studentCanSubmit && !adminCanSubmit}
            onClick={submitQuestion}
          >
            Add
          </button>

          <div style={{ marginTop: 18, textAlign: "left" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Logs</div>
            {!logViewerAuthed && <div style={{ opacity: 0.85 }}>Login to view logs.</div>}
            {logViewerAuthed && questions.map((qItem) => (
              <div key={qItem.id} style={styles.logItem}>
                <div style={{ fontWeight: 900 }}>
                  {qItem.role === "admin" ? "Admin" : "Student"} ·{" "}
                  <span style={{ opacity: 0.9 }}>{qItem.actor}</span>
                </div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{qItem.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Admin */}
        <div style={styles.card}>
          <div style={styles.sectionTitle}>Administrator</div>

          {!adminAuthed && (
            <PinAuth
              selectedName={adminName}
              pinRegistered={adminPinRegistered}
              authBusy={authBusy}
              isAuthed={adminAuthed}
              errorText={authErr}
              onLogin={(pin) => loginWithPin("admin", "ADMIN", adminName, pin)}
              onRegister={(p1, p2) => registerWithPin("admin", "ADMIN", adminName, p1, p2)}
            />
          )}

          {adminAuthed && (
            <div style={{ marginTop: 12 }}>
              <div style={{ textAlign: "center", color: "#9ae6b4", fontWeight: 900, fontSize: 18 }}>
                Admin logged in
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button style={styles.smallBtn2} onClick={logoutAdmin}>Log out</button>
              </div>

              <div style={{ marginTop: 16, textAlign: "left" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>
                  Admin can post/comment on ANY date
                </div>
                <textarea
                  style={styles.textarea}
                  placeholder="Leave an admin note or reply..."
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                />
                <button style={{ ...styles.btnGreen, marginTop: 10 }} onClick={submitAdminComment}>
                  Post Admin Comment
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ opacity: 0.65, marginTop: 10, fontSize: 12 }}>App ID: {APP_ID}</div>
      </div>
    </div>
  );
}

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
  subtitle: { marginTop: 8, marginBottom: 18, fontSize: 18, fontWeight: 800, color: "#ff7a18" },
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
  lightBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 0 },
  lightCircle: {
    width: 64,
    height: 64,
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.15)",
  },
  summaryRow: { marginTop: 14, display: "flex", gap: 10, justifyContent: "center", alignItems: "center" },
  summaryBox: {
    padding: "8px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontWeight: 900,
    minWidth: 88,
  },
  logItem: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
};
