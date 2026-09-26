// Android/Chromium PWA install chip. 'beforeinstallprompt' is captured when it
// fires, Chromium's own mini-infobar is suppressed, and a small INSTALL chip
// appears on the TITLE screen only — the chip lives inside the title section,
// so screen visibility gates it for free. Click prompts, then hides no matter
// the outcome. Standalone sessions never see it. Entirely UI-internal: no
// api.ts surface, safe no-op where the event never fires (iOS/Firefox).
import { button } from './dom';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
}

export interface InstallChip {
  root: HTMLElement;
  destroy(): void;
}

export function buildInstallChip(): InstallChip {
  const root = button('ob-chip ob-chip--ghost ob-int ob-install', '<span>INSTALL</span>');
  root.style.display = 'none';

  let deferred: InstallPromptEvent | null = null;

  const isStandalone = (): boolean => {
    try {
      if (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches
      ) {
        return true;
      }
      // iOS Safari's non-standard flag (its A2HS has no prompt event)
      return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
      return false;
    }
  };

  const sync = (): void => {
    root.style.display = deferred !== null && !isStandalone() ? '' : 'none';
  };

  const onPrompt = (e: Event): void => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    sync();
  };
  const onInstalled = (): void => {
    deferred = null;
    sync();
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
  }

  root.addEventListener('click', () => {
    const ev = deferred;
    deferred = null;
    sync();
    if (!ev) return;
    try {
      void ev.prompt();
    } catch {
      // prompt unavailable (throttled / already handled) — chip stays hidden
    }
  });

  sync(); // an already-installed session never sees the chip

  return {
    root,

    destroy(): void {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      deferred = null;
    },
  };
}
