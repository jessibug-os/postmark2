/** Shared initial economy tuning; change alongside purchase-path tests. */
export const HARBOR_ECONOMY = Object.freeze({
  startingCoins: 80,
  wages: Object.freeze({ cafe: 60, delivery: 50, repair: 55 }),
  contribution: 90,
  contributionInterval: 7,
  homes: Object.freeze({ apartment: 900, cottage: 1400 }),
});
