import type { Metadata } from "next";
import "./globals.css";
import "../styles/print.css";
import "../styles/document/fonts.css";
import { getEnvironmentConfig } from "@/lib/environment";
import type { Viewport } from "next";

const environment = getEnvironmentConfig();

export const metadata: Metadata = {
  metadataBase: new URL(environment.siteUrl),
  robots: environment.isIndexable ? undefined : { index: false, follow: false },
  applicationName: "Docmark",
  title: {
    default: "Docmark",
    template: "%s | Docmark",
  },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
