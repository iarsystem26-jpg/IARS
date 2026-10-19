# Event Management and Scheduling Design

## Scope

Replace the current combined event form/list with two SSG routes. `/ssg/events` is an event registry that shows ongoing, scheduled, and archived events with search and filters. `/ssg/events/create` is a full-page scheduling form.

## Event Registry

The registry has a Create Event action, free-text search, status filtering, audience filtering, and geofence filtering. It groups filtered records into Ongoing (`active`), Scheduled (`upcoming`), and Archived (`done`) sections and displays dates, recipients, geofence state, attendance-window count, and sanctions.

## Event Scheduling

The form collects title, full details, start date, end date, recipients, geofence configuration, attendance windows, and sanction rules. Recipient selection supports quick toggles for All Students, JHS, SHS, and College plus comma-separated custom groups such as programs, year levels, and sections. Multiple recipient groups can be combined.

Each attendance window contains a time-in, time-out, and late-after threshold in minutes. At least one valid window is required. Geofencing is optional; coordinates and radius are only operational when enabled. Late and absent sanctions each have an independent value and unit.

## Compatibility and Validation

Scheduled events save with status `upcoming`. The first attendance window and overall date range continue populating `startTime` and `endTime`; the absent sanction continues populating legacy `penaltyValue` and `penaltyUnit`. This keeps existing dashboards and scanner flows functional. The scanner uses the configured attendance-window late threshold when present and falls back to fifteen minutes for legacy events.

The Schedule Event button remains disabled until required text, dates, recipients, and at least one valid time window exist. End date cannot precede start date, time-out must follow time-in, and late thresholds cannot be negative.

## Testing

UI tests cover registry grouping/search/filtering, route navigation, dynamic recipient combination, geofence toggling, multiple attendance windows, and the complete scheduled-event payload. Backend tests cover configured late thresholds and the legacy fifteen-minute fallback.
