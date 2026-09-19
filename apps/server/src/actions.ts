import {
  purgeUserData,
  type ActionExecutorRegistry,
  type SqlDatabase,
} from "@aldus-palace/core";

/**
 * Executors for the Action Gate, registered by action type.
 *
 * Only the server knows how an action affects the world, so the executors live
 * here, not in core. `user_data_purge` is the first real one: deletion is a
 * critical effect, and it runs only after the proposal is approved.
 */
export function createActionExecutors(db: SqlDatabase): ActionExecutorRegistry {
  return {
    user_data_purge: async (context) => {
      if (context.payload.confirm !== true) {
        throw new Error("confirmation_required");
      }
      const result = await purgeUserData(db, context.userId, { confirm: true });
      if (!result.ok) throw new Error(result.error);
      return result.result;
    },
  };
}
