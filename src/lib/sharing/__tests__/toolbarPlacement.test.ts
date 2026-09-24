import { toolbarPlacement } from '@/lib/sharing/toolbarPlacement';

const viewport = { width: 1200, height: 800 };
const rect = { top: 300, bottom: 340, left: 400, right: 600 };

describe('toolbarPlacement', () => {
    it('centres the button on the selection and hangs it above', () => {
        const style = toolbarPlacement(rect, viewport, true);
        expect(style.left).toBe(500);
        expect(style.transform).toBe('translateX(clamp(-484px, -50%, 684px - 100%))');
        expect(style.bottom).toBe(508);
        expect(style.top).toBeUndefined();
    });

    it('drops below the selection when the top of the viewport leaves no room', () => {
        const style = toolbarPlacement({ ...rect, top: 40, bottom: 80 }, viewport, true);
        expect(style.top).toBe(88);
        expect(style.bottom).toBeUndefined();
    });

    it('stays below on a touch screen, clear of the platform callout', () => {
        expect(toolbarPlacement(rect, viewport, false).top).toBe(348);
    });

    it('keeps the button at the nearer edge when the selection scrolls out of view', () => {
        const below = { ...rect, top: 900, bottom: 940 };
        const above = { ...rect, top: -200, bottom: -160 };
        expect(toolbarPlacement(below, viewport, true).bottom).toBe(12);
        expect(toolbarPlacement(below, viewport, false).top).toBe(744);
        expect(toolbarPlacement(above, viewport, true).top).toBe(12);
    });
});
