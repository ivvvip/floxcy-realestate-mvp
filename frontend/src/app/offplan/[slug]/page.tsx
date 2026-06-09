import { notFound } from 'next/navigation';
import { OfficialDetail } from './OfficialDetail';
import { LegacyDetail } from './LegacyDetail';
import { getOfficialProject, getOffplanProject } from '@/lib/api';
import { formatNumber } from '@/lib/format';

export const revalidate = 300;

type Props = { params: { slug: string } };

// Numeric slug → official DLD project_number; text slug → transaction-derived
// master-project (links from /areas and /opportunities still use these).
const isOfficial = (slug: string) => /^\d+$/.test(slug);

export async function generateMetadata({ params }: Props) {
  if (isOfficial(params.slug)) {
    try {
      const d = await getOfficialProject(params.slug);
      const o = d.official;
      const name = o.project_name ?? `Project ${o.project_number}`;
      return {
        title: `${name} — Off-plan Dubai (Official DLD)`,
        description: `${name} by ${o.developer_name ?? 'developer'} in ${o.area ?? 'Dubai'} — ${o.percent_completed ?? 0}% complete, ${o.unit_count ?? '—'} units. Official DLD registry data.`,
      };
    } catch {
      return { title: 'Off-plan project · Floxcy' };
    }
  }
  try {
    const p = await getOffplanProject(params.slug);
    return {
      title: `Buy ${p.master_project} Dubai off-plan`,
      description: `${p.master_project} in ${p.area_name ?? 'Dubai'} by ${p.developer_name} — ${formatNumber(p.total_units)} units across ${p.buildings_count} buildings.`,
    };
  } catch {
    return { title: 'Off-plan project · Floxcy' };
  }
}

export default async function OffplanDetailPage({ params }: Props) {
  if (isOfficial(params.slug)) {
    try {
      const detail = await getOfficialProject(params.slug);
      return <OfficialDetail detail={detail} />;
    } catch {
      return notFound();
    }
  }
  try {
    const detail = await getOffplanProject(params.slug);
    return <LegacyDetail detail={detail} />;
  } catch {
    return notFound();
  }
}
