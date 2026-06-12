import {
    buildClusterProperties,
    clusterTopicKey,
    computeDonutSegments,
    donutDiameter,
    donutSvg,
} from '../map/donut';
import {
    CLUSTER_OTHER_KEY,
    CLUSTER_TOPIC_PROPERTY_CAP,
    DONUT_MAX_SEGMENTS,
    DONUT_OTHER_COLOR,
} from '../map/constants';

const topic = (id: string, colorHex = '#112233') => ({ id, colorHex });

describe('buildClusterProperties', () => {
    it('emits one stable, sorted accumulator per topic', () => {
        const properties = buildClusterProperties(['b-topic', 'a-topic', 'b-topic']);
        expect(Object.keys(properties)).toEqual([clusterTopicKey('a-topic'), clusterTopicKey('b-topic')]);
        expect(properties[clusterTopicKey('a-topic')]).toEqual([
            '+',
            ['case', ['==', ['get', 'topicId'], 'a-topic'], 1, 0],
        ]);
    });

    it('is key-stable regardless of input order', () => {
        const a = buildClusterProperties(['x', 'y', 'z']);
        const b = buildClusterProperties(['z', 'x', 'y']);
        expect(Object.keys(a)).toEqual(Object.keys(b));
    });

    it('caps direct properties and accumulates overflow topics into one key', () => {
        const ids = Array.from({ length: CLUSTER_TOPIC_PROPERTY_CAP + 3 }, (_, i) =>
            `topic-${String(i).padStart(2, '0')}`);
        const properties = buildClusterProperties(ids);
        expect(Object.keys(properties)).toHaveLength(CLUSTER_TOPIC_PROPERTY_CAP + 1);
        const overflow = properties[CLUSTER_OTHER_KEY];
        expect(overflow[0]).toBe('+');
        expect(JSON.stringify(overflow)).toContain('topic-24');
    });
});

describe('computeDonutSegments', () => {
    it('extracts per-topic counts ordered by size', () => {
        const segments = computeDonutSegments(
            { [clusterTopicKey('a')]: 2, [clusterTopicKey('b')]: 5 },
            [topic('a', '#aaa'), topic('b', '#bbb')],
            7,
        );
        expect(segments).toEqual([
            { topicId: 'b', color: '#bbb', count: 5 },
            { topicId: 'a', color: '#aaa', count: 2 },
        ]);
    });

    it('buckets untopiced remainder into a neutral segment', () => {
        const segments = computeDonutSegments({ [clusterTopicKey('a')]: 4 }, [topic('a')], 10);
        expect(segments).toHaveLength(2);
        expect(segments[1]).toEqual({ topicId: 'other', color: DONUT_OTHER_COLOR, count: 6 });
    });

    it('spills smaller topics into the other bucket beyond the segment cap', () => {
        const properties: Record<string, number> = {};
        const topics = Array.from({ length: 8 }, (_, i) => topic(`t${i}`));
        topics.forEach((t, i) => { properties[clusterTopicKey(t.id)] = i + 1; }); // counts 1..8
        const segments = computeDonutSegments(properties, topics, 36);
        expect(segments).toHaveLength(DONUT_MAX_SEGMENTS);
        // Top 4 by count (8,7,6,5), the rest (4+3+2+1=10) merged into other
        expect(segments.map(s => s.count)).toEqual([8, 7, 6, 5, 10]);
        expect(segments[DONUT_MAX_SEGMENTS - 1].topicId).toBe('other');
    });

    it('keeps exactly DONUT_MAX_SEGMENTS named topics when they fit without remainder', () => {
        const properties: Record<string, number> = {};
        const topics = Array.from({ length: DONUT_MAX_SEGMENTS }, (_, i) => topic(`t${i}`));
        topics.forEach((t, i) => { properties[clusterTopicKey(t.id)] = i + 1; });
        const segments = computeDonutSegments(properties, topics, 15);
        expect(segments).toHaveLength(DONUT_MAX_SEGMENTS);
        expect(segments.every(s => s.topicId !== 'other')).toBe(true);
    });

    it('counts the overflow cluster property into the other bucket', () => {
        const segments = computeDonutSegments(
            { [clusterTopicKey('a')]: 3, [CLUSTER_OTHER_KEY]: 4 },
            [topic('a')],
            7,
        );
        expect(segments[1]).toEqual({ topicId: 'other', color: DONUT_OTHER_COLOR, count: 4 });
    });

    it('represents a fully-untopiced cluster as a single neutral segment', () => {
        const segments = computeDonutSegments({}, [topic('a')], 12);
        expect(segments).toEqual([{ topicId: 'other', color: DONUT_OTHER_COLOR, count: 12 }]);
    });
});

describe('donutDiameter', () => {
    it('steps by cluster size buckets', () => {
        expect(donutDiameter(2)).toBe(30);
        expect(donutDiameter(9)).toBe(30);
        expect(donutDiameter(10)).toBe(38);
        expect(donutDiameter(25)).toBe(38);
        expect(donutDiameter(26)).toBe(46);
        expect(donutDiameter(100)).toBe(46);
        expect(donutDiameter(101)).toBe(54);
        expect(donutDiameter(500)).toBe(54);
        expect(donutDiameter(501)).toBe(62);
    });
});

describe('donutSvg', () => {
    it('renders one path per segment plus the count', () => {
        const svg = donutSvg(
            [
                { topicId: 'a', color: '#aa0000', count: 5 },
                { topicId: 'b', color: '#00bb00', count: 3 },
            ],
            8,
        );
        expect(svg.match(/<path /g)).toHaveLength(2);
        expect(svg).toContain('>8</text>');
        expect(svg).toContain('#aa0000');
        expect(svg).toContain('stroke="#ffffff"');
    });

    it('renders a single full ring without separators', () => {
        const svg = donutSvg([{ topicId: 'a', color: '#aa0000', count: 4 }], 4);
        expect(svg.match(/<path /g)).toHaveLength(1);
        expect(svg).not.toContain('stroke=');
        expect(svg).not.toContain('NaN');
    });

    it('sizes the svg by the count bucket', () => {
        const svg = donutSvg([{ topicId: 'a', color: '#aa0000', count: 120 }], 120);
        expect(svg).toContain('width="54"');
        expect(svg).toContain('height="54"');
    });
});
