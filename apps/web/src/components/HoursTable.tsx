import type { FacilityHours } from "@warriorwatch/contract";
import { formatRange, rangeFor } from "@/lib/hours";
import { WEEKDAYS, type Weekday } from "@/lib/time";

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function HoursTable({ hours, today }: { hours: FacilityHours; today: Weekday }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Regular hours</caption>
      <tbody>
        {ORDER.map((d) => (
          <tr key={d} className={d === today ? "font-semibold" : "text-muted"} aria-current={d === today ? "date" : undefined}>
            <th scope="row" className="py-1 pr-4 text-left font-[inherit]">
              {WEEKDAYS[d]}
              {d === today && <span className="sr-only"> (today)</span>}
            </th>
            <td className="tnum py-1 text-right">{formatRange(rangeFor(hours, d))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
