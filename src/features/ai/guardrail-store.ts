export type GuardrailOk = { ok: true };

export type GuardrailError = {
  ok: false;
  status: number;
  error: string;
};

export type GuardrailResult = GuardrailOk | GuardrailError;

export type GuardrailRateLimitOptions = {
  userId: string;
  nowMs: number;
  windowMs: number;
  maxCommandsPerWindow: number;
};

export type GuardrailLockOptions = {
  boardId: string;
  nowMs: number;
  ttlMs: number;
};

export type GuardrailStore = {
  checkUserRateLimit(options: GuardrailRateLimitOptions): Promise<GuardrailResult>;
  acquireBoardCommandLock(options: GuardrailLockOptions): Promise<GuardrailResult>;
  releaseBoardCommandLock(boardId: string): Promise<void>;
};
