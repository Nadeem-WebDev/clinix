import { DAYS_OF_WEEK } from "../models/Clinic.js";
import { dateStrOf, localTimeOf } from "./dateRange.js";

const DAY_NAMES = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// "17:30" -> "5:30 PM": what the front desk reads in the error message.
export function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Weekday of a 'YYYY-MM-DD' calendar date, as a DAYS_OF_WEEK name.
export function weekdayOf(dateStr) {
  const sundayFirst = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
  return DAYS_OF_WEEK[(sundayFirst + 6) % 7];
}

// Whether a booking of `durationMinutes` from `scheduledAt` fits inside one
// of the doctor's sessions that day, on the clinic's clock. A doctor with no
// fixed hours always fits. `day` and `sessions` describe the day checked, for
// the caller's message.
export function checkDoctorHours(doctor, scheduledAt, durationMinutes, tz) {
  const hours = doctor.doctorProfile?.workingHours;
  if (!hours?.length) return { fits: true };

  const day = weekdayOf(dateStrOf(scheduledAt, tz));
  const entry = hours.find((d) => d.day === day);
  const sessions = entry?.isAvailable ? entry.sessions : [];
  const start = toMinutes(localTimeOf(scheduledAt, tz));
  const end = start + durationMinutes;
  const fits = sessions.some(
    (s) => toMinutes(s.start) <= start && end <= toMinutes(s.end),
  );
  return {
    fits,
    day,
    sessions: sessions.map(({ start: s, end: e }) => ({ start: s, end: e })),
  };
}

export function outsideHoursMessage(doctorName, { day, sessions }) {
  if (sessions.length === 0)
    return `Dr. ${doctorName} doesn't see patients on ${DAY_NAMES[day]}s.`;
  const ranges = sessions
    .map((s) => `${formatTime12h(s.start)}-${formatTime12h(s.end)}`)
    .join(" and ");
  return `That time is outside Dr. ${doctorName}'s hours. On ${DAY_NAMES[day]}s they see patients ${ranges}.`;
}
