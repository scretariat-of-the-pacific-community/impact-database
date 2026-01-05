import FolderDetail from '@/components/profile/FolderDetail';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function FolderDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  return <FolderDetail folderId={id} />;
}
