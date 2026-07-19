import type { CSSProperties } from "react";
import styles from "./IskraOrb.module.css";

export default function IskraOrb({ size = 64, voiceActive = false, className = "" }: { size?: number; voiceActive?: boolean; className?: string }) {
  return (
    <div
      className={`${styles.orb} ${className}`}
      data-voice={voiceActive}
      style={{ "--orb-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className={styles.halo} />
      <span className={styles.outerShell} />
      <span className={styles.middleShell} />
      <span className={styles.core} />
      <span className={`${styles.flow} ${styles.flowOne}`} />
      <span className={`${styles.flow} ${styles.flowTwo}`} />
      <span className={`${styles.flow} ${styles.flowThree}`} />
      <span className={styles.glint} />
      <span className={styles.particles}>
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{ "--particle": index, "--angle": `${index * 30}deg` } as CSSProperties} />
        ))}
      </span>
    </div>
  );
}
