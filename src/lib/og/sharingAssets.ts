import fs from 'fs';
import path from 'path';
import { OG_FONTS } from './serverAssets';

export const SHARING_OG_FONTS = [...OG_FONTS, {
    name: 'Relative Book Pro',
    data: fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', 'pdf', 'relative-pro-book.ttf')),
    weight: 400 as const,
    style: 'normal' as const,
}];
