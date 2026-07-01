import { findOsektutuNeighbourhood } from '../osektutu';
import { Location } from '../types/onboarding';

const loc = (coordinates: [number, number]): Location => ({ text: 'test', coordinates });

describe('findOsektutuNeighbourhood', () => {
  it('returns null when no locations are provided', () => {
    expect(findOsektutuNeighbourhood([])).toBeNull();
  });

  it('returns null for a location outside the active tiles', () => {
    // Thessaloniki — well outside the Athens pilot tiles.
    expect(findOsektutuNeighbourhood([loc([22.9444, 40.6401])])).toBeNull();
  });

  it('matches a location inside an active Kypseli tile', () => {
    // Center of tile "swbb5u".
    expect(findOsektutuNeighbourhood([loc([23.7298, 37.9955])])).toBe('Kypseli');
  });

  it('matches a location inside an active Vrilissia tile', () => {
    // Center of tile "swbbqq".
    expect(findOsektutuNeighbourhood([loc([23.8348, 38.0484])])).toBe('Vrilissia');
  });

  it('matches when any of several locations falls inside an active tile', () => {
    const locations = [loc([22.9444, 40.6401]), loc([23.7518, 37.9736])]; // 2nd is Pangrati "swbbh2"
    expect(findOsektutuNeighbourhood(locations)).toBe('Pangrati');
  });
});
