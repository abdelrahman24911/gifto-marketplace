/**
 * Plain left-click detection for client-side navigation.
 *
 * Filter pills navigate with router.push inside a transition so the pill can
 * show a pending state while the new list loads. Only a plain left-click
 * may be intercepted — modifier/middle clicks keep their normal browser
 * behaviour (open in a new tab, etc.).
 */

export type LinkClick = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

export function shouldInterceptLinkClick(event: LinkClick): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
