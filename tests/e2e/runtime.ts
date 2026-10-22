const port = Number(process.env.PLAYWRIGHT_PORT ?? "3100");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535.");
}

export const e2eBaseURL = `http://127.0.0.1:${port}`;
export const e2eOrigin = new URL(e2eBaseURL).origin;
