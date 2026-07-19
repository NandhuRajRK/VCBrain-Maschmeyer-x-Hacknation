import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";
import Sidebar from "./Sidebar";
import AssistantChat from "./AssistantChat";
import AsciiWave from "./AsciiWave";
import AuthProvider from "./AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Iskra",
  description: "Maschmeyer Group intelligence layer for startup sourcing and diligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="grain" suppressHydrationWarning>
        <AuthProvider>
          <div className={styles.shell}>
            <Sidebar />
            <main className={styles.content}>
              <div className={styles.contentWave}><AsciiWave /></div>
              {children}
            </main>
            <AssistantChat />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
