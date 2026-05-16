import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오목 대전",
  description: "방 코드로 실시간 오목 대전을 진행하는 Vercel/Supabase 앱"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
