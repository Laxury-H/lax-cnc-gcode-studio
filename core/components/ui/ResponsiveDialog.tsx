"use client";

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import styles from "./ResponsiveDialog.module.css";

type DialogSize = "medium" | "large" | "wide";
type DialogHeight = "auto" | "medium" | "tall";

interface ResponsiveDialogProps {
  children: ReactNode;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  size?: DialogSize;
  height?: DialogHeight;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let openDialogCount = 0;
let previousBodyOverflow = "";

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hasAttribute("hidden") &&
      element.getClientRects().length > 0,
  );
}

export function ResponsiveDialog({
  children,
  onClose,
  titleId,
  descriptionId,
  size = "medium",
  height = "auto",
  className,
}: ResponsiveDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const animationFrame = window.requestAnimationFrame(() => {
      const initialTarget =
        dialog?.querySelector<HTMLElement>("[data-dialog-autofocus]") ??
        (dialog ? getFocusableElements(dialog)[0] : null) ??
        dialog;
      initialTarget?.focus({ preventScroll: true });
    });

    if (openDialogCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogCount += 1;

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentDialog = dialogRef.current;
      if (!currentDialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(currentDialog);
      if (!focusable.length) {
        event.preventDefault();
        currentDialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || activeElement === currentDialog)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown, true);

      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCloseRef.current();
  };

  const dialogClassName = [
    styles.dialog,
    styles[`size${size[0].toUpperCase()}${size.slice(1)}`],
    styles[`height${height[0].toUpperCase()}${height.slice(1)}`],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.overlay} onMouseDown={closeFromBackdrop} role="presentation">
      <div
        ref={dialogRef}
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
