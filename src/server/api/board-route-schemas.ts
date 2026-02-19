import { z } from "zod";

export const boardTitleBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export const boardPresenceBodySchema = z
  .object({
    active: z.boolean(),
    cursorX: z.number().finite().nullable().optional(),
    cursorY: z.number().finite().nullable().optional(),
  })
  .transform((value) => ({
    active: value.active,
    cursorX: value.cursorX ?? null,
    cursorY: value.cursorY ?? null,
  }));

const nonEmptyString = z.string().trim().min(1);

export const boardAccessActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set-open-edit"),
    openEdit: z.boolean(),
  }),
  z.object({
    action: z.literal("set-open-read"),
    openRead: z.boolean(),
  }),
  z.object({
    action: z.literal("add-editor"),
    editorEmail: nonEmptyString,
  }),
  z.object({
    action: z.literal("remove-editor"),
    editorUid: nonEmptyString,
  }),
  z.object({
    action: z.literal("add-reader"),
    readerEmail: nonEmptyString,
  }),
  z.object({
    action: z.literal("remove-reader"),
    readerUid: nonEmptyString,
  }),
]);

export type BoardTitleBody = z.infer<typeof boardTitleBodySchema>;
export type BoardPresenceBody = z.infer<typeof boardPresenceBodySchema>;
export type BoardAccessAction = z.infer<typeof boardAccessActionSchema>;
