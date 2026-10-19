// The registration script's verdict on the install offer (register-sw.tsx), as the shop layout's
// gate reads it (install-prompt-gate.tsx). A module of its own: the gate is in every shop page's
// bundle, and the prompt's names (install-state.ts) stay in the prompt's chunk.

/** This device may be offered the install: the flag, and its event for a page already hydrated. */
export const MAY_OFFER_FLAG = '__ffMayOffer'
export const MAY_OFFER_EVENT = 'ff:may-offer'
