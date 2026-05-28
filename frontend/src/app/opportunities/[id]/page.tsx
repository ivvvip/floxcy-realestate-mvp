import { notFound } from 'next/navigation';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { getDeal } from '@/lib/api';
import { DealDetailClient } from './DealDetailClient';
import { ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  try {
    const deal = await getDeal(id);
    return {
      title: `${deal.title} — Investment Case`,
      description: deal.why_opportunity?.slice(0, 200) ?? undefined,
    };
  } catch {
    return { title: 'Opportunity' };
  }
}

export default async function DealDetailPage({ params }: PageProps) {
  const { id } = await params;
  try {
    const deal = await getDeal(id);
    return (
      <div className="bg-bg">
        <div className="border-b border-border">
          <Container>
            <div className="pt-4 pb-3">
              <Breadcrumbs
                items={[
                  { label: 'Opportunities', href: '/opportunities' },
                  { label: deal.title },
                ]}
              />
            </div>
          </Container>
        </div>
        <Container>
          <div className="py-5">
            <DealDetailClient deal={deal} />
          </div>
        </Container>
      </div>
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
