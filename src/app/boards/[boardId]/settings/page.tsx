import BoardSettingsWorkspace from "@/features/boards/components/board-settings-workspace";

type BoardSettingsPageProps = {
  params: Promise<{
    boardId: string;
  }>;
};

export default async function BoardSettingsPage({ params }: BoardSettingsPageProps) {
  const { boardId } = await params;

  return <BoardSettingsWorkspace boardId={boardId} />;
}
