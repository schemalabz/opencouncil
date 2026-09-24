import { announcePreview, announceSwitch } from '@/components/meetings/bar/modeAnnounce';

describe('the mode name over the bands', () => {
    it('plays after a plain switch', () => {
        expect(announceSwitch(null, 'subjects', 1)).toEqual({ mode: 'subjects', key: 1, phase: 'play' });
    });

    it('holds while the other cell is hovered and goes when the mouse leaves', () => {
        const held = announcePreview(null, 'subjects', 1);
        expect(held).toEqual({ mode: 'subjects', key: 1, phase: 'hold' });
        expect(announcePreview(held, null, 2)).toBeNull();
    });

    it('releases a held name when its cell is clicked, without a second fade-in', () => {
        const held = announcePreview(null, 'subjects', 1);
        expect(announceSwitch(held, 'subjects', 2)).toEqual({ mode: 'subjects', key: 2, phase: 'release' });
    });

    it('plays a switch to a mode the hover did not show', () => {
        const held = announcePreview(null, 'subjects', 1);
        expect(announceSwitch(held, 'speakers', 2).phase).toBe('play');
    });

    it('replaces a running name with a held one, and leaves a running one alone when the mouse leaves', () => {
        const playing = announceSwitch(null, 'subjects', 1);
        expect(announcePreview(playing, 'speakers', 2)).toEqual({ mode: 'speakers', key: 2, phase: 'hold' });
        expect(announcePreview(playing, null, 3)).toBe(playing);
    });
});
