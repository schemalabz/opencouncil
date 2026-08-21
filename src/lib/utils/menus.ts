/**
 * Opens a dialog once the menu that launched it has finished closing.
 *
 * A Radix menu layer — a dropdown, a sheet — puts `pointer-events: none` on
 * <body> and takes a scroll lock for as long as it is open. Opening a dialog in
 * the same tick means two layers add and remove those locks while overlapping,
 * and one can be left behind after the dialog closes: the page then renders
 * normally but ignores every click. Waiting for the closing layer to unmount
 * keeps the locks strictly sequential.
 */
export function openAfterMenuCloses(open: () => void): void {
    // longer than the menus' exit animation (duration-200), so the old layer is gone first
    setTimeout(open, 260);
}
