import TourEditor from '@/components/admin/TourEditor';

export default async function EditTourPage({ params }: PageProps<'/admin/tours/[slug]'>) {
  const { slug } = await params;
  return <TourEditor slug={slug} />;
}
