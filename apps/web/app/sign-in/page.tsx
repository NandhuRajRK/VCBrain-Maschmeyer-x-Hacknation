"use client";

import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { Sparkle } from "lucide-react";
import styles from "./page.module.css";

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className={styles.page}>
      <div className={styles.identity}><span className={styles.spark}><Sparkle size={34} strokeWidth={1.4} aria-hidden="true" /></span><h1>Iskra</h1></div>
      {configured ? (
        <SignIn routing="hash" forceRedirectUrl="/" />
      ) : (
        <div className={styles.demo}>
          <p>Authentication is not configured in this local workspace.</p>
          <Link href="/">Continue with demo access</Link>
        </div>
      )}
    </div>
  );
}
