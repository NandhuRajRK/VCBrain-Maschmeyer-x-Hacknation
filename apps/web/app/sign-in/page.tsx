"use client";

import Link from "next/link";
import IskraOrb from "../IskraOrb";
import styles from "./page.module.css";

export default function SignInPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const hostedSignIn = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL;
  return <div className={styles.page}><div className={styles.identity}><IskraOrb size={54} /><h1>Iskra</h1></div><div className={styles.demo}>{configured && hostedSignIn ? <><p>Continue to your firm&apos;s secure identity provider.</p><a href={hostedSignIn}>Sign in to Iskra</a></> : <><p>Authentication is not configured in this local workspace.</p><Link href="/">Continue with demo access</Link></>}</div></div>;
}
