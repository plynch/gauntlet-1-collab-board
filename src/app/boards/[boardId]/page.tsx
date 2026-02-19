import BoardWorkspace from "@/features/boards/components/board-workspace";

type BoardPageProps = {
  params: Promise<{
    boardId: string;
  }>;
};

/**
 * Handles board page.
 */
export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;

  return <BoardWorkspace boardId={boardId} />;
}
