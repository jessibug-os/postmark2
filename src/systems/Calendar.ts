/**
 * The seasonal calendar. Seasons track the real month (cozy games keep the
 * player's actual clock), so spring feels like spring outside the window.
 * The day-of-year drives the HUD counter, festival dates, and birthdays.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export interface Festival {
  season: Season;
  /** Day of month it lands on. */
  day: number;
  month: number; // 1-12
  name: string;
  blurb: string;
  reward: string; // item id
}

/** One festival per season, on a fixed date. */
export const FESTIVALS: Festival[] = [
  { season: 'spring', month: 4, day: 15, name: 'The Blossom Post', blurb: 'Petals on the plaza and the first mail of spring. Gather fallen blossoms with SPARKS.', reward: 'furn-planter' },
  { season: 'summer', month: 7, day: 15, name: 'The River Regatta', blurb: 'BUOY floats paper boats down the river. Catch the most before they reach the sea.', reward: 'furn-fountain' },
  { season: 'autumn', month: 10, day: 15, name: 'The Lantern Walk', blurb: 'WICK lights the whole town amber. Follow the lanterns and gather fallen leaves.', reward: 'furn-lamp' },
  { season: 'winter', month: 1, day: 15, name: 'The Long Night', blurb: 'The shortest day, the warmest square. PLINK premieres a carol; everyone gathers by the well.', reward: 'furn-postbox' },
];

/** Villager birthdays (month/day). Expect a gift; big friendship bonus. */
export const BIRTHDAYS: Record<string, { month: number; day: number }> = {
  sparks: { month: 3, day: 1 },
  reggie: { month: 6, day: 21 },
  'cataloger-734': { month: 10, day: 31 },
  marigold: { month: 5, day: 12 },
  buoy: { month: 8, day: 8 },
  wick: { month: 11, day: 2 },
  fern: { month: 9, day: 19 },
  plink: { month: 12, day: 25 },
};

export class Calendar {
  /** Debug override for the date (month is 1-12); null = real clock. */
  private override: { month: number; day: number } | null = null;

  private now(): { month: number; day: number; year: number } {
    if (this.override) return { ...this.override, year: 2026 };
    const d = new Date();
    return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
  }

  setOverride(month: number | null, day = 15): void {
    this.override = month === null ? null : { month, day };
  }

  get season(): Season {
    const m = this.now().month;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }

  /** 1-based day within the current season (approx; for the HUD). */
  get dayOfSeason(): number {
    const { month, day } = this.now();
    const first = ((month - 1) % 3); // months into the season
    return first * 30 + day;
  }

  get label(): string {
    return `${SEASON_LABEL[this.season]} ${this.dayOfSeason}`;
  }

  /** Today's festival, if any. */
  festivalToday(): Festival | null {
    const { month, day } = this.now();
    return FESTIVALS.find((f) => f.month === month && f.day === day) ?? null;
  }

  /** The next upcoming festival for the season banner. */
  seasonFestival(): Festival | null {
    return FESTIVALS.find((f) => f.season === this.season) ?? null;
  }

  /** Villager whose birthday is today, if any. */
  birthdayToday(): string | null {
    const { month, day } = this.now();
    for (const [id, b] of Object.entries(BIRTHDAYS)) {
      if (b.month === month && b.day === day) return id;
    }
    return null;
  }

  birthdayOf(id: string): { month: number; day: number } | undefined {
    return BIRTHDAYS[id];
  }
}
