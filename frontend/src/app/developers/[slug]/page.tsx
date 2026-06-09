import { notFound } from 'next/navigation';
import { OfficialDeveloperDetail } from './OfficialDeveloperDetail';
import { LegacyDeveloperDetail } from './LegacyDeveloperDetail';
import { getOfficialDeveloper, getDeveloperDetail } from '@/lib/api';
import { formatNumber } from '@/lib/format';

export const revalidate = 300;

type Props = { params: { slug: string } };

// Numeric slug → official DLD developer_number; text slug → brand-heuristic
// developer (links from HomeFeaturedDevelopers still use these).
const isOfficial = (slug: string) => /^\d+$/.test(slug);

export async function generateMetadata({ params }: Props) {
  if (isOfficial(params.slug)) {
    try {
      const d = await getOfficialDeveloper(params.slug);
      return {
        title: `${d.developer.developer_name} — Dubai Off-plan Projects (Official DLD)`,
        description: `${d.track_record.project_count} projects · ${formatNumber(d.track_record.total_units)} units · ${d.track_record.active_count} active. Official DLD registry data.`,
      };
    } catch {
      return { title: 'Developer · Floxcy' };
    }
  }
  try {
    const dev = await getDeveloperDetail(params.slug);
    return {
      title: `${dev.name} Projects Dubai`,
      description: `${dev.summary.total_projects} projects · ${formatNumber(dev.summary.total_units)} units · Active in ${dev.summary.areas_served} Dubai areas.`,
    };
  } catch {
    return { title: 'Developer · Floxcy' };
  }
}

export default async function DeveloperDetailPage({ params }: Props) {
  if (isOfficial(params.slug)) {
    try {
      const detail = await getOfficialDeveloper(params.slug);
      return <OfficialDeveloperDetail detail={detail} />;
    } catch {
      return notFound();
    }
  }
  try {
    const detail = await getDeveloperDetail(params.slug);
    return <LegacyDeveloperDetail detail={detail} />;
  } catch {
    return notFound();
  }
}
