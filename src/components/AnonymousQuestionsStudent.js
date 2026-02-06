import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const APP_ID =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_APP_ID) ||
  "default-app-id";

const litePath = (colName) => `/artifacts/${APP_ID}/public/data/lite/${colName}`;

export default function AnonymousQuestionsStudent({ classId, sessionId, canSubmit, studentName }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");

  const submit = async () => {
    if (!studentName) {
      setStatus("Please login first.");
      setTimeout(() => setStatus(""), 1200);
      return;
    }
    if (!text.trim()) return;

    if (!canSubmit) {
      setStatus("Locked outside class time.");
      setTimeout(() => setStatus(""), 1200);
      return;
    }

    try {
      await addDoc(collection(db, litePath("questions")), {
        classId,
        sessionId,
        text: text.trim(),
        // lite 버전은 화면상 “anonymous”, 하지만 admin 전용으로 studentName은 저장
        studentName,
        createdAt: serverTimestamp(),
        adminReply: "",
        repliedAt: null,
      });

      setText("");
      setStatus("Submitted!");
      setTimeout(() => setStatus(""), 900);
    } catch (e) {
      console.error(e);
      setStatus("Failed (rules/config).");
      setTimeout(() => setStatus(""), 1400);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-slate-300 mb-3">
        Ask anything. Your name is not shown to others in Lite.
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full min-h-[140px] bg-slate-800 border border-slate-500 rounded-2xl p-4 text-lg"
        placeholder="Type your anonymous question here..."
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || !text.trim()}
        className={[
          "mt-3 px-6 py-3 rounded-xl font-extrabold",
          (!canSubmit || !text.trim())
            ? "bg-slate-700 opacity-60 cursor-not-allowed"
            : "bg-orange-500 hover:bg-orange-600",
        ].join(" ")}
      >
        Submit
      </button>

      {status ? <div className="mt-2 font-bold text-slate-100">{status}</div> : null}

      {!canSubmit ? (
        <div className="mt-2 text-slate-400 text-sm">
          View-only right now (outside class time).
        </div>
      ) : null}
    </div>
  );
}
