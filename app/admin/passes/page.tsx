import PassesView from '@/components/admin/PassesView';

export default async function PassesPage({ searchParams }: PageProps<'/admin/passes'>) {
  const { slug } = await searchParams;
  return <PassesView initialSlug={typeof slug === 'string' ? slug : ''} />;
}
