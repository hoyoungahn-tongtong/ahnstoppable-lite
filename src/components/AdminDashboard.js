import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

const APP_ID =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_APP_ID) ||
  "default-app-id";

const litePath = (colName) => `/artifacts/${APP_ID}/public/data/lite/${colName}`;

export default function AdminDashboard({ classId, sessionId, canSubmit }) {
  const [understanding, setUnderstanding] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [adminPost, setAdminPost] = useState("");
  const [postStatus, setPostStatus] = useState("");

  // understanding logs
  useEffect(() => {
    const qy = query(
      collection(db, litePath("understanding")),
      where("classId", "==", classId),
      where("sessionId", "==", sessionId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUnderstanding(rows);
      },
      (err) => console.error(err)
    );

    return () => unsub();
  }, [classId, sessionId]);

  // questions logs
  useEffect(() => {
    const qy = query(
      collection(db, litePath("questions")),
      where("classId", "==", classId),
      where("sessionId", "==", sessionId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setQuestions(rows);
      },
      (err) => console.error(err)
    );

    return () => unsub();
  }, [classId, sessionId]);

  const summary = useMemo(() => {
    const total = understanding.length;
    const byColor = { red: 0, yellow: 0, green: 0 };
    const byStudent = new Map(); // studentName => {red,yellow,green,total}

    understanding.forEach((u) => {
      const c = u.color;
      if (byColor[c] !== undefined) byColor[c] += 1;
      const name = u.studentName || "Unknown";
      if (!byStudent.has(name)) byStudent.set(name, { red: 0, yellow: 0, green: 0, total: 0 });
      const row = byStudent.get(name);
      if (row[c] !== undefined) row[c] += 1;
      row.total += 1;
    });

    const perStudent = Array.from(byStudent.entries())
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.total - a.total);

    return { total, byColor, perStudent };
  }, [understanding]);

  const replyToQuestion = async (qid, replyText) => {
    try {
      const ref = doc(db, `${litePath("questions")}/${qid}`);
      await updateDoc(ref, { adminReply: replyText, repliedAt: serverTimestamp() });
    } catch (e) {
      console.error(e);
      alert("Reply failed (rules/config).");
    }
  };

  const addAdminAnnouncement = async () => {
    if (!adminPost.trim()) return;
    try {
      await addDoc(collection(db, litePath("admin_posts")), {
        classId,
        sessionId,
        text: adminPost.trim(),
        createdAt: serverTimestamp(),
      });
      setAdminPost("");
      setPostStatus("Posted!");
      setTimeout(() => setPostStatus(""), 900);
    } catch (e) {
      console.error(e);
      setPostStatus("Failed (rules/config).");
      setTimeout(() => setPostStatus(""), 1400);
    }
  };

  return (
    <div className="mt-4 w-full flex flex-col items-center text-center">
      <div className="text-slate-200 font-extrabold text-xl">
        Admin Dashboard — {classId} / {sessionId}
      </div>

      {/* Summary */}
      <div className="mt-4 w-full bg-slate-900/40 border border-slate-600 rounded-2xl p-5">
        <div className="text-2xl font-extrabold mb-3">Understanding Summary</div>

        <div className="flex flex-col items-center gap-2 text-lg">
          <div>Total taps: <span className="font-extrabold">{summary.total}</span></div>
          <div className="flex gap-4 justify-center">
            <div className="font-bold">😟 Red: {summary.byColor.red}</div>
            <div className="font-bold">🤔 Yellow: {summary.byColor.yellow}</div>
            <div className="font-bold">✅ Green: {summary.byColor.green}</div>
          </div>
        </div>

        <div className="mt-5 text-slate-300 font-semibold">
          Per-student counts (admin-only)
        </div>

        <div className="mt-2 w-full max-w-2xl mx-auto">
          {summary.perStudent.length === 0 ? (
            <div className="text-slate-400">No data yet.</div>
          ) : (
            <div className="space-y-2">
              {summary.perStudent.map((s) => (
                <div
                  key={s.name}
                  className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 flex flex-col md:flex-row md:justify-between md:items-center"
                >
                  <div className="font-bold">{s.name}</div>
                  <div className="text-slate-200 font-semibold">
                    😟 {s.red} / 🤔 {s.yellow} / ✅ {s.green} — total {s.total}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Admin can write even for past dates */}
      <div className="mt-4 w-full bg-slate-900/40 border border-slate-600 rounded-2xl p-5">
        <div className="text-2xl font-extrabold mb-3">Admin Notes (for this date)</div>
        <textarea
          value={adminPost}
          onChange={(e) => setAdminPost(e.target.value)}
          className="w-full min-h-[110px] bg-slate-800 border border-slate-500 rounded-2xl p-4 text-lg"
          placeholder="Write an admin note/announcement for this date..."
        />
        <button
          type="button"
          onClick={addAdminAnnouncement}
          disabled={!canSubmit}
          className={[
            "mt-3 px-6 py-3 rounded-xl font-extrabold",
            !canSubmit
              ? "bg-slate-700 opacity-60 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600",
          ].join(" ")}
        >
          Post
        </button>
        {postStatus ? <div className="mt-2 font-bold">{postStatus}</div> : null}
      </div>

      {/* Questions + replies */}
      <div className="mt-4 w-full bg-slate-900/40 border border-slate-600 rounded-2xl p-5">
        <div className="text-2xl font-extrabold mb-3">Questions & Replies</div>

        {questions.length === 0 ? (
          <div className="text-slate-400">No questions for this date.</div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <QuestionCard key={q.id} q={q} onReply={replyToQuestion} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({ q, onReply }) {
  const [reply, setReply] = useState(q.adminReply || "");

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-2xl p-4 text-left">
      <div className="text-slate-200 font-bold">
        Student (admin-only): <span className="text-orange-300">{q.studentName || "Unknown"}</span>
      </div>

      <div className="mt-2 text-white text-lg whitespace-pre-wrap">
        {q.text}
      </div>

      <div className="mt-3 text-slate-300 font-semibold">Admin reply:</div>
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        className="w-full min-h-[80px] bg-slate-900 border border-slate-500 rounded-xl p-3 text-base mt-2"
        placeholder="Write reply..."
      />

      <button
        type="button"
        onClick={() => onReply(q.id, reply)}
        className="mt-3 bg-green-600 hover:bg-green-700 font-extrabold px-5 py-2 rounded-xl"
      >
        Save Reply
      </button>

      {q.adminReply ? (
        <div className="mt-2 text-green-200 font-semibold">
          Saved reply is visible in admin view for past dates too.
        </div>
      ) : null}
    </div>
  );
}
