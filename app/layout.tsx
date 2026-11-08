import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "./theme-light.css";
import "./theme-light-overrides.css";

export const metadata: Metadata = {
  title: "Bowen Supply Chain Control Tower",
  description: "Bowen Supply Chain Control Tower",
};

// Applies the saved light / dark choice before the page paints, so it never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
