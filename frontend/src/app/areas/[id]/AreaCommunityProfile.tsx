import type { AreaCommunityProfile as Profile } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

const DENSITY_LABEL: Record<NonNullable<Profile['density_tier']>, string> = {
  very_high: 'Very High Density',
  high: 'High Density',
  medium: 'Medium Density',
  low: 'Low Density (Spacious)',
};
const DENSITY_TONE: Record<NonNullable<Profile['density_tier']>, string> = {
  very_high: 'text-accent',
  high: 'text-positive',
  medium: 'text-fg',
  low: 'text-fg-muted',
};
const DENSITY_BLURB: Record<NonNullable<Profile['density_tier']>, string> = {
  very_high: 'Very dense — strong rental demand, fast tenant turnover.',
  high: 'Dense residential — healthy renter pool and short voids.',
  medium: 'Balanced — established residents, steady demand.',
  low: 'Spacious — typically larger plots / villa-led, slower turnover.',
};

interface Props {
  profile: Profile | null;
}

/**
 * Community Profile — population, area size, density tier, and density
 * rank (vs other inhabited Dubai communities). Source: Digital Dubai
 * Official Statistics 2024. Renders nothing when the area has no
 * matched population row (e.g. industrial-only zones).
 */
export function AreaCommunityProfile({ profile }: Props) {
  if (!profile || !profile.matched) return null;
  const {
    total_population,
    area_km2,
    population_density,
    density_tier,
    density_rank,
    density_rank_total,
    sector,
  } = profile;

  return (
    <section
      id="community-profile"
      className="card overflow-hidden scroll-mt-28"
    >
      <div className="border-b border-border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg tracking-tight inline-flex items-center gap-1.5">
            <span aria-hidden>👥</span>
            Community Profile
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Sector {sector ?? '—'} · Digital Dubai Official Statistics 2024
          </p>
        </div>
        {density_tier && (
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold',
              density_tier === 'very_high' && 'bg-accent/15 text-accent',
              density_tier === 'high' && 'bg-positive/15 text-positive',
              density_tier === 'medium' && 'bg-fg-muted/15 text-fg',
              density_tier === 'low' && 'bg-fg-muted/15 text-fg-muted',
            )}
          >
            {DENSITY_LABEL[density_tier]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        <ProfileTile
          icon="👥"
          label="Population"
          value={
            total_population != null
              ? `${formatNumber(total_population, 0)}`
              : '—'
          }
          caption="Residents living here"
        />
        <ProfileTile
          icon="📏"
          label="Area size"
          value={area_km2 != null ? `${area_km2.toFixed(1)} km²` : '—'}
          caption="Community footprint"
        />
        <ProfileTile
          icon="🏘️"
          label="Density"
          value={
            population_density != null
              ? `${formatNumber(population_density, 0)} / km²`
              : '—'
          }
          caption="People per square km"
          tone={density_tier ? DENSITY_TONE[density_tier] : undefined}
        />
        <ProfileTile
          icon="📊"
          label="Density rank"
          value={
            density_rank != null && density_rank_total != null
              ? `#${density_rank} of ${density_rank_total}`
              : '—'
          }
          caption="Across Dubai communities"
        />
      </div>

      {density_tier && (
        <p className="px-4 py-2.5 text-[11px] text-fg-muted leading-relaxed border-t border-border">
          {DENSITY_BLURB[density_tier]}
        </p>
      )}
      <p className="px-4 py-2.5 text-[10px] text-fg-subtle border-t border-border">
        Population, area size, and density are official Digital Dubai 2024
        community-level figures. Joined to Floxcy via DLD community code{' '}
        {profile.community_code != null ? `${profile.community_code}` : '—'}.
      </p>
    </section>
  );
}

function ProfileTile({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  caption: string;
  tone?: string;
}) {
  return (
    <div className="bg-bg-card p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'mt-1.5 text-base sm:text-lg font-semibold tabular',
          tone ?? 'text-fg',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] text-fg-subtle leading-relaxed">
        {caption}
      </div>
    </div>
  );
}
