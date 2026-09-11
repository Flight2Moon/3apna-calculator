# Manual smoke checks

`tests/verify.js` proves the *numbers* are right. It cannot prove the *page* is
usable — and the worst bug this calculator has had was purely in the interface:
typing into a field re-rendered that field, dropped focus, and made it
impossible to enter more than one character. Every check below exists because
something actually broke there.

Run these in a real browser before publishing a change. Two minutes.

## Entry

1. **Type a decimal in one go.** Click Albumin, select all, type `3.65`.
   The field must read `3.65` and still have focus. Results update as you type.
   *(Regression guard: fields must never be rebuilt on `input`.)*
2. **Backspace and continue.** Delete back to `3.` and type `9`. The field reads
   `3.9` without losing focus.
3. **Empty a field.** Clear Albumin entirely. Results collapse to
   "Enter all five values…". Click away — the last good value returns.
4. **Out of range.** Enter Albumin `9`. The field turns amber with an
   extrapolation warning, and a prediction is still shown.

## Modes

5. **Out-of-range value survives the mode switch.** With Albumin at `9`, switch
   to Explore. The readout says `9` **and the slider handle sits at the far
   right of a track that extends to 9** — the number and the handle must agree.
   Switch back; the value is still `9`.
6. **AFP slider is logarithmic.** In Explore, drag AFP from end to end. Small
   values must be reachable — roughly half the track below 100 ng/mL.

## Reading

7. **Chart keeps its accessible name.** After any change, the SVG still contains
   a `<title>` describing the three horizons. *(Clearing the chart used to
   delete it.)*
8. **Tabs work from the keyboard.** Focus "Calculator", press → and End. The
   selection follows; only the selected tab is in the tab order.
9. **Zoom to 200 %.** No text is clipped and the page does not scroll sideways
   (the chart may scroll inside its own box — that is intended).
10. **Dark mode.** Switch the OS appearance. Every tier chip, warning and label
    stays legible; nothing renders dark-on-dark.

## Before publishing

11. **No network requests.** Open DevTools → Network, reload. The list must be
    empty apart from the page's own files. Any external request breaks the
    "runs entirely in your browser" claim.
12. **`noindex` still present** while the paper is unpublished — check the
    `robots` meta tag in `index.html` and `robots.txt`.
