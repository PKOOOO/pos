/**
 * Shared `appearance` for Clerk's own components — <SignIn>, <SignUp>,
 * <UserButton>. Clerk's components stay the auth UI; this only re-skins them.
 *
 * Clerk parses these colours itself (it derives hover/active scales from
 * `colorPrimary`), so they are given as hex rather than `var(--primary)`. They
 * are the same hex values the tokens in app/globals.css were generated from —
 * change one, change the other.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#8A1D5A",
    colorPrimaryForeground: "#FFFFFF",
    colorForeground: "#1A1016",
    colorBackground: "#FFFFFF",
    colorMuted: "#F3EDF0",
    colorMutedForeground: "#665260",
    colorInput: "#FFFFFF",
    colorInputForeground: "#1A1016",
    colorBorder: "#9A8592",
    colorRing: "#8A1D5A",
    colorDanger: "#B3261E",
    colorNeutral: "#1A1016",
    borderRadius: "0.625rem",
    // 16px minimum: anything smaller and iOS zooms the page when a field takes
    // focus, which on a phone means the sign-in card jumps out of view.
    fontSize: "1rem",
    fontFamily: "inherit",
  },
  elements: {
    cardBox: "shadow-lg",
    formButtonPrimary: "min-h-11 text-base font-medium",
    formFieldInput: "min-h-11 text-base",
    socialButtonsBlockButton: "min-h-11 text-base",
    footerActionLink: "font-medium underline-offset-4",
  },
};
