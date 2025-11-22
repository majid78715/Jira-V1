import { Comment, CommentEntityType, PublicUser } from "../models/_types";
import { createComment, listComments, recordActivity } from "../data/repositories";

const entityToActivityType: Record<CommentEntityType, string> = {
  TASK: "TASK",
  TIMESHEET: "TIMESHEET"
};

type ListCommentsInput = {
  entityId: string;
  entityType: CommentEntityType;
};

type CreateCommentInput = ListCommentsInput & {
  body: string;
  attachmentIds?: string[];
};

export async function listCommentsForEntity(input: ListCommentsInput): Promise<Comment[]> {
  return listComments({ entityId: input.entityId, entityType: input.entityType });
}

export async function addComment(actor: PublicUser, payload: CreateCommentInput): Promise<Comment> {
  if (!payload.body?.trim()) {
    throw new Error("Comment body is required.");
  }
  const comment = await createComment({
    entityId: payload.entityId,
    entityType: payload.entityType,
    authorId: actor.id,
    body: payload.body,
    attachmentIds: payload.attachmentIds
  });

  const activityEntityType = entityToActivityType[payload.entityType] ?? payload.entityType;
  await recordActivity(
    actor.id,
    "COMMENT_ADDED",
    `Commented on ${payload.entityType.toLowerCase()}`,
    { entityId: payload.entityId, commentId: comment.id, entityType: payload.entityType },
    payload.entityId,
    activityEntityType
  );

  return comment;
}

