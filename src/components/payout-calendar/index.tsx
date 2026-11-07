import type { CalendarView } from "@/lib/views/calendar";
import { GridCalendar } from "./grid";

/**
 * Payout calendar adapter (spec 11.3). Bryntum Scheduler needs a licence and its private npm
 * registry; until it is installed the app renders this CSS-grid timeline with the same props and
 * the same drag-to-swap.
 */
export function PayoutCalendar({ view }: { view: CalendarView }) {
  return <GridCalendar view={view} />;
}
