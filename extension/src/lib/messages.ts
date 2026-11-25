// Runtime message shapes between the extension's own parts. Pages never see
// these; the page <-> extension protocol is in entrypoints/bridge.content.ts.
export type ToBackground =
  | { type: 'fr:hello' }
  | { type: 'fr:report'; on: boolean }
  | { type: 'fr:state'; tabId: number }
  | { type: 'fr:toggle'; tabId: number; on?: boolean }
  | { type: 'fr:openPdf'; tabId: number; url?: string }
  | { type: 'fr:simplify'; text: string; context?: string }
  | { type: 'fr:syncSites' }
  | { type: 'fr:bridge:pending' }
  | { type: 'fr:bridge:delivered'; id: string };

export type ToContent =
  | { type: 'fr:ping' }
  | { type: 'fr:set'; on: boolean }
  | { type: 'fr:toast'; message: string };

export interface TabState {
  tabId: number;
  url: string | null;
  on: boolean;
  /** Scripts cannot run here (browser pages, web store, PDF viewer...). */
  restricted: boolean;
  pdf: boolean;
  origin: string | null;
  autoOn: boolean;
  error: string | null;
  busy: string | null;
}

export interface SimplifyResult {
  ok: boolean;
  plain?: string;
  error?: string;
}
