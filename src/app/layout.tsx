import type { Metadata } from "next";
import "./globals.css";
import "../styles/print.css";
import "../styles/document/fonts.css";
import { environmentBuildMarker, getEnvironmentConfig } from "@/lib/environment.mjs";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" data-docmark-build={environmentBuildMarker}>{children}</body>
    </html>
  );
}
