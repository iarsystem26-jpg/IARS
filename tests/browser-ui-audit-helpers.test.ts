import { describe, expect, it } from 'vitest';
import { assertResponsiveDataTreatment, denseResponsiveDataRoutes } from '../scripts/browser-ui-audit-helpers.mjs';

describe('browser responsive-data audit guard', () => {
  it('defines explicit dense-data requirements for the student, attendance, and OSSA ledgers', () => {
    expect(Object.keys(denseResponsiveDataRoutes)).toEqual([
      '/student/records',
      '/admin/attendance',
      '/ossa/dashboard',
    ]);
  });

  it('fails closed when either responsive variant is removed', () => {
    expect(() => assertResponsiveDataTreatment('/student/records', 375, {
      cardCount: 1,
      cardVisible: true,
      tableCount: 0,
      tableVisible: false,
    })).toThrow(/render both desktop tables and mobile cards/i);

    expect(() => assertResponsiveDataTreatment('/student/records', 1440, {
      cardCount: 0,
      cardVisible: false,
      tableCount: 1,
      tableVisible: true,
    })).toThrow(/render both desktop tables and mobile cards/i);
  });

  it('rejects swapped visibility and accepts the intended breakpoint behavior', () => {
    expect(() => assertResponsiveDataTreatment('/admin/attendance', 375, {
      cardCount: 1,
      cardVisible: false,
      tableCount: 1,
      tableVisible: true,
    })).toThrow(/incorrect desktop\/mobile data visibility/i);

    expect(() => assertResponsiveDataTreatment('/admin/attendance', 375, {
      cardCount: 1,
      cardVisible: true,
      tableCount: 1,
      tableVisible: false,
    })).not.toThrow();
    expect(() => assertResponsiveDataTreatment('/admin/attendance', 768, {
      cardCount: 1,
      cardVisible: false,
      tableCount: 1,
      tableVisible: true,
    })).not.toThrow();
  });
});
