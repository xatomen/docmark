"use client";

import { useEffect, useState } from "react";
import { renderMarkdown } from "@/lib/markdown/render-markdown";

type DocumentPreviewProps = {
  markdown: string;
};

export function DocumentPreview({ markdown }: DocumentPreviewProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    renderMarkdown(markdown)
      .then((renderedHtml) => {
        if (active) {
          setHtml(renderedHtml);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [markdown]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-8">
      {error ? (
        <p role="status" className="text-sm text-muted">
          This document could not be rendered. Your Markdown is still available in the editor.
        </p>
      ) : (
        // HTML reaches this sink only after renderMarkdown's rehype-sanitize step.
        <article
          className="document-theme mx-auto w-full max-w-[48rem] bg-background px-6 py-8 shadow-sm sm:px-10 sm:py-12"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
