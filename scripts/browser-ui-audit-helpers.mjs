export const denseResponsiveDataRoutes = Object.freeze({
  '/student/records': Object.freeze({
    cardSelector: '.mobile-data-card[aria-label="Mobile attendance ledger"]',
    tableSelector: '.desktop-data-table table[aria-label="Attendance ledger"]',
  }),
  '/admin/attendance': Object.freeze({
    cardSelector: '.mobile-data-card[aria-label$="attendance record"]',
    tableSelector: '.desktop-data-table table[aria-label="Attendance records"]',
  }),
  '/ossa/dashboard': Object.freeze({
    cardSelector: '.mobile-data-card[aria-label$="sanction record"]',
    tableSelector: '.desktop-data-table table[aria-label="Student sanction roster"]',
  }),
});

export function assertResponsiveDataTreatment(routePath, width, treatment) {
  if (!denseResponsiveDataRoutes[routePath]) return;
  if (!treatment) throw new Error(`${routePath} at ${width}px was not audited for responsive data`);
  if (treatment.tableCount < 1 || treatment.cardCount < 1) {
    throw new Error(`${routePath} at ${width}px must render both desktop tables and mobile cards: ${JSON.stringify(treatment)}`);
  }

  const correctVisibility = width < 768
    ? treatment.cardVisible && !treatment.tableVisible
    : !treatment.cardVisible && treatment.tableVisible;
  if (!correctVisibility) {
    throw new Error(`${routePath} at ${width}px has incorrect desktop/mobile data visibility: ${JSON.stringify(treatment)}`);
  }
}
