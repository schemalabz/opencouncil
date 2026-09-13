import 'server-only';
import { getImageData } from './remoteImage';

/** A person's portrait for an image, as a bounded embedded PNG; `null` when there is none to show. */
export function getPortraitData(url: string | null | undefined): Promise<string | null> {
    return getImageData(url, { width: 256, height: 256 });
}
