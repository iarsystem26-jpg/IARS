# IARS UI Repair and Responsive Polish Design

## Objective

Repair and polish the Institution Attendance and Records System user interface across every existing route while preserving the established blue, gold, and green school branding, existing terminology, data flows, permissions, and user workflows.

The work is a consistency and usability pass, not a visual rebrand or feature redesign.

## Scope

The audit and fixes cover:

- The shared desktop sidebar, mobile header, mobile navigation drawer, theme controls, and page content shell.
- Landing, authentication, registration, and registration-status screens.
- Student dashboard, QR, events, ceremonies, records, and profile screens.
- Mayor scanner, SSG panel, attendance dashboard, member management, and OSSA dashboard screens.
- All existing overlays, confirmation panels, detail dialogs, forms, filters, cards, tables, charts, empty states, loading states, and error states.
- Light and dark themes.
- Responsive layouts from 320-pixel mobile screens through tablet and desktop widths.

Business logic, Firebase integration, mock-backend behavior, role permissions, navigation destinations, and domain wording remain unchanged unless a UI defect prevents the existing workflow from operating.

## Chosen Approach

Create a small shared UI foundation, then migrate and repair existing screens incrementally. This gives the application consistent behavior without replacing working screens or introducing a new visual identity.

Purely surgical changes were rejected because they would leave duplicated and contradictory layout rules. A full redesign was rejected because it would exceed the repair-focused goal and risk disrupting familiar workflows.

## Visual System

### Branding

- Retain the current RMC/IARS blue, gold, green, slate, and white palette.
- Use gold as a restrained emphasis and focus color rather than a large background color.
- Preserve the current seal and IARS naming.
- Keep Nunito and Outfit, with a consistent type scale and readable minimum sizes.

### Layout and Spacing

- Introduce a shared page container with predictable horizontal padding, vertical rhythm, and maximum content widths.
- Use a compact but consistent spacing scale across headings, filter bars, cards, forms, and sections.
- Keep administrative screens information-rich while separating controls, summaries, and data regions visually.
- Keep student-facing screens simpler, with one obvious primary action or focal area per section.

### Components

Shared primitives will cover the patterns that are currently repeated inconsistently:

- Page headers and section headers.
- Surface cards and metric cards.
- Buttons and icon buttons with consistent sizes, disabled states, focus states, and tap targets.
- Text inputs, selects, text areas, file inputs, labels, and validation messages.
- Status badges.
- Modal shells with header, scrollable body, and responsive footer.
- Responsive data regions for tables, cards, filters, and empty states.

Existing specialized content remains in its current feature files; only broadly reusable presentation and interaction behavior moves into shared components.

## Navigation and Page Shell

- Keep the collapsible desktop sidebar and mobile drawer.
- Correct content offsets so collapsed, expanded, tablet, and mobile states do not leave incorrect margins or cover page content.
- Ensure the mobile drawer closes after navigation, on backdrop interaction, and with Escape.
- Prevent background scrolling while the mobile drawer is open.
- Make icon-only collapsed navigation understandable through labels or tooltips and visible focus states.
- Apply safe-area-aware padding to fixed mobile UI where supported.
- Keep primary navigation and profile/logout controls reachable at short viewport heights.

## Dashboard and Data Layouts

- Standardize dashboard page headers, metric cards, filter bars, chart panels, and data sections.
- Let summary grids collapse cleanly from desktop columns to tablet and mobile rows without squeezed labels or clipped values.
- Keep charts responsive and provide stable minimum heights.
- Let dense filter toolbars wrap into full-width mobile controls in a predictable order.
- Keep desktop tables for efficient staff use. On narrow screens, use horizontal scrolling with clear containment or a stacked record presentation when row scanning would otherwise become unusable.
- Avoid viewport-wide overflow and nested scroll areas unless the content specifically requires them.

## Modal and Overlay Behavior

All existing modal-like overlays will use one behavior model:

- A fixed, dimmed backdrop above the application shell.
- A panel constrained to the viewport with mobile edge spacing and a sensible desktop maximum width.
- A non-scrolling header and action footer where needed, with only the content body scrolling.
- Full-width stacked actions on small screens and aligned actions on larger screens.
- Escape-to-close and backdrop-to-close for non-destructive dialogs.
- Clear close labels, visible keyboard focus, and a minimum 44-pixel interactive target.
- Background scroll locking and focus restoration when the modal closes.
- Correct layering when one workflow opens a secondary panel.
- Destructive actions require explicit confirmation and are not dismissed by accidental backdrop interaction.

## Mobile and Accessibility Requirements

- Support widths down to 320 pixels without unintended horizontal page scrolling.
- Use touch targets of at least 44 by 44 pixels for primary interactive controls wherever practical.
- Avoid essential body text below 12 pixels and use larger sizes for form inputs and primary information.
- Preserve usable zoom behavior.
- Provide visible keyboard focus styles and meaningful accessible names for icon-only buttons.
- Add appropriate dialog semantics and relationships for modal titles and descriptions.
- Respect reduced-motion preferences for non-essential transitions.
- Maintain readable color contrast in both themes, including muted text, borders, badges, placeholders, and disabled controls.

## Interaction and Error Handling

- Existing submissions, scanners, exports, filters, and role actions keep their current behavior.
- Loading controls remain stable in size and communicate that an action is in progress.
- Validation and backend errors appear near the affected workflow without breaking layout.
- Empty states state what is missing and, when applicable, offer the next existing action.
- Long names, identifiers, event titles, and status values wrap or truncate deliberately rather than forcing overflow.

## Verification Strategy

Verification will include:

- A clean TypeScript/Vite production build.
- Automated component tests for any new shared interactive primitives where practical.
- Static checks for dialog semantics, accessible labels, and known overflow patterns.
- Route-level smoke checks using the existing mock-authentication path and representative roles.
- Responsive inspection at approximately 320, 375, 768, 1024, and 1440 pixels.
- Light- and dark-theme inspection of representative student, staff, table, form, and modal screens.
- Keyboard checks for navigation drawers, modal opening/closing, focus visibility, and action controls.

## Acceptance Criteria

The repair is complete when:

- All existing routes build and render without new runtime or TypeScript errors.
- No audited route has unintended full-page horizontal overflow at supported widths.
- Navigation, dashboards, forms, tables, and modal panels remain usable at 320 pixels.
- Repeated UI patterns use consistent spacing, sizing, states, and theme treatment.
- Modal panels remain within the viewport and provide reliable keyboard and mobile behavior.
- Existing role-based workflows and business behavior remain intact.
- The school branding remains immediately recognizable.

## Non-Goals

- New attendance features, analytics, roles, or workflows.
- Changes to backend schemas or Firebase security rules.
- Replacing the school branding, logo, or terminology.
- Introducing a large third-party component library.
- Rewriting the application architecture beyond targeted UI component extraction.
