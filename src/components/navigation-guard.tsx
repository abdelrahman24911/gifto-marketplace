"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type DirtySource = symbol;

type NavigationGuardContextValue = {
  isDirty: () => boolean;
  registerDirty: (source: DirtySource, dirty: boolean) => void;
  requestNavigation: (proceed: () => void) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  isDirty: () => false,
  registerDirty: () => {},
  requestNavigation: (proceed) => proceed(),
});

type NavigationEventLike = Event & {
  canIntercept?: boolean;
  navigationType?: string;
  destination?: {
    index?: number;
    url?: string;
  };
};

type NavigationLike = {
  currentEntry?: {
    index?: number;
    key?: string;
  };
  addEventListener(
    type: "navigate",
    listener: (event: NavigationEventLike) => void,
  ): void;
  removeEventListener(
    type: "navigate",
    listener: (event: NavigationEventLike) => void,
  ): void;
};

type GuardedLinkProps = Omit<
  React.ComponentProps<typeof Link>,
  "href" | "onNavigate"
> & {
  href: string;
};

export function NavigationGuardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const dirtyRef = useRef(false);
  const dirtySourcesRef = useRef(new Map<DirtySource, boolean>());
  const ignoreTraversalRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const registerDirty = useCallback((source: DirtySource, nextDirty: boolean) => {
    dirtySourcesRef.current.set(source, nextDirty);
    const anyDirty = Array.from(dirtySourcesRef.current.values()).some(Boolean);

    dirtyRef.current = anyDirty;
    setDirty((current) => (current === anyDirty ? current : anyDirty));
  }, []);

  const isDirty = useCallback(() => dirtyRef.current, []);

  const requestNavigation = useCallback((proceed: () => void) => {
    if (!dirtyRef.current) {
      proceed();
      return;
    }

    if (pendingRef.current) return;

    pendingRef.current = proceed;
    setPromptOpen(true);
  }, []);

  useEffect(() => {
    if (!dirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!promptOpen) {
      if (dialogRef.current?.open) dialogRef.current.close();
      return;
    }

    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [promptOpen]);

  useEffect(() => {
    const navigation = (
      window as Window & { navigation?: NavigationLike }
    ).navigation;
    if (!navigation) return;
    const activeNavigation = navigation;

    function handleNavigate(event: NavigationEventLike) {
      if (event.navigationType !== "traverse" || !event.canIntercept) return;
      if (!dirtyRef.current) return;

      if (ignoreTraversalRef.current) {
        ignoreTraversalRef.current = false;
        return;
      }

      const destinationIndex = event.destination?.index;
      const currentIndex = activeNavigation.currentEntry?.index;
      if (
        typeof destinationIndex !== "number" ||
        typeof currentIndex !== "number"
      ) {
        return;
      }

      const delta = destinationIndex - currentIndex;
      if (delta === 0) return;

      const destinationUrl = event.destination?.url;
      event.preventDefault();
      requestNavigation(() => {
        if (delta > 0 && destinationUrl) {
          const target = new URL(destinationUrl);
          if (target.origin === window.location.origin) {
            router.push(`${target.pathname}${target.search}${target.hash}`);
            return;
          }
        }

        ignoreTraversalRef.current = true;
        window.history.go(delta);
        window.setTimeout(() => {
          ignoreTraversalRef.current = false;
        }, 1_000);
      });
    }

    navigation.addEventListener("navigate", handleNavigate);
    return () => navigation.removeEventListener("navigate", handleNavigate);
  }, [requestNavigation, router]);

  const handleClose = useCallback(() => {
    pendingRef.current = null;
    setPromptOpen(false);
  }, []);

  const keepEditing = useCallback(() => {
    pendingRef.current = null;
    setPromptOpen(false);
  }, []);

  const discardChanges = useCallback(() => {
    const proceed = pendingRef.current;
    pendingRef.current = null;
    setPromptOpen(false);
    proceed?.();
  }, []);

  const value = useMemo(
    () => ({ isDirty, registerDirty, requestNavigation }),
    [isDirty, registerDirty, requestNavigation],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby="navigation-guard-title"
        aria-describedby="navigation-guard-description"
        onClose={handleClose}
        onCancel={(event) => {
          event.preventDefault();
          keepEditing();
        }}
        className="w-[min(92vw,28rem)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-berry">
            Unsaved changes
          </p>
          <h2
            id="navigation-guard-title"
            className="mt-2 font-display text-2xl leading-tight text-ink"
          >
            Leave without saving?
          </h2>
          <p
            id="navigation-guard-description"
            className="mt-3 text-sm leading-relaxed text-ink-soft"
          >
            Your changes to this occasion have not been saved. If you leave now,
            they will be lost.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={keepEditing}
              className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-soft"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={discardChanges}
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
            >
              Discard changes
            </button>
          </div>
        </div>
      </dialog>
    </NavigationGuardContext.Provider>
  );
}

export function GuardedLink({
  href,
  replace = false,
  scroll,
  ...props
}: GuardedLinkProps) {
  const router = useRouter();
  const { isDirty, requestNavigation } = useContext(NavigationGuardContext);

  function handleNavigate(event: { preventDefault: () => void }) {
    const isHashOnly = typeof href === "string" && href.startsWith("#");
    if (isHashOnly || !isDirty()) return;

    event.preventDefault();
    requestNavigation(() => {
      if (replace) {
        router.replace(href, { scroll });
      } else {
        router.push(href, { scroll });
      }
    });
  }

  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      onNavigate={handleNavigate}
    />
  );
}

export function useGuardedNavigation() {
  const { isDirty, requestNavigation } = useContext(NavigationGuardContext);
  return { isDirty, requestNavigation };
}

export function useUnsavedChangesGuard(dirty: boolean) {
  const { registerDirty } = useContext(NavigationGuardContext);
  const sourceRef = useRef<DirtySource>(Symbol("unsaved-changes-source"));

  useEffect(() => {
    const source = sourceRef.current;
    registerDirty(source, dirty);
    return () => registerDirty(source, false);
  }, [dirty, registerDirty]);
}
