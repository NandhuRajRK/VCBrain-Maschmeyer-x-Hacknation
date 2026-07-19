"use client";

import { useEffect, useState } from "react";
import AsciiWave from "./AsciiWave";
import styles from "./SignalLoading.module.css";

const STAGES = [
  "Pulling public signals",
  "Extracting claims",
  "Testing evidence",
  "Forming recommendation",
];

export default function SignalLoading() {
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 1400);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className={styles.screen} role="status" aria-live="polite">
      <AsciiWave />
      <div className={styles.content}>
        <p className={styles.eyebrow}>VC Brain</p>
        <h1>Building the decision file</h1>
        <p className={styles.intro}>
          We are collecting signals and separating what is known from what still needs proof.
        </p>

        <ol className={styles.stages}>
          {STAGES.map((stage, index) => (
            <li key={stage} data-active={index === activeStage} data-complete={index < activeStage}>
              <span className={styles.stageMark} aria-hidden="true" />
              <span>{stage}</span>
            </li>
          ))}
        </ol>

        <p className={styles.note}>This can take a moment for a new opportunity.</p>
      </div>
    </main>
  );
}
