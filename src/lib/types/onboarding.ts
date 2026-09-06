/** A place a reader cares about: an address or a neighbourhood, with its point. */
export type Location = {
    id?: string;
    text: string;
    coordinates: [number, number];
};
