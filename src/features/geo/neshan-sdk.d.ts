// Neshan's Leaflet SDK (`@neshan-maps-platform/leaflet`) ships no types: its export is a Leaflet
// build (UMD) whose `L.Map` also takes `key`, `maptype`, `poi` and `traffic`. `map-engine`
// unwraps it and checks it is Leaflet before using it.
declare module '@neshan-maps-platform/leaflet' {
  const sdk: unknown
  export default sdk
}
