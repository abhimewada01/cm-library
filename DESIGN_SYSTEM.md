# CM Library mobile design guide

## Visual language

Warm, quiet and practical. Use the existing CM Library identity: chocolate brown controls, restrained rose accents, a soft ivory canvas and white content cards. Icons use Lucide React Native. Avoid decorative gradients and use color to communicate a real status only.

## Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#FFF9F6` | `#171210` | Screen background |
| Primary | `#5A321F` | `#E9AFCB` | Main actions, selected navigation |
| Primary on-color | `#FFFFFF` | `#29151F` | Text/icons on primary controls |
| Accent | `#B83272` | `#F09BC1` | Notice badges and small highlights |
| Surface | `#FFFFFF` | `#211A17` | Cards, dialogs, bottom navigation |
| Soft accent | `#FCE7F3` | `#35212D` | Avatar and icon backgrounds |
| Text | `#35251F` | `#FFF8F4` | Main text |
| Secondary text | `#6D5A51` | `#D4C3BA` | Supporting text; intended to clear AA on canvas |
| Border | `#E8DAD3` | `#4A3931` | Card/input separators |
| Success | `#216B52` | `#75D4AF` | Checked-in and attended states |
| Warning | `#7B4A08` | `#F2C678` | Fee due |
| Error | `#A1253B` | `#FF9AA7` | Actionable errors |

## Type and spacing

- Use the platform system font for fast loading and native text scaling.
- Screen titles: 28–32sp, bold. Card titles: 18–20sp, semibold. Body: 16sp; supporting text: 14sp minimum.
- Keep an 8dp spacing rhythm: 8, 16, 24 and 32dp. Screen gutter is 20dp.
- Cards use a 20dp radius, inputs and buttons 15–16dp, small chips 30dp.
- Interactive controls target at least 48dp high. Long text is allowed to wrap; labels never rely on fixed widths.

## Components

- **Header:** opaque React Navigation header with the logo, product name and subtitle. It stays in its own layout row and cannot overlap scrolling content.
- **Card:** white/dark surface, one-pixel border, 18–20dp padding, no heavy shadow.
- **Primary action:** full-width brown/rose button with a 52–54dp hit area and icon only when it clarifies the task.
- **Status:** grey clock + “Not checked in”; green check + check-in time and a live elapsed timer. No success color while absent.
- **Attendance calendar:** actual current-month dates; attended dates have a green fill and border, other dates remain neutral. A legend explains the colors, with monthly visits and current streak shown as text.
- **Account row:** 64dp row, leading icon, title, optional summary and chevron; whole row is tappable.
- **Loading/error/offline:** brief loading placeholders; retryable request errors; transport errors retain the API’s offline guidance instead of showing fabricated success.

## Screen mockups / implemented flows

The following native screens are implemented in `src/screens/StudentScreens.tsx` and rendered by the Expo app. Toggle Appearance from Profile to review light, dark or system appearance.

### Home

Opaque brand header → first-name greeting and local date → full-width check-in action → check-in state/timer → seat and library chip → monthly calendar, attended legend, monthly count and streak → Notices shortcut. Name/mobile are reserved for Profile.

### Scan

Not checked in: title and one-sentence instruction → camera preview with scan frame → compact permission/error feedback. Checked in: status/time card and ticking elapsed duration → one-tap **Check out now**. This calls the existing authenticated checkout API; students do not need to scan a second time to leave. The permanent QR remains usable for either check-in or check-out if they do scan it.

### Profile

Avatar and identity details in one card → membership QR, membership code and full-screen QR option → Account rows for overdue details, PIN, notices, language, appearance and logout. Full-screen QR temporarily raises brightness and restores the previous brightness on close.

### Overdue

Current month due amount, monthly fee and amount already paid → due date (or a clear instruction to ask the librarian when the API has no due-date policy) → call-librarian action. No fake payment processing is implied.

### Notices

Unread badge in the bottom navigation → dated notice cards. When empty, show a bell icon and concise explanation rather than an empty blank panel.

### Administrator and Super Admin

The existing role-specific panels and API actions are retained. Admin continues to expose dashboard metrics, member management, seat map, fee recording, reports and the permanent attendance QR. Super Admin keeps library profiles, student lists, seat-capacity changes, fee/subscription updates, approvals and reports. Their current layouts remain light; student Appearance selection is currently applied to the student area.

## UX decisions

1. Give Scan a larger central tab and make it the main Home action; arrival attendance is the student’s most frequent task.
2. Checkout uses the authenticated API’s direct action, avoiding a second camera permission/scan on departure.
3. Show student identity only in Profile to reduce repeated content on Home.
4. Replace the attendance dot with a calendar and legend so dates and totals have meaning.
5. Keep status wording and icon/color aligned to avoid a false checked-in success signal.
6. Show the fee amount and contact path without presenting an unsupported online payment flow.
7. Preserve the existing permission, login, role and backend boundaries; no demonstration success state is invented.
