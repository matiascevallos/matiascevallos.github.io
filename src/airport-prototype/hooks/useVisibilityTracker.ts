import type { VisibilityEvent } from '../types';

export type VisibilityCallback = (event: VisibilityEvent) => void;

export class VisibilityTracker {
  private listener: (() => void) | null = null;

  start(onChange: VisibilityCallback): void {
    this.stop();
    const handler = () => {
      onChange({
        timestamp: new Date().toISOString(),
        type: 'visibility',
        state: document.visibilityState === 'visible' ? 'visible' : 'hidden',
      });
    };
    this.listener = handler;
    document.addEventListener('visibilitychange', handler);
  }

  stop(): void {
    if (this.listener) {
      document.removeEventListener('visibilitychange', this.listener);
      this.listener = null;
    }
  }

  get currentState(): 'visible' | 'hidden' {
    return document.visibilityState === 'visible' ? 'visible' : 'hidden';
  }
}
