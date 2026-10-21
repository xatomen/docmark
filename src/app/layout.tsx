import type { Metadata } from "next";
import "./globals.css";
import "../styles/print.css";
import "../styles/document/fonts.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://docmark.jorgegallardo.cl"),
  applicationName: "Docmark",
  title: {
    default: "Docmark",
    template: "%s | Docmark",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
