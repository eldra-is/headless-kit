export interface SpinnerProps {
  /**
   * An accessible name ("Loading", "Confirming your payment"). Give it only when nothing around
   * the spinner already says what is happening: without it the spinner is decorative and hidden
   * from assistive technology, which is right inside a region that is itself `aria-busy` or a
   * live region. With it the spinner is `role="img"` — a name, never an announcement.
   */
  label?: string;
}
