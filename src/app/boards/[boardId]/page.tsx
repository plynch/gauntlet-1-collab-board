import BoardWorkspace from "@/features/boards/components/board-workspace";

type BoardPageProps = {
  params: Promise<{
    boardId: string;
  }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;

  return <BoardWorkspace boardId={boardId} />;
}
