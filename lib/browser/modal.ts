const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function activateModalFocus(container: HTMLElement, onClose: () => void) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let topLevel: HTMLElement = container;
  while (topLevel.parentElement && topLevel.parentElement !== document.body) topLevel = topLevel.parentElement;
  const inertSiblings = [...document.body.children]
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== topLevel)
    .map((element) => ({ element, inert: element.inert }));
  for (const { element } of inertSiblings) element.inert = true;

  const focusable = () => [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  window.requestAnimationFrame(() => {
    (container.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? focusable()[0] ?? container).focus({ preventScroll: true });
  });

  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusable();
    if (elements.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = elements[0];
    const last = elements.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", keydown);
  return () => {
    document.removeEventListener("keydown", keydown);
    for (const { element, inert } of inertSiblings) element.inert = inert;
    window.requestAnimationFrame(() => previousFocus?.focus({ preventScroll: true }));
  };
}
