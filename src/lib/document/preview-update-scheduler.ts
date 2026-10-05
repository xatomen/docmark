export const PREVIEW_UPDATE_DEBOUNCE_MS = 300;

/** Coalesces derived Preview work without delaying the Markdown source state. */
export class PreviewUpdateScheduler<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(value: T, run: (value: T) => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      run(value);
    }, PREVIEW_UPDATE_DEBOUNCE_MS);
  }

  flush(value: T, run: (value: T) => void): void {
    this.cancel();
    run(value);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
