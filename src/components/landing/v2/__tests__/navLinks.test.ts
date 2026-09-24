import { captureLandingAction } from '@/lib/landing/analytics';
import { captureMenuLink, footerGroups } from '../navLinks';

jest.mock('@/lib/landing/analytics', () => ({ captureLandingAction: jest.fn() }));

const mockedCapture = captureLandingAction as jest.MockedFunction<typeof captureLandingAction>;

beforeEach(() => {
    mockedCapture.mockReset();
});

describe('landing menu links', () => {
    it('sends the notifications entry to the picker, and follows its clicks', () => {
        const entry = footerGroups('greece')
            .flatMap((group) => group.links)
            .find((link) => link.labelKey === 'footer.links.notifications');
        expect(entry).toMatchObject({ href: '/notifications', navTarget: 'notifications' });
    });

    it('records a menu click on a followed link as nav_link from the menu', () => {
        captureMenuLink({ label: 'Ενημερώσεις', href: '/notifications', navTarget: 'notifications' });
        expect(mockedCapture).toHaveBeenCalledWith('nav_link', { target: 'notifications', surface: 'menu' });
    });

    it('records nothing for the other menu links', () => {
        captureMenuLink({ label: 'Αναζήτηση', href: '/search' });
        expect(mockedCapture).not.toHaveBeenCalled();
    });
});
