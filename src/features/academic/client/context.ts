export type AcademicContextUpdate = {
  academic_year?: string | null;
  semester?: string | null;
};

const eventName = 'academic-context-changed';

export function publishAcademicContext(update: AcademicContextUpdate) {
  window.dispatchEvent(new CustomEvent<AcademicContextUpdate>(eventName, { detail: update }));
}

export function subscribeAcademicContext(listener: (update: AcademicContextUpdate) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<AcademicContextUpdate>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
