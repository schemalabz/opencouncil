// Map style constants live in their own module so that consumers which only
// need the style URLs (e.g. the landing basemap toggle) don't pull the whole
// map component — and with it mapbox-gl — into their bundle.

/** Default OpenCouncil base style. */
export const DEFAULT_MAP_STYLE = 'mapbox://styles/christosporios/cm4icyrf700f201qw75bv27fa';
/** Mapbox satellite imagery with roads/labels — used by the landing's basemap toggle. */
export const SATELLITE_MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';
